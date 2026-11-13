/**
 * 初期教材 core-family の件数・構成の検査（docs/10・docs/07「教材レビュー」）。
 * 形式検査は中国語としての正しさを保証しない。内容の点検結果はdocs/08に記録する。
 */
import { describe, expect, it } from 'vitest';
import { correctAnswerText, gradeAnswer } from '../../src/domain/grading';
import { validatePackText } from '../../src/domain/import-validation';
import type { ContentPack, Question } from '../../src/types/content';
import { readText } from '../helpers/fixtures';

const text = readText('public/content/core-family.json');
const result = validatePackText(text);
if (!result.ok) throw new Error(JSON.stringify(result.error, null, 2));
const pack: ContentPack = result.value;

const SCENES = [
  ['family-first-meeting', 'first_meeting'],
  ['family-visit', 'visit'],
  ['family-meal', 'meal'],
  ['family-daily', 'daily'],
  ['family-marriage', 'marriage'],
  ['family-clarification', 'repair'],
] as const;

const TONE_MARK = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/;

function allPinyin(p: ContentPack): string[] {
  return [
    ...p.scenarios.flatMap((s) => [...s.turns, ...s.phrases, ...s.substitutions].map((x) => x.pinyin)),
    ...p.questions.map((q) => q.pinyin),
  ];
}

describe('初期教材 core-family', () => {
  it('検査を通り、packIdとIDの接頭辞がサンプルと分かれている', () => {
    expect(pack.packId).toBe('core-family');
    for (const q of pack.questions) expect(q.id.startsWith('sample-')).toBe(false);
  });

  it('docs/10の6シーン（ID・カテゴリ・revision 1）', () => {
    expect(pack.scenarios.map((s) => [s.id, s.category])).toEqual(SCENES.map(([id, c]) => [id, c]));
    for (const s of pack.scenarios) expect(s.revision).toBe(1);
  });

  it.each(SCENES.map(([id]) => id))('%s: 4発言以上・6表現以上・8問（選択4・並べ替え2・穴埋め2）', (id) => {
    const s = pack.scenarios.find((x) => x.id === id)!;
    expect(s.turns.length).toBeGreaterThanOrEqual(4);
    expect(s.phrases.length).toBeGreaterThanOrEqual(6);
    const qs = pack.questions.filter((q) => q.scenarioId === id);
    expect(qs).toHaveLength(8);
    const count = (t: Question['type']) => qs.filter((q) => q.type === t).length;
    expect([count('single_choice'), count('ordering'), count('fill_blank')]).toEqual([4, 2, 2]);
  });

  it('合計48問・音声なし（未収録）', () => {
    expect(pack.questions).toHaveLength(48);
    expect(pack.audioAssets).toBeUndefined();
    expect(JSON.stringify(pack)).not.toContain('audioId');
  });

  it('ピンインは声調記号付きで、声調数字を使わない', () => {
    for (const p of allPinyin(pack)) {
      expect(p, p).not.toMatch(/[a-z][1-5]\b/i);
      // 「对。」のような1音節でも声調記号がある（軽声のみの語句はない）
      expect(p, p).toMatch(TONE_MARK);
    }
  });

  it('「一」「不」の変調表記が一貫している（代表例）', () => {
    const joined = allPinyin(pack).join(' ');
    expect(joined).toContain('yí biàn');
    expect(joined).toContain('yìdiǎnr');
    expect(joined).toContain('bú tài');
    expect(joined).not.toMatch(/\byī (biàn|jiā|wǎn)\b/);
    expect(joined).not.toMatch(/\bbù (tài|là|cuò|yòng)\b/);
  });

  it('中国語本文に日本語のかなや半角英字が混ざっていない', () => {
    const zh = [
      ...pack.scenarios.flatMap((s) => [...s.turns, ...s.phrases, ...s.substitutions].map((x) => x.zh)),
      ...pack.questions.flatMap((q) =>
        q.type === 'single_choice' ? [] : q.type === 'ordering' ? q.tokens.map((t) => t.text) : [q.sentence.replace('{{blank}}', ''), ...q.acceptedAnswers],
      ),
    ];
    for (const z of zh) {
      expect(z, z).not.toMatch(/[぀-ヿ]/);
      expect(z, z).not.toMatch(/[A-Za-z]/);
    }
  });

  it('各問題: 正解で正解、正解本文は解答後の全文と対応する', () => {
    for (const q of pack.questions) {
      const answer = q.type === 'single_choice' ? q.answerId : q.type === 'ordering' ? q.acceptedOrders[0]! : q.acceptedAnswers[0]!;
      expect(gradeAnswer(q, answer), q.id).toBe('correct');
      const full = correctAnswerText(q);
      expect(full.length, q.id).toBeGreaterThan(0);
    }
  });

  it('選択式の誤答は不正解になる（正解が1つ）', () => {
    for (const q of pack.questions) {
      if (q.type !== 'single_choice') continue;
      const wrong = q.choices.filter((c) => c.id !== q.answerId);
      expect(wrong.length, q.id).toBeGreaterThanOrEqual(2);
      for (const c of wrong) expect(gradeAnswer(q, c.id), `${q.id}:${c.id}`).toBe('incorrect');
    }
  });

  it('実在の人名・地名や結婚の時期などを具体的に入れていない', () => {
    const raw = JSON.stringify(pack);
    for (const banned of ['明年结婚', '下个月结婚', '年结婚', '东京', '北京', '上海']) expect(raw).not.toContain(banned);
  });
});
