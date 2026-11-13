import { expect, test, type Page } from '@playwright/test';

const jst = (date: string) => new Date(`${date}T10:00:00+09:00`);

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e;
  });
});

test('T20 結婚の挨拶: 返答を隠す→開く→自己評価を保存し、正答率に混ざらない', async ({ page }) => {
  await page.clock.setFixedTime(jst('2026-11-13'));
  await page.goto('./#/scenarios');
  await page.getByRole('link', { name: '結婚の挨拶' }).click();
  await page.getByRole('link', { name: '会話練習をする' }).click();

  // 最初の自分の発言は隠れている
  await expect(page.getByRole('heading', { name: 'あなたの番です' })).toBeVisible();
  await expect(page.getByText('谢谢您二位今天抽时间和我们见面。')).toHaveCount(0);
  await expect(page.getByText('日本語の意味: 今日は私たちに会う時間を作ってくださり、ありがとうございます。')).toBeVisible();
  await page.getByRole('button', { name: '例を見る' }).click();
  await expect(page.getByText('谢谢您二位今天抽时间和我们见面。')).toBeVisible();
  await page.getByRole('button', { name: '言えた', exact: true }).click();

  // 2問目: 直前の相手の発言が文脈として見える
  await expect(page.getByText('2 / 6')).toBeVisible();
  await expect(page.getByRole('region', { name: 'ここまでの会話' })).toContainText('不用客气，有什么事慢慢说。');
  const ratings = ['少し迷った', '言えなかった', '言えた', '言えた', '言えた'];
  for (const r of ratings) {
    await page.getByRole('button', { name: '例を見る' }).click();
    await page.getByRole('button', { name: r, exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: '会話練習の記録' })).toBeVisible();
  await expect(page.locator('.stats')).toContainText('言えた4回');
  await expect(page.locator('.stats')).toContainText('少し迷った1回');
  await expect(page.locator('.stats')).toContainText('言えなかった1回');

  // 学習記録: 自己評価は別に数え、問題の回答・正答率には入らない
  await page.goto('./#/history');
  await expect(page.getByText('会話の自己評価の内訳: 言えた 4・少し迷った 1・言えなかった 1')).toBeVisible();
  const total = page.getByRole('heading', { name: '合計' }).locator('..');
  await expect(total).toContainText('問題の回答（自動採点）0問');
  await expect(total).toContainText('初回正答率—');
  await page.goto('./');
  await expect(page.getByText('今日の会話の自己評価')).toBeVisible();
  await expect(page.locator('.stats')).toContainText('6件');

  // 再訪時に前回の自己評価が見える
  await page.goto('./#/scenarios/family-marriage/talk');
  await page.getByRole('button', { name: '例を見る' }).click();
  await expect(page.getByText('前回の自己評価: 言えた')).toBeVisible();
});

test('T26 ピンイン・訳の切り替えが再起動後も保持される', async ({ page }) => {
  await page.goto('./#/scenarios/family-visit');
  const pinyin = page.getByText('Dǎrǎo le. Xièxie nǐmen yāoqǐng wǒ lái.');
  const ja = page.getByText('お邪魔します。お招きいただきありがとうございます。');
  await expect(pinyin).toBeVisible();
  await page.getByRole('button', { name: 'ピンイン' }).click();
  await expect(page.getByRole('button', { name: 'ピンイン' })).toHaveAttribute('aria-pressed', 'false');
  await expect(pinyin).toHaveCount(0);
  await page.getByRole('button', { name: '日本語訳' }).click();
  await expect(ja).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('打扰了。谢谢你们邀请我来。')).toBeVisible();
  await expect(pinyin).toHaveCount(0);
  await expect(ja).toHaveCount(0);
  await page.goto('./#/settings');
  await expect(page.getByLabel('ピンインを表示する')).not.toBeChecked();
});

test('場面から関連問題（8問）を解ける', async ({ page }) => {
  await page.goto('./#/scenarios/family-clarification');
  await page.getByRole('button', { name: '関連問題を解く（8問）' }).click();
  await expect(page.getByText('1 / 8問')).toBeVisible();
  await expect(page.locator('#question-prompt')).toContainText('もう一度言っていただけますか');
  await page.getByLabel('请您再说一遍，好吗？').check();
  await page.getByRole('button', { name: '回答する' }).click();
  await expect(page.getByRole('heading', { name: '正解', exact: true, level: 2 })).toBeVisible();
  await expect(page.getByText('Qǐng nín zài shuō yí biàn, hǎo ma?')).toBeVisible();
});

test('日本語の選択肢は日本語として表示される', async ({ page }) => {
  await page.goto('./#/practice');
  await page.getByLabel('場面').selectOption({ label: '聞き返す' });
  await page.getByLabel('形式').selectOption({ label: '選択式' });
  await page.getByRole('button', { name: '演習を始める' }).click();
  for (let i = 0; i < 3; i++) {
    await page.locator('.choice').first().click();
    await page.getByRole('button', { name: '回答する' }).click();
    await page.getByRole('button', { name: '次へ' }).click();
  }
  await expect(page.locator('#question-prompt')).toContainText('「我明白了。」の意味');
  await expect(page.getByText('わかりました。', { exact: true })).toHaveAttribute('lang', 'ja');
});

/** テスト専用の非言語音声（440Hzの短い音）を作り、IndexedDBへ保存して発言に結び付ける */
async function attachTestTone(page: Page, audioId: string, store: boolean) {
  await page.evaluate(
    async ({ audioId, store }) => {
      function tone(): Blob {
        const rate = 8000;
        const n = rate / 4;
        const buf = new ArrayBuffer(44 + n * 2);
        const v = new DataView(buf);
        const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
        w(0, 'RIFF');
        v.setUint32(4, 36 + n * 2, true);
        w(8, 'WAVE');
        w(12, 'fmt ');
        v.setUint32(16, 16, true);
        v.setUint16(20, 1, true);
        v.setUint16(22, 1, true);
        v.setUint32(24, rate, true);
        v.setUint32(28, rate * 2, true);
        v.setUint16(32, 2, true);
        v.setUint16(34, 16, true);
        w(36, 'data');
        v.setUint32(40, n * 2, true);
        for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin((2 * Math.PI * 440 * i) / rate) * 8000, true);
        return new Blob([buf], { type: 'audio/wav' });
      }
      const db: IDBDatabase = await new Promise((res, rej) => {
        const r = indexedDB.open('chinese-conversation-study');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const tx = db.transaction(['scenarios', 'audioAssets'], 'readwrite');
      const scenes = tx.objectStore('scenarios');
      const req = scenes.get('family-meal');
      req.onsuccess = () => {
        const s = req.result;
        s.turns[0].audioId = audioId;
        scenes.put(s);
      };
      if (store) {
        const blob = tone();
        tx.objectStore('audioAssets').put({
          packId: 'core-family',
          audioId,
          mimeType: 'audio/wav',
          byteLength: blob.size,
          sha256: 'test-only',
          source: 'E2Eテスト用の合成音',
          license: 'テスト専用',
          blob,
        });
      }
      await new Promise((res, rej) => {
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
      db.close();
    },
    { audioId, store },
  );
}

test('T22 保存済みの音声を再生でき、音声がなければ未収録と表示する', async ({ page }) => {
  await page.goto('./#/scenarios/family-meal');
  await expect(page.getByText('音声未収録', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '再生' })).toHaveCount(0);

  await attachTestTone(page, 'test-tone', true);
  await page.reload();
  await expect(page.getByText('音声あり', { exact: true })).toBeVisible();
  const player = page.getByRole('group', { name: /の音声$/ });
  await expect(player).toHaveCount(1);
  await player.getByLabel('再生速度').selectOption('0.75');
  await player.getByRole('button', { name: '再生' }).click();
  await expect(player.getByRole('button', { name: '一時停止' })).toHaveAttribute('aria-pressed', 'true');
  await expect(player.getByRole('button', { name: '再生' })).toBeVisible({ timeout: 5000 }); // 0.25秒の音が終わる
  await expect(player.getByRole('alert')).toHaveCount(0);

  // 宣言だけあってファイルがない場合
  await attachTestTone(page, 'missing-tone', false);
  await page.reload();
  await expect(page.getByText('音声ファイルが見つかりません（未収録）')).toBeVisible();
});

test('会話練習も幅360pxで横スクロールしない', async ({ page }) => {
  await page.goto('./#/scenarios/family-marriage/talk');
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '例を見る' }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: '言えた', exact: true }).click();
  }
});
