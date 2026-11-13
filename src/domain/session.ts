/**
 * 演習セッションの進行（docs/03「問題演習」、docs/04 sessions）。純粋関数。
 * 出題順は「本来のキュー → 即時再挑戦キュー」。再挑戦は各問題1回までで、再挑戦の不正解は再び追加しない。
 */
import type { AttemptMode, AttemptRecord, AttemptResult, SessionOrigin, SessionQueueItem, SessionRecord } from '../types/db';

export function createSession(params: {
  sessionId: string;
  origin: SessionOrigin;
  startedAt: string;
  queue: SessionQueueItem[];
}): SessionRecord {
  return {
    sessionId: params.sessionId,
    origin: params.origin,
    startedAt: params.startedAt,
    status: params.queue.length === 0 ? 'completed' : 'active',
    queue: params.queue,
    currentIndex: 0,
    submissionIds: [],
    retryQueue: [],
  };
}

export function sessionLength(s: SessionRecord): number {
  return s.queue.length + s.retryQueue.length;
}

export interface CurrentItem {
  item: SessionQueueItem;
  mode: AttemptMode;
  index: number;
}

export function currentItem(s: SessionRecord): CurrentItem | null {
  if (s.status !== 'active') return null;
  const i = s.currentIndex;
  if (i < s.queue.length) return { item: s.queue[i]!, mode: 'normal', index: i };
  const r = s.retryQueue[i - s.queue.length];
  return r ? { item: r, mode: 'immediate_retry', index: i } : null;
}

/** 回答を保存した後のセッション。不正解の通常回答は再挑戦キューへ（各問題1回まで）。 */
export function advanceSession(s: SessionRecord, submissionId: string, result: AttemptResult): SessionRecord {
  const cur = currentItem(s);
  if (!cur) throw new Error('進行中の問題がありません');
  const retryQueue =
    cur.mode === 'normal' &&
    result === 'incorrect' &&
    !s.retryQueue.some((r) => r.questionId === cur.item.questionId && r.revision === cur.item.revision)
      ? [...s.retryQueue, cur.item]
      : s.retryQueue;
  const next: SessionRecord = {
    ...s,
    currentIndex: s.currentIndex + 1,
    submissionIds: [...s.submissionIds, submissionId],
    retryQueue,
  };
  return next.currentIndex >= sessionLength(next) ? { ...next, status: 'completed' } : next;
}

/** 教材更新で出題予定の問題が現在版でなくなっていれば、セッションは古い */
export function isSessionStale(s: SessionRecord, currentRevisions: ReadonlyMap<string, number>): boolean {
  const remaining = [...s.queue, ...s.retryQueue].slice(s.currentIndex);
  return remaining.some((item) => currentRevisions.get(item.questionId) !== item.revision);
}

export interface SessionSummary {
  /** 通常回答の数（＝出題数） */
  answered: number;
  firstCorrect: number;
  /** 初回正答率（0〜1）。回答0なら null */
  firstAccuracy: number | null;
  retried: number;
  retryCorrect: number;
  /** この演習で通常回答が不正解だった問題 */
  missedQuestionIds: string[];
}

export function summarizeSession(attempts: readonly AttemptRecord[]): SessionSummary {
  const normal = attempts.filter((a) => a.mode === 'normal');
  const retries = attempts.filter((a) => a.mode === 'immediate_retry');
  const firstCorrect = normal.filter((a) => a.result === 'correct').length;
  return {
    answered: normal.length,
    firstCorrect,
    firstAccuracy: normal.length === 0 ? null : firstCorrect / normal.length,
    retried: retries.length,
    retryCorrect: retries.filter((a) => a.result === 'correct').length,
    missedQuestionIds: normal.filter((a) => a.result === 'incorrect').map((a) => a.questionId),
  };
}
