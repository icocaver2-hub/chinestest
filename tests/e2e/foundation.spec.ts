import { expect, test, type Page } from '@playwright/test';

/** 同一origin以外へのHTTP要求を記録する（T18の準備） */
function trackExternalRequests(page: Page, baseURL: string): string[] {
  const origin = new URL(baseURL).origin;
  const external: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== origin) external.push(req.url());
  });
  return external;
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'メインメニュー' });

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e;
  });
});

test('サブパス配信で起動し、同梱サンプル教材が登録される', async ({ page, baseURL }) => {
  const external = trackExternalRequests(page, baseURL!);
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'ホーム', level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'メインメニュー' }).getByRole('link')).toHaveText([
    /ホーム/,
    /会話/,
    /問題/,
    /復習/,
    /教材/,
  ]);

  await nav(page).getByRole('link', { name: /会話/ }).click();
  await expect(page).toHaveURL(/#\/scenarios$/);
  const list = page.getByRole('list', { name: '場面の一覧' });
  await expect(list.getByRole('listitem')).toHaveCount(6);
  await expect(list).toContainText('結婚の挨拶');
  await expect(list.getByRole('listitem').filter({ hasText: '一緒に食事' })).toContainText('関連問題 8問');
  await expect(list.getByRole('listitem').filter({ hasText: '一緒に食事' })).toContainText('音声未収録');
  await expect(list).toContainText('音声未収録');

  // 再読み込みしても重複しない
  await page.reload();
  await expect(page.getByRole('list', { name: '場面の一覧' }).getByRole('listitem')).toHaveCount(6);

  await nav(page).getByRole('link', { name: /教材/ }).click();
  const packs = page.getByRole('list', { name: '登録済みの教材' });
  await expect(packs.getByRole('listitem')).toHaveCount(1);
  await expect(packs).toContainText('問題 48問');

  expect(external).toEqual([]);
});

test('深いURLへ直接アクセスして場面の詳細を表示できる', async ({ page }) => {
  await page.goto('./#/scenarios/family-meal');
  await expect(page.getByRole('heading', { name: '一緒に食事', level: 1 })).toBeVisible();
  await expect(page.getByText('谢谢阿姨。这道菜真好吃！').first()).toBeVisible();
  await expect(page.getByText('Xièxie āyí. Zhè dào cài zhēn hǎochī!').first()).toBeVisible();
  await expect(nav(page).getByRole('link', { name: /会話/ })).toHaveAttribute('aria-current', 'page');
});

test('設定を保存すると再読み込み後も保持され、表示に反映される', async ({ page }) => {
  await page.goto('./#/settings');
  await page.getByLabel('1日の問題数').fill('15');
  await page.getByLabel('ピンインを表示する').uncheck();
  await page.getByRole('button', { name: '保存する' }).click();
  await expect(page.getByRole('status').filter({ hasText: '保存しました' })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('1日の問題数')).toHaveValue('15');
  await expect(page.getByLabel('ピンインを表示する')).not.toBeChecked();

  await page.goto('./#/scenarios/family-meal');
  await expect(page.getByText('谢谢阿姨。这道菜真好吃！').first()).toBeVisible();
  await expect(page.getByText('Xièxie āyí. Zhè dào cài zhēn hǎochī!')).toHaveCount(0);
});

test('範囲外の問題数は保存できない', async ({ page }) => {
  await page.goto('./#/settings');
  await page.getByLabel('1日の問題数').fill('40');
  await expect(page.getByRole('button', { name: '保存する' })).toBeDisabled();
  await expect(page.getByText('5〜30の整数で指定します')).toBeVisible();
});

test('未知のURLと存在しない場面は案内を表示する', async ({ page }) => {
  await page.goto('./#/no-such-page');
  await expect(page.getByRole('heading', { name: 'ページが見つかりません' })).toBeVisible();
  await page.goto('./#/scenarios/no-such-scene');
  await expect(page.getByRole('heading', { name: 'この場面は見つかりません' })).toBeVisible();
});

test('初回にオフラインで教材を取得できなければ、接続が必要と表示し再試行できる', async ({ page }) => {
  await page.route('**/content/**', (route) => route.abort('internetdisconnected'));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: '初回の準備に接続が必要です' })).toBeVisible();
  await page.unroute('**/content/**');
  await page.getByRole('button', { name: '再試行' }).click();
  await expect(page.getByRole('heading', { name: 'ホーム', level: 1 })).toBeVisible();
});

test('幅360pxで横スクロールが発生しない', async ({ page }) => {
  for (const hash of ['#/', '#/scenarios', '#/scenarios/family-marriage', '#/settings', '#/materials']) {
    await page.goto(`./${hash}`);
    await expect(page.locator('main h1, main h2').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, hash).toBeLessThanOrEqual(0);
  }
});
