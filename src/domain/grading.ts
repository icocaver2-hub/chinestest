/**
 * 採点（docs/05）。UIから分離した純粋関数。
 * - 選択式: 選択肢IDの一致
 * - 並べ替え: トークンのtext配列で比較（同じ文字のタイルの入れ替えを誤答にしない。全文連結では比較しない）
 * - 穴埋め: 正規化（NFC・前後空白除去・連続空白の圧縮・全角英数字→半角・末尾の。.!！?？除去）後に完全一致
 */
import { BLANK_MARKER, type FillBlankQuestion, type OrderingQuestion, type Question } from '../types/content';
import type { AnswerValue, AttemptResult } from '../types/db';

const TRAILING_PUNCT = /[。.!！?？]+$/u;

/** 全角英数字（Ａ-Ｚ、ａ-ｚ、０-９）を半角へ */
function toHalfWidthAlnum(s: string): string {
  return s.replace(/[Ａ-Ｚａ-ｚ０-９]/gu, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

export function normalizeFillAnswer(input: string): string {
  let s = input.normalize('NFC');
  s = s.replace(/\s+/gu, ' ').trim();
  s = toHalfWidthAlnum(s);
  s = s.replace(TRAILING_PUNCT, '').trim();
  return s;
}

export function gradeFillBlank(q: FillBlankQuestion, input: string): boolean {
  const answer = normalizeFillAnswer(input);
  if (answer === '') return false;
  return q.acceptedAnswers.some((a) => normalizeFillAnswer(a) === answer);
}

/** トークンID列をtext列へ。未知のIDや重複使用があればnull */
export function orderingTexts(q: OrderingQuestion, tokenIds: readonly string[]): string[] | null {
  const byId = new Map(q.tokens.map((t) => [t.id, t.text]));
  const used = new Set<string>();
  const texts: string[] = [];
  for (const id of tokenIds) {
    const text = byId.get(id);
    if (text === undefined || used.has(id)) return null;
    used.add(id);
    texts.push(text);
  }
  return texts;
}

export function gradeOrdering(q: OrderingQuestion, tokenIds: readonly string[]): boolean {
  if (tokenIds.length !== q.tokens.length) return false;
  const answer = orderingTexts(q, tokenIds);
  if (!answer) return false;
  return q.acceptedOrders.some((order) => {
    const expected = orderingTexts(q, order);
    return expected !== null && expected.length === answer.length && expected.every((t, i) => t === answer[i]);
  });
}

export function gradeAnswer(q: Question, answer: AnswerValue): AttemptResult {
  let ok = false;
  switch (q.type) {
    case 'single_choice':
      ok = typeof answer === 'string' && answer === q.answerId;
      break;
    case 'ordering':
      ok = Array.isArray(answer) && gradeOrdering(q, answer);
      break;
    case 'fill_blank':
      ok = typeof answer === 'string' && gradeFillBlank(q, answer);
      break;
  }
  return ok ? 'correct' : 'incorrect';
}

/** 解答後に示す正解の本文 */
export function correctAnswerText(q: Question): string {
  switch (q.type) {
    case 'single_choice':
      return q.choices.find((c) => c.id === q.answerId)?.text ?? '';
    case 'ordering':
      return (orderingTexts(q, q.acceptedOrders[0] ?? []) ?? []).join('');
    case 'fill_blank':
      return q.sentence.replace(BLANK_MARKER, q.acceptedAnswers[0] ?? '');
  }
}

/** 利用者の回答を表示用の文字列にする */
export function answerText(q: Question, answer: AnswerValue): string {
  switch (q.type) {
    case 'single_choice':
      return q.choices.find((c) => c.id === answer)?.text ?? '';
    case 'ordering':
      return Array.isArray(answer) ? (orderingTexts(q, answer) ?? []).join(' ') : '';
    case 'fill_blank':
      return typeof answer === 'string' ? answer : '';
  }
}
