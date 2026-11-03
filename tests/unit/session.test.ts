import { describe, expect, it } from 'vitest';
import { advanceSession, createSession, currentItem, isSessionStale, summarizeSession } from '../../src/domain/session';
import type { AttemptRecord } from '../../src/types/db';

const q = (id: string) => ({ questionId: id, revision: 1 });
const base = () => createSession({ sessionId: 's1', origin: 'today', startedAt: '2026-11-01T00:00:00Z', queue: [q('a'), q('b')] });

describe('演習セッション', () => {
  it('不正解は末尾の再挑戦キューへ。再挑戦は1回まで', () => {
    let s = base();
    expect(currentItem(s)).toEqual({ item: q('a'), mode: 'normal', index: 0 });
    s = advanceSession(s, 'sub1', 'incorrect');
    s = advanceSession(s, 'sub2', 'correct');
    expect(s.retryQueue).toEqual([q('a')]);
    expect(currentItem(s)).toEqual({ item: q('a'), mode: 'immediate_retry', index: 2 });
    s = advanceSession(s, 'sub3', 'incorrect'); // 再挑戦の不正解は再追加しない
    expect(s.retryQueue).toEqual([q('a')]);
    expect(s.status).toBe('completed');
    expect(currentItem(s)).toBeNull();
    expect(s.submissionIds).toEqual(['sub1', 'sub2', 'sub3']);
  });

  it('全問正解なら再挑戦なしで終了', () => {
    let s = base();
    s = advanceSession(s, 'x', 'correct');
    s = advanceSession(s, 'y', 'correct');
    expect(s.status).toBe('completed');
    expect(s.retryQueue).toEqual([]);
  });

  it('問題0件の演習は開始時点で完了', () => {
    expect(createSession({ sessionId: 's', origin: 'practice', startedAt: '', queue: [] }).status).toBe('completed');
  });

  it('残りの問題のrevisionが変わっていれば古い', () => {
    const s = base();
    expect(isSessionStale(s, new Map([['a', 1], ['b', 1]]))).toBe(false);
    expect(isSessionStale(s, new Map([['a', 1], ['b', 2]]))).toBe(true);
    expect(isSessionStale(s, new Map([['a', 1]]))).toBe(true);
    // 回答済みの問題の更新は影響しない
    const advanced = advanceSession(s, 'x', 'correct');
    expect(isSessionStale(advanced, new Map([['a', 2], ['b', 1]]))).toBe(false);
  });

  it('初回正答率と再挑戦結果を分けて集計する', () => {
    const mk = (questionId: string, result: 'correct' | 'incorrect', mode: 'normal' | 'immediate_retry'): AttemptRecord => ({
      submissionId: `${questionId}-${mode}`,
      questionId,
      revision: 1,
      sessionId: 's1',
      occurredAt: '',
      studyDate: '2026-11-01',
      timeZone: 'Asia/Tokyo',
      answer: '',
      result,
      mode,
    });
    const sum = summarizeSession([
      mk('a', 'incorrect', 'normal'),
      mk('b', 'correct', 'normal'),
      mk('c', 'incorrect', 'normal'),
      mk('a', 'correct', 'immediate_retry'),
      mk('c', 'incorrect', 'immediate_retry'),
    ]);
    expect(sum).toEqual({
      answered: 3,
      firstCorrect: 1,
      firstAccuracy: 1 / 3,
      retried: 2,
      retryCorrect: 1,
      missedQuestionIds: ['a', 'c'],
    });
    expect(summarizeSession([]).firstAccuracy).toBeNull();
  });
});
