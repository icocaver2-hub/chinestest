import { describe, expect, it } from 'vitest';
import {
  applyAttempt,
  initialQuestionState,
  isDue,
  isLastIncorrect,
  isRepeatedMistake,
  selectTodayQuestions,
  type AttemptInput,
  type TodayCandidate,
} from '../../src/domain/review';
import { addStudyDays, toStudyDate } from '../../src/domain/study-date';
import type { QuestionStateRecord } from '../../src/types/db';

const at = (today: string, result: 'correct' | 'incorrect', mode: 'normal' | 'immediate_retry' = 'normal'): AttemptInput => ({
  today,
  result,
  mode,
  occurredAt: `${today}T03:00:00.000Z`,
});

function run(steps: AttemptInput[], start: QuestionStateRecord = initialQuestionState('q1', 1)): QuestionStateRecord {
  return steps.reduce((s, step) => applyAttempt(s, step), start);
}

describe('T03 復習日', () => {
  it('不正解→即時再挑戦で正解しても翌日が復習日', () => {
    const s = run([at('2026-10-23', 'incorrect'), at('2026-10-23', 'correct', 'immediate_retry')]);
    expect(s).toMatchObject({
      nextReviewDate: '2026-10-24',
      lastResult: 'correct',
      attemptCount: 2,
      incorrectCount: 1,
      reviewSuccessDays: 0,
      mastered: false,
      lastIncorrectDate: '2026-10-23',
      lastCreditedDate: null,
    });
  });

  it('docs/06の例: 10/24→10/27→11/03→克服・11/17', () => {
    let s = run([at('2026-10-23', 'incorrect'), at('2026-10-23', 'correct', 'immediate_retry')]);
    s = applyAttempt(s, at('2026-10-24', 'correct'));
    expect(s).toMatchObject({ reviewSuccessDays: 1, nextReviewDate: '2026-10-27', mastered: false, lastCreditedDate: '2026-10-24' });
    s = applyAttempt(s, at('2026-10-27', 'correct'));
    expect(s).toMatchObject({ reviewSuccessDays: 2, nextReviewDate: '2026-11-03', mastered: false });
    s = applyAttempt(s, at('2026-11-03', 'correct'));
    expect(s).toMatchObject({ reviewSuccessDays: 3, nextReviewDate: '2026-11-17', mastered: true });
    // 克服後も14日間隔
    s = applyAttempt(s, at('2026-11-17', 'correct'));
    expect(s).toMatchObject({ reviewSuccessDays: 4, nextReviewDate: '2026-12-01', mastered: true });
  });

  it('未学習の問題に初回正解したら翌日が復習日（連続正解日数は0）', () => {
    const s = run([at('2026-10-23', 'correct')]);
    expect(s).toMatchObject({ nextReviewDate: '2026-10-24', reviewSuccessDays: 0, mastered: false, attemptCount: 1 });
  });

  it('期限前の任意演習で正解しても復習日を延ばさない', () => {
    let s = run([at('2026-10-23', 'incorrect'), at('2026-10-24', 'correct')]); // 10/27へ
    s = applyAttempt(s, at('2026-10-25', 'correct'));
    expect(s).toMatchObject({ reviewSuccessDays: 1, nextReviewDate: '2026-10-27', lastResult: 'correct', attemptCount: 3 });
  });

  it('期限を過ぎてから正解した場合も、その日から間隔を数える', () => {
    let s = run([at('2026-10-23', 'incorrect')]); // 10/24期限
    s = applyAttempt(s, at('2026-10-30', 'correct'));
    expect(s).toMatchObject({ reviewSuccessDays: 1, nextReviewDate: '2026-11-02' });
  });

  it('克服後に不正解なら翌日からやり直し、lastCreditedDateは保持', () => {
    let s = run([
      at('2026-10-23', 'incorrect'),
      at('2026-10-24', 'correct'),
      at('2026-10-27', 'correct'),
      at('2026-11-03', 'correct'),
    ]);
    expect(s.mastered).toBe(true);
    s = applyAttempt(s, at('2026-11-17', 'incorrect'));
    expect(s).toMatchObject({
      mastered: false,
      reviewSuccessDays: 0,
      nextReviewDate: '2026-11-18',
      lastIncorrectDate: '2026-11-17',
      lastCreditedDate: '2026-11-03',
      incorrectCount: 2,
    });
  });
});

describe('T04 同日', () => {
  it('同日に10回正解しても連続正解日数は1回まで', () => {
    let s = run([at('2026-10-23', 'incorrect')]);
    for (let i = 0; i < 10; i++) s = applyAttempt(s, at('2026-10-24', 'correct'));
    expect(s).toMatchObject({ reviewSuccessDays: 1, nextReviewDate: '2026-10-27', attemptCount: 11 });
  });

  it('同日不正解の後に正解しても加点せず、翌日の復習を残す', () => {
    let s = run([at('2026-10-23', 'incorrect'), at('2026-10-24', 'incorrect')]);
    s = applyAttempt(s, at('2026-10-24', 'correct'));
    expect(s).toMatchObject({ reviewSuccessDays: 0, nextReviewDate: '2026-10-25', lastResult: 'correct' });
    // 翌日以降なら通常回答として評価できる
    s = applyAttempt(s, at('2026-10-25', 'correct'));
    expect(s).toMatchObject({ reviewSuccessDays: 1, nextReviewDate: '2026-10-28' });
  });

  it('即時再挑戦は復習日・連続正解日数・克服状態を進めない', () => {
    let s = run([at('2026-10-23', 'incorrect'), at('2026-10-24', 'correct')]);
    const before = { ...s };
    s = applyAttempt(s, at('2026-10-27', 'correct', 'immediate_retry'));
    expect(s).toMatchObject({
      reviewSuccessDays: before.reviewSuccessDays,
      nextReviewDate: before.nextReviewDate,
      mastered: before.mastered,
      attemptCount: before.attemptCount + 1,
    });
  });

  it('元の状態を変更しない', () => {
    const s0 = initialQuestionState('q1', 1);
    const copy = { ...s0 };
    applyAttempt(s0, at('2026-10-23', 'incorrect'));
    expect(s0).toEqual(copy);
  });
});

describe('T05 苦手', () => {
  it('不正解3回で「繰り返し間違える」、克服で外れ、再不正解で戻る', () => {
    let s = run([at('2026-10-01', 'incorrect'), at('2026-10-02', 'incorrect')]);
    expect(isRepeatedMistake(s)).toBe(false);
    s = applyAttempt(s, at('2026-10-03', 'incorrect'));
    expect(isRepeatedMistake(s)).toBe(true);
    s = run([at('2026-10-04', 'correct'), at('2026-10-07', 'correct'), at('2026-10-14', 'correct')], s);
    expect(s.mastered).toBe(true);
    expect(isRepeatedMistake(s)).toBe(false);
    expect(isRepeatedMistake(s, true)).toBe(true); // 「克服済みも表示」
    s = applyAttempt(s, at('2026-10-28', 'incorrect'));
    expect(isRepeatedMistake(s)).toBe(true);
  });

  it('前回不正解は再挑戦で正解すると外れるが、復習予定は残る', () => {
    let s = run([at('2026-10-23', 'incorrect')]);
    expect(isLastIncorrect(s)).toBe(true);
    s = applyAttempt(s, at('2026-10-23', 'correct', 'immediate_retry'));
    expect(isLastIncorrect(s)).toBe(false);
    expect(isDue(s, '2026-10-24')).toBe(true);
    expect(isDue(s, '2026-10-23')).toBe(false);
  });
});

describe('T06 日付の境界', () => {
  it('月末・年末・うるう日', () => {
    expect(run([at('2026-10-31', 'incorrect')]).nextReviewDate).toBe('2026-11-01');
    expect(run([at('2026-12-31', 'incorrect')]).nextReviewDate).toBe('2027-01-01');
    expect(run([at('2028-02-28', 'incorrect')]).nextReviewDate).toBe('2028-02-29');
    let s = run([at('2028-02-20', 'incorrect'), at('2028-02-21', 'correct'), at('2028-02-24', 'correct')]);
    expect(s.nextReviewDate).toBe('2028-03-02'); // 2/24 + 7日（うるう年）
    s = run([at('2027-02-20', 'incorrect'), at('2027-02-21', 'correct'), at('2027-02-24', 'correct')]);
    expect(s.nextReviewDate).toBe('2027-03-03');
  });

  it('タイムゾーンで学習日が変わる（UTCと学習日を混同しない）', () => {
    const t = new Date('2026-10-23T16:00:00Z');
    expect(toStudyDate(t, 'Asia/Tokyo')).toBe('2026-10-24');
    expect(toStudyDate(t, 'UTC')).toBe('2026-10-23');
    expect(toStudyDate(t, 'America/Los_Angeles')).toBe('2026-10-23');
  });

  it('夏時間の切り替え日でもカレンダー日で加算する', () => {
    // 米国東部の夏時間終了は2026-11-01（1日が25時間）
    const before = new Date('2026-11-01T04:30:00Z'); // 現地 11/1 00:30 (EDT)
    const after = new Date('2026-11-02T04:30:00Z'); // 現地 11/1 23:30 (EST)
    expect(toStudyDate(before, 'America/New_York')).toBe('2026-11-01');
    expect(toStudyDate(after, 'America/New_York')).toBe('2026-11-01');
    expect(addStudyDays('2026-11-01', 1)).toBe('2026-11-02');
    // 夏時間開始日（2026-03-08、1日が23時間）
    expect(toStudyDate(new Date('2026-03-09T03:30:00Z'), 'America/New_York')).toBe('2026-03-08');
    expect(addStudyDays('2026-03-07', 1)).toBe('2026-03-08');
  });
});

describe('T25 今日の学習の選び方', () => {
  const today = '2026-11-01';
  const st = (over: Partial<QuestionStateRecord>): QuestionStateRecord => ({ ...initialQuestionState('x', 1), attemptCount: 1, ...over });
  const c = (id: string, seq: number, state?: QuestionStateRecord): TodayCandidate => ({ question: { id, revision: 1, seq }, state });

  const candidates: TodayCandidate[] = [
    c('new-b', 5),
    c('due-normal-old', 1, st({ nextReviewDate: '2026-10-28' })),
    c('future', 2, st({ nextReviewDate: '2026-11-05' })),
    c('weak-new', 3, st({ nextReviewDate: '2026-11-01', incorrectCount: 3 })),
    c('weak-old', 4, st({ nextReviewDate: '2026-10-30', incorrectCount: 4 })),
    c('mastered-weak', 6, st({ nextReviewDate: '2026-10-31', incorrectCount: 5, mastered: true })),
    c('new-a', 0),
    c('due-normal-same', 7, st({ nextReviewDate: '2026-10-28' })),
    c('zero-attempts', 8, { ...initialQuestionState('zero-attempts', 1) }),
  ];

  it('苦手の期限到来→他の期限到来→未学習の順', () => {
    const r = selectTodayQuestions(candidates, today, 20);
    expect(r.items.map((x) => x.question.id)).toEqual([
      'weak-old',
      'weak-new',
      'due-normal-old',
      'due-normal-same',
      'mastered-weak',
      'new-a',
      'new-b',
      'zero-attempts',
    ]);
    expect(r.dueCount).toBe(5);
    expect(r.unlearnedCount).toBe(3);
  });

  it('未来の復習は前倒ししない（対象不足なら少ない件数で開始）', () => {
    const r = selectTodayQuestions(candidates, today, 20);
    expect(r.items.some((x) => x.question.id === 'future')).toBe(false);
  });

  it('設定問題数で打ち切る', () => {
    const r = selectTodayQuestions(candidates, today, 3);
    expect(r.items.map((x) => x.question.id)).toEqual(['weak-old', 'weak-new', 'due-normal-old']);
  });
});
