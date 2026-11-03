import { expect, test, type Page } from '@playwright/test';

/** 日本時間の日中に固定（学習タイムゾーンはAsia/Tokyo） */
const jst = (date: string) => new Date(`${date}T10:00:00+09:00`);

const nav = (page: Page) => page.getByRole('navigation', { name: 'メインメニュー' });

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e;
  });
});

/** 表示中の問題に答える（サンプル教材の3問） */
async function answer(page: Page, correct: boolean) {
  const prompt = (await page.locator('#question-prompt').textContent()) ?? '';
  if (prompt.includes('合う文を選んで')) {
    await page.getByLabel(correct ? '这道菜很好吃。' : '今天天气很好。').check();
  } else if (prompt.includes('並べ替えて')) {
    const order = correct ? ['我', '喜欢', '吃', '鱼'] : ['鱼', '吃', '喜欢', '我'];
    for (const w of order) await page.getByRole('list', { name: '使える語' }).getByRole('button', { name: w, exact: true }).click();
  } else if (prompt.includes('入力してください')) {
    await page.getByLabel('空欄に入る語').fill(correct ? '好吃' : '好喝');
  } else {
    throw new Error(`未知の問題: ${prompt}`);
  }
  await page.getByRole('button', { name: '回答する' }).click();
  await expect(page.getByRole('heading', { name: correct ? /正解/ : /不正解/, level: 2 })).toBeVisible();
}

async function next(page: Page) {
  await page.getByRole('button', { name: '次へ' }).click();
}

async function startToday(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: '今日の学習を始める' }).click();
  await expect(page.locator('#question-prompt')).toBeVisible();
}

/** 今日の学習を最後まで解く。wrongPromptを含む問題だけ通常回答で間違える */
async function solveAll(page: Page, wrongPrompt?: string) {
  for (let i = 0; i < 10; i++) {
    const result = page.getByRole('heading', { name: '結果', level: 1 });
    await expect(page.locator('#question-prompt').or(result)).toBeVisible();
    if (await result.isVisible()) return;
    const prompt = (await page.locator('#question-prompt').textContent()) ?? '';
    const retry = await page.getByText('再挑戦', { exact: true }).isVisible();
    await answer(page, retry || !wrongPrompt || !prompt.includes(wrongPrompt));
    await next(page);
  }
}

test('今日の学習: 不正解→即時再挑戦→結果（初回正答率と再挑戦を分けて表示）', async ({ page }) => {
  await page.clock.setFixedTime(jst('2026-10-23'));
  await startToday(page);
  await expect(page.getByText('1 / 3問')).toBeVisible();

  await answer(page, false); // 選択式を間違える
  await expect(page.getByText('この問題は演習の最後にもう一度出題します。')).toBeVisible();
  await expect(page.getByText('次の復習予定: 2026-10-24')).toBeVisible();
  await next(page);
  await answer(page, true); // 並べ替え
  await next(page);
  await answer(page, true); // 穴埋め
  await next(page);

  await expect(page.getByText('再挑戦', { exact: true })).toBeVisible();
  await answer(page, true);
  await expect(page.getByRole('heading', { name: /正解（再挑戦）/ })).toBeVisible();
  await next(page);

  await expect(page.getByRole('heading', { name: '結果', level: 1 })).toBeVisible();
  await expect(page.getByText('67%')).toBeVisible();
  await expect(page.getByText('（2/3）')).toBeVisible();
  await expect(page.getByText('1/1問 正解')).toBeVisible();
  await expect(page.getByRole('heading', { name: '間違えた問題' })).toBeVisible();

  // 同日: 復習も未学習もない
  await page.goto('./');
  await expect(page.getByText('今日の対象: 0問')).toBeVisible();
  await expect(page.getByRole('button', { name: '今日の学習を始める' })).toBeDisabled();

  // 前回不正解は再挑戦で正解したので外れる
  await nav(page).getByRole('link', { name: /復習/ }).click();
  await page.getByRole('tab', { name: '前回不正解' }).click();
  await expect(page.getByRole('heading', { name: '前回不正解の問題はありません' })).toBeVisible();

  // 翌日: 3問が復習対象
  await page.clock.setFixedTime(jst('2026-10-24'));
  await page.reload();
  await expect(page.getByRole('tab', { name: '今日の復習' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('list', { name: '問題の一覧' }).getByRole('listitem')).toHaveCount(3);
  await page.goto('./');
  await expect(page.getByText('今日の対象: 3問')).toBeVisible();
});

test('完了目安: 不正解→翌日以降の復習→克服→再不正解まで一貫して動く', async ({ page }) => {
  const target = '合う文を選んで';
  await page.clock.setFixedTime(jst('2026-10-23'));
  await startToday(page);
  // 対象の問題をブックマークし、復習画面で状態を追う
  await page.getByRole('button', { name: /ブックマーク/ }).first().click();
  await expect(page.getByRole('button', { name: /ブックマーク済み/ })).toBeVisible();
  await solveAll(page, target);

  for (const day of ['2026-10-24', '2026-10-27', '2026-11-03']) {
    await page.clock.setFixedTime(jst(day));
    await startToday(page);
    await solveAll(page);
  }

  await nav(page).getByRole('link', { name: /復習/ }).click();
  await page.getByRole('tab', { name: 'ブックマーク' }).click();
  const item = page.getByRole('list', { name: '問題の一覧' }).getByRole('listitem');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('克服済み');
  await expect(item).toContainText('2026-11-17');

  // 11/17: 再び間違える → 克服が外れ、翌日が復習日
  await page.clock.setFixedTime(jst('2026-11-17'));
  await startToday(page);
  await solveAll(page, target);
  await nav(page).getByRole('link', { name: /復習/ }).click();
  await page.getByRole('tab', { name: 'ブックマーク' }).click();
  await expect(item).toContainText('学習中');
  await expect(item).toContainText('2026-11-18');
  await expect(item).toContainText('累計不正解2回');
});

test('途中で再読み込みしても続きから再開できる（T14）', async ({ page }) => {
  await page.clock.setFixedTime(jst('2026-10-23'));
  await startToday(page);
  await answer(page, true);
  await page.reload();
  // 保存済みなので次の問題から
  await expect(page.getByText('2 / 3問')).toBeVisible();
  await page.goto('./');
  await expect(page.getByText(/中断した今日の学習があります/)).toBeVisible();
  await page.getByRole('link', { name: '続きから再開' }).click();
  await expect(page.getByText('2 / 3問')).toBeVisible();
});

test('回答ボタンの連打で回答が二重に記録されない（T15）', async ({ page }) => {
  await page.clock.setFixedTime(jst('2026-10-23'));
  await startToday(page);
  await page.getByLabel('这道菜很好吃。').check();
  await page.getByRole('button', { name: '回答する' }).dblclick();
  await expect(page.getByRole('heading', { name: /正解/, level: 2 })).toBeVisible();
  await page.goto('./#/history');
  await expect(page.getByRole('list', { name: '演習の履歴' })).toContainText('1/3問');
});

test('並べ替えはキーボードだけで操作でき、戻す・やり直しができる（T21）', async ({ page }) => {
  await page.clock.setFixedTime(jst('2026-10-23'));
  await page.goto('./#/practice');
  await page.getByLabel('形式').selectOption({ label: '並べ替え' });
  await page.getByRole('button', { name: '演習を始める' }).click();
  const pool = page.getByRole('list', { name: '使える語' });
  await pool.getByRole('button', { name: '鱼', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '1つ戻す' }).click();
  await pool.getByRole('button', { name: '我', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'やり直し' }).click();
  await expect(page.getByRole('button', { name: '回答する' })).toBeDisabled();
  for (const w of ['我', '喜欢', '吃', '鱼']) {
    await pool.getByRole('button', { name: w, exact: true }).focus();
    await page.keyboard.press('Enter');
  }
  await page.getByRole('button', { name: '回答する' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '正解', exact: true, level: 2 })).toBeVisible();
});

test('問題演習の絞り込みとブックマークの保持（T26）', async ({ page }) => {
  await page.clock.setFixedTime(jst('2026-10-23'));
  await page.goto('./#/practice');
  await expect(page.getByText('条件に合う問題: 3問')).toBeVisible();
  await page.getByLabel('形式').selectOption({ label: '穴埋め' });
  await expect(page.getByText('条件に合う問題: 1問')).toBeVisible();
  await page.getByLabel('形式').selectOption({ label: 'すべて' });
  await page.getByLabel('タグ').selectOption('好み');
  await expect(page.getByText('条件に合う問題: 1問')).toBeVisible();
  await page.getByRole('button', { name: '演習を始める' }).click();
  await page.getByRole('button', { name: /ブックマーク/ }).click();
  await expect(page.getByRole('button', { name: /ブックマーク済み/ })).toBeVisible();

  await page.reload();
  await page.goto('./#/practice');
  await page.getByLabel('ブックマークした問題だけ').check();
  await expect(page.getByText('条件に合う問題: 1問')).toBeVisible();
});

test('復習の空状態（T24）', async ({ page }) => {
  await page.goto('./#/review');
  await expect(page.getByRole('heading', { name: '今日が復習日の問題はありません' })).toBeVisible();
  await page.getByRole('tab', { name: '繰り返し間違える' }).click();
  await expect(page.getByRole('heading', { name: '3回以上間違えた未克服の問題はありません' })).toBeVisible();
  await page.getByRole('tab', { name: 'ブックマーク' }).click();
  await expect(page.getByRole('heading', { name: 'ブックマークした問題はありません' })).toBeVisible();
});

test('演習画面も幅360pxで横スクロールしない', async ({ page }) => {
  await page.clock.setFixedTime(jst('2026-10-23'));
  await startToday(page);
  for (let i = 0; i < 3; i++) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await answer(page, true);
    const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow2).toBeLessThanOrEqual(0);
    await next(page);
  }
  for (const hash of ['#/review', '#/practice', '#/history']) {
    await page.goto(`./${hash}`);
    await expect(page.locator('main h1').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, hash).toBeLessThanOrEqual(0);
  }
});
