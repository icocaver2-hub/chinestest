/**
 * 採点後の記録・復習ルール（docs/06）。UIから分離した純粋関数。
 * 日付はすべて学習日（YYYY-MM-DD）で扱い、加算はカレンダー日で行う。
 */
import type { AttemptMode, AttemptResult, QuestionRecord, QuestionStateRecord } from '../types/db';
import { addStudyDays } from './study-date';

export const REPEATED_MISTAKE_THRESHOLD = 3;

export function initialQuestionState(questionId: string, revision: number): QuestionStateRecord {
  return {
    questionId,
    revision,
    attemptCount: 0,
    incorrectCount: 0,
    lastResult: null,
    lastAttemptAt: null,
    nextReviewDate: null,
    reviewSuccessDays: 0,
    lastCreditedDate: null,
    lastIncorrectDate: null,
    mastered: false,
  };
}

export interface AttemptInput {
  result: AttemptResult;
  mode: AttemptMode;
  /** 学習日 YYYY-MM-DD */
  today: string;
  /** ISO 8601 UTC */
  occurredAt: string;
}

/** 期限到来で加点した後の次回までの日数 */
export function intervalForSuccessDays(days: number): number {
  if (days <= 1) return 3;
  if (days === 2) return 7;
  return 14;
}

/** 1回の回答を学習状態へ反映した新しい状態を返す（元の状態は変更しない） */
export function applyAttempt(prev: QuestionStateRecord, input: AttemptInput): QuestionStateRecord {
  const { result, mode, today, occurredAt } = input;
  const wasUnlearned = prev.attemptCount === 0;
  const next: QuestionStateRecord = {
    ...prev,
    attemptCount: prev.attemptCount + 1,
    lastResult: result,
    lastAttemptAt: occurredAt,
  };

  if (result === 'incorrect') {
    return {
      ...next,
      incorrectCount: prev.incorrectCount + 1,
      reviewSuccessDays: 0,
      mastered: false,
      nextReviewDate: addStudyDays(today, 1),
      lastIncorrectDate: today,
    };
  }

  // 以下は正解
  if (mode === 'immediate_retry') return next; // 最新結果のみ正解にする
  if (wasUnlearned) return { ...next, nextReviewDate: addStudyDays(today, 1), reviewSuccessDays: 0 };
  if (prev.lastCreditedDate === today || prev.lastIncorrectDate === today) return next; // 同日の加点済み・同日不正解あり
  if (prev.nextReviewDate === null || prev.nextReviewDate > today) return next; // 期限前の任意演習

  const days = prev.reviewSuccessDays + 1;
  return {
    ...next,
    reviewSuccessDays: days,
    lastCreditedDate: today,
    nextReviewDate: addStudyDays(today, intervalForSuccessDays(days)),
    mastered: days >= 3,
  };
}

// ---- 一覧の条件 ----

export function isDue(s: QuestionStateRecord, today: string): boolean {
  return s.nextReviewDate !== null && s.nextReviewDate <= today;
}

export function isLastIncorrect(s: QuestionStateRecord): boolean {
  return s.lastResult === 'incorrect';
}

export function isRepeatedMistake(s: QuestionStateRecord, includeMastered = false): boolean {
  return s.incorrectCount >= REPEATED_MISTAKE_THRESHOLD && (includeMastered || !s.mastered);
}

export function isUnlearned(s: QuestionStateRecord | undefined): boolean {
  return s === undefined || s.attemptCount === 0;
}

// ---- 今日の学習の選び方 ----

export interface TodayCandidate {
  question: Pick<QuestionRecord, 'id' | 'revision' | 'seq'>;
  /** 現在revisionの学習状態（未作成ならundefined） */
  state: QuestionStateRecord | undefined;
}

export interface TodaySelection<T extends TodayCandidate> {
  items: T[];
  dueCount: number;
  unlearnedCount: number;
}

const byReviewDateThenId = (a: TodayCandidate, b: TodayCandidate) =>
  (a.state?.nextReviewDate ?? '').localeCompare(b.state?.nextReviewDate ?? '') ||
  a.question.id.localeCompare(b.question.id);

/**
 * 1. 期限到来の復習（未克服かつ不正解3回以上 → その他）、各グループは復習日の古い順・ID順
 * 2. 足りなければ未学習を登録順・ID順で追加
 * 3. 未来の復習は前倒ししない
 */
export function selectTodayQuestions<T extends TodayCandidate>(candidates: readonly T[], today: string, limit: number): TodaySelection<T> {
  const due = candidates.filter((c) => c.state !== undefined && isDue(c.state, today));
  const weak = due.filter((c) => isRepeatedMistake(c.state!)).sort(byReviewDateThenId);
  const other = due.filter((c) => !isRepeatedMistake(c.state!)).sort(byReviewDateThenId);
  const unlearned = candidates
    .filter((c) => isUnlearned(c.state))
    .sort((a, b) => a.question.seq - b.question.seq || a.question.id.localeCompare(b.question.id));
  const items = [...weak, ...other, ...unlearned].slice(0, Math.max(0, limit));
  return { items, dueCount: due.length, unlearnedCount: unlearned.length };
}
