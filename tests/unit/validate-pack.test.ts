import { describe, expect, it } from 'vitest';
import {
  MAX_PACK_BYTES,
  parsePackText,
  validatePackObject,
  validatePackText,
  type ValidationIssue,
} from '../../src/domain/import-validation';
import { readText, starterPack } from '../helpers/fixtures';

function issuesOf(data: unknown, ctx = {}): ValidationIssue[] {
  const r = validatePackObject(data, ctx);
  if (r.ok) throw new Error('検査を通過してしまいました');
  return r.error;
}

function expectIssue(issues: ValidationIssue[], path: string, messagePart?: string) {
  const hit = issues.find((i) => i.path === path && (messagePart === undefined || i.message.includes(messagePart)));
  expect(hit, `${path} の問題が報告されること。実際: ${JSON.stringify(issues)}`).toBeDefined();
}

describe('サンプル教材', () => {
  it('examples/starter-pack.json が検査を通る', () => {
    const r = validatePackText(readText('examples/starter-pack.json'));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.packId).toBe('sample-meal');
      expect(r.value.scenarios).toHaveLength(1);
      expect(r.value.questions.map((q) => q.type)).toEqual(['single_choice', 'ordering', 'fill_blank']);
    }
  });

  it('同梱用コピー public/content/sample-meal.json もサンプルと同一で検査を通る', () => {
    expect(JSON.parse(readText('public/content/sample-meal.json'))).toEqual(starterPack());
    expect(validatePackText(readText('public/content/sample-meal.json')).ok).toBe(true);
  });

  it('検査は入力を書き換えない', () => {
    const pack = starterPack();
    const before = JSON.stringify(pack);
    validatePackObject(pack);
    expect(JSON.stringify(pack)).toBe(before);
  });
});

describe('ファイルの解析（検査順序1）', () => {
  it('JSONとして壊れていれば拒否する', () => {
    const r = parsePackText('{"schemaVersion": 1,');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error[0]?.message).toContain('JSONとして読み込めません');
  });

  it('Markdownのコードフェンス付きは拒否する', () => {
    const r = parsePackText('```json\n{}\n```');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error[0]?.message).toContain('コードフェンス');
  });

  it('5MiBを超えるファイルは拒否する', () => {
    const r = parsePackText('{}', MAX_PACK_BYTES + 1);
    expect(r.ok).toBe(false);
  });

  it('先頭のBOMは許容する', () => {
    expect(validatePackText(`\ufeff${readText('examples/starter-pack.json')}`).ok).toBe(true);
  });
});

describe('形式の検査（検査順序2）', () => {
  it('未知の版を拒否する', () => {
    const p = starterPack();
    p.schemaVersion = 2;
    expectIssue(issuesOf(p), 'schemaVersion', '版');
  });

  it('必須項目の欠落を位置付きで示す', () => {
    const p = starterPack();
    delete p.questions[0].answerId;
    expectIssue(issuesOf(p), 'questions[0].answerId', '必須');
  });

  it('未知のフィールドを拒否する', () => {
    const p = starterPack();
    p.questions[1].hint = 'x';
    expectIssue(issuesOf(p), 'questions[1].hint', '契約にない');
  });

  it('nullを拒否する', () => {
    const p = starterPack();
    p.scenarios[0].turns[0].audioId = null;
    expectIssue(issuesOf(p), 'scenarios[0].turns[0].audioId', 'null');
  });

  it('IDの形式違反を拒否する', () => {
    const p = starterPack();
    p.packId = 'Sample Meal';
    expectIssue(issuesOf(p), 'packId', 'ID');
  });

  it('空白だけの文字列を拒否する', () => {
    const p = starterPack();
    p.questions[0].explanation = '   ';
    expectIssue(issuesOf(p), 'questions[0].explanation', '空白');
  });

  it('revisionは1以上の整数', () => {
    const p = starterPack();
    p.scenarios[0].revision = 0;
    expectIssue(issuesOf(p), 'scenarios[0].revision');
    p.scenarios[0].revision = 1.5;
    expectIssue(issuesOf(p), 'scenarios[0].revision', '整数');
  });

  it('未知の問題形式は形式エラーだけを示す', () => {
    const p = starterPack();
    p.questions[0].type = 'essay';
    const issues = issuesOf(p);
    expectIssue(issues, 'questions[0].type', '使用できない値');
    expect(issues.filter((i) => i.path.startsWith('questions[0]'))).toHaveLength(1);
  });

  it('listeningにはaudioIdとtranscriptが必要', () => {
    const p = starterPack();
    p.questions[0].presentation = 'listening';
    const issues = issuesOf(p);
    expectIssue(issues, 'questions[0].audioId', '必須');
    expectIssue(issues, 'questions[0].transcript', '必須');
  });

  it('音声のファイル名にパスやURLを使えない', () => {
    const p = starterPack();
    p.audioAssets = [
      { id: 'a1', fileName: '../secret.mp3', mimeType: 'audio/mpeg', source: '自作', license: '私的利用' },
      { id: 'a2', fileName: 'https://example.com/a.mp3', mimeType: 'audio/mpeg', source: '自作', license: '私的利用' },
    ];
    const issues = issuesOf(p);
    expectIssue(issues, 'audioAssets[0].fileName');
    expectIssue(issues, 'audioAssets[1].fileName');
  });

  it('タグの重複を拒否する', () => {
    const p = starterPack();
    p.questions[0].tags = ['食事', '食事'];
    expectIssue(issuesOf(p), 'questions[0].tags', '重複');
  });
});

describe('意味上の検査（検査順序3）', () => {
  it('scenariosとquestionsの両方が空なら拒否する', () => {
    const p = starterPack();
    p.scenarios = [];
    p.questions = [];
    expectIssue(issuesOf(p), '(ルート)', '両方が空');
  });

  it('問題IDの重複を拒否する', () => {
    const p = starterPack();
    p.questions[2].id = p.questions[0].id;
    expectIssue(issuesOf(p), 'questions[2].id', '重複');
  });

  it('シーンIDの重複を拒否する', () => {
    const p = starterPack();
    p.scenarios.push(structuredClone(p.scenarios[0]));
    expectIssue(issuesOf(p), 'scenarios[1].id', '重複');
  });

  it('発言IDの重複と、片方のroleしかない会話を拒否する', () => {
    const p = starterPack();
    p.scenarios[0].turns[1].id = 'turn-1';
    for (const t of p.scenarios[0].turns) t.role = 'learner';
    const issues = issuesOf(p);
    expectIssue(issues, 'scenarios[0].turns[1].id', '重複');
    expectIssue(issues, 'scenarios[0].turns', 'partner');
  });

  it('正解IDが選択肢にない場合を拒否する', () => {
    const p = starterPack();
    p.questions[0].answerId = 'z';
    expectIssue(issuesOf(p), 'questions[0].answerId', '正解ID');
  });

  it('選択肢IDの重複を拒否する', () => {
    const p = starterPack();
    p.questions[0].choices[1].id = 'a';
    expectIssue(issuesOf(p), 'questions[0].choices[1].id', '重複');
  });

  it('並べ替えの正解順序は全トークンを各1回使う', () => {
    const p = starterPack();
    p.questions[1].acceptedOrders = [['t1', 't2', 't3'], ['t1', 't1', 't3', 't4'], ['t1', 't2', 't3', 'x9']];
    const issues = issuesOf(p);
    expectIssue(issues, 'questions[1].acceptedOrders[0]', '各1回');
    expectIssue(issues, 'questions[1].acceptedOrders[1]', '各1回');
    expectIssue(issues, 'questions[1].acceptedOrders[2]', '存在しない');
  });

  it('穴埋めの空欄はちょうど1つ', () => {
    const p = starterPack();
    p.questions[2].sentence = '这道菜很好吃。';
    expectIssue(issuesOf(p), 'questions[2].sentence', '0か所');
    p.questions[2].sentence = '{{blank}}道菜很{{blank}}。';
    expectIssue(issuesOf(p), 'questions[2].sentence', '2か所');
  });

  it('存在しないシーンへの参照を拒否し、既存シーンなら許可する', () => {
    const p = starterPack();
    p.scenarios = [];
    expectIssue(issuesOf(p), 'questions[0].scenarioId', 'シーン');
    expect(validatePackObject(p, { knownScenarioIds: new Set(['sample-meal-scene']) }).ok).toBe(true);
  });

  it('宣言も保存もされていない音声の参照を拒否する', () => {
    const p = starterPack();
    p.scenarios[0].turns[0].audioId = 'meal-turn-1';
    expectIssue(issuesOf(p), 'scenarios[0].turns[0].audioId', '音声');
    expect(validatePackObject(p, { knownAudioIds: new Set(['meal-turn-1']) }).ok).toBe(true);
  });

  it('音声IDとファイル名の重複を拒否する', () => {
    const p = starterPack();
    const decl = { id: 'a1', fileName: 'a.mp3', mimeType: 'audio/mpeg', source: '自作録音', license: '私的利用' };
    p.audioAssets = [decl, { ...decl }];
    const issues = issuesOf(p);
    expectIssue(issues, 'audioAssets[1].id', '重複');
    expectIssue(issues, 'audioAssets[1].fileName', '重複');
  });

  it('リスニング問題の設問に音声の全文を載せない', () => {
    const p = starterPack();
    p.audioAssets = [{ id: 'a1', fileName: 'a.mp3', mimeType: 'audio/mpeg', source: '自作録音', license: '私的利用' }];
    Object.assign(p.questions[0], {
      presentation: 'listening',
      audioId: 'a1',
      transcript: '这道菜很好吃。',
      prompt: '这道菜很好吃。の意味は？',
    });
    expectIssue(issuesOf(p), 'questions[0].prompt', '全文');
  });
});
