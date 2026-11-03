import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/domain/clock';
import { gradeAnswer } from '../../src/domain/grading';
import { validatePackObject } from '../../src/domain/import-validation';
import { selectTodayQuestions } from '../../src/domain/review';
import { currentItem } from '../../src/domain/session';
import { openStudyDb, type StudyDatabase } from '../../src/repositories/db';
import { PracticeRepository, type AnswerInput } from '../../src/repositories/practice-repository';
import { StorageError } from '../../src/repositories/storage-error';
import { StudyRepository } from '../../src/repositories/study-repository';
import type { ContentPack } from '../../src/types/content';
import type { AnswerValue } from '../../src/types/db';
import { starterPack } from '../helpers/fixtures';

let n = 0;
const opened: StudyDatabase[] = [];
afterEach(() => {
  while (opened.length) opened.pop()?.close();
});

async function setup(name = `practice-${++n}`) {
  const db = await openStudyDb({ name });
  opened.push(db);
  const study = new StudyRepository(db, fixedClock('2026-10-23T00:00:00Z'));
  const practice = new PracticeRepository(db);
  return { db, study, practice, name };
}

function pack(): ContentPack {
  const r = validatePackObject(starterPack());
  if (!r.ok) throw new Error('sample invalid');
  return r.value;
}

const RIGHT: Record<string, AnswerValue> = {
  'sample-meal-q001': 'a',
  'sample-meal-q002': ['t1', 't2', 't3', 't4'],
  'sample-meal-q003': '好吃',
};
const WRONG: Record<string, AnswerValue> = {
  'sample-meal-q001': 'b',
  'sample-meal-q002': ['t4', 't3', 't2', 't1'],
  'sample-meal-q003': '好喝',
};

let sub = 0;
/** セッションの現在の問題に答える */
async function answerCurrent(practice: PracticeRepository, db: StudyDatabase, sessionId: string, correct: boolean, studyDate: string, submissionId = `sub-${++sub}`) {
  const s = (await practice.getSession(sessionId))!;
  const cur = currentItem(s)!;
  const q = (await db.get('questions', cur.item.questionId))!;
  const answer = (correct ? RIGHT : WRONG)[q.id]!;
  const input: AnswerInput = {
    submissionId,
    sessionId,
    index: cur.index,
    questionId: q.id,
    revision: q.revision,
    answer,
    result: gradeAnswer(q, answer),
    occurredAt: `${studyDate}T01:00:00.000Z`,
    studyDate,
    timeZone: 'Asia/Tokyo',
  };
  return { input, outcome: await practice.recordAnswer(input) };
}

async function startToday(practice: PracticeRepository, today: string, id: string) {
  const items = await practice.listStudyItems();
  const sel = selectTodayQuestions(items, today, 10);
  return practice.startSession({
    sessionId: id,
    origin: 'today',
    startedAt: `${today}T00:00:00.000Z`,
    queue: sel.items.map((x) => ({ questionId: x.question.id, revision: x.question.revision })),
  });
}

describe('回答保存', () => {
  it('履歴・学習状態・セッション位置を一緒に保存する', async () => {
    const { db, study, practice } = await setup();
    await study.registerPack(pack(), 'bundled');
    await startToday(practice, '2026-10-23', 's1');
    const { outcome } = await answerCurrent(practice, db, 's1', false, '2026-10-23');
    expect(outcome.status).toBe('saved');
    expect(await db.count('attempts')).toBe(1);
    expect(await db.get('questionStates', ['sample-meal-q001', 1])).toMatchObject({
      incorrectCount: 1,
      nextReviewDate: '2026-10-24',
    });
    const s = (await practice.getSession('s1'))!;
    expect(s.currentIndex).toBe(1);
    expect(s.retryQueue).toEqual([{ questionId: 'sample-meal-q001', revision: 1 }]);
  });

  it('T15 同じsubmissionIdの再送は件数を増やさない', async () => {
    const { db, study, practice } = await setup();
    await study.registerPack(pack(), 'bundled');
    await startToday(practice, '2026-10-23', 's1');
    const first = await answerCurrent(practice, db, 's1', true, '2026-10-23', 'dup-1');
    const again = await practice.recordAnswer(first.input);
    const parallel = await Promise.all([practice.recordAnswer(first.input), practice.recordAnswer(first.input)]);
    expect(again.status).toBe('duplicate');
    expect(parallel.map((p) => p.status)).toEqual(['duplicate', 'duplicate']);
    expect(await db.count('attempts')).toBe(1);
    expect((await db.get('questionStates', ['sample-meal-q001', 1]))?.attemptCount).toBe(1);
    expect((await practice.getSession('s1'))?.currentIndex).toBe(1);
  });

  it('同時に別のsubmissionIdで同じ位置へ回答しても、1件だけ保存される（複数タブ）', async () => {
    const { db, study, practice, name } = await setup();
    await study.registerPack(pack(), 'bundled');
    await startToday(practice, '2026-10-23', 's1');
    const db2 = await openStudyDb({ name });
    opened.push(db2);
    const p2 = new PracticeRepository(db2);
    const base: AnswerInput = {
      submissionId: 'tab-a',
      sessionId: 's1',
      index: 0,
      questionId: 'sample-meal-q001',
      revision: 1,
      answer: 'a',
      result: 'correct',
      occurredAt: '2026-10-23T01:00:00.000Z',
      studyDate: '2026-10-23',
      timeZone: 'Asia/Tokyo',
    };
    const results = await Promise.allSettled([practice.recordAnswer(base), p2.recordAnswer({ ...base, submissionId: 'tab-b' })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(StorageError);
    expect((rejected.reason as StorageError).kind).toBe('conflict');
    expect(await db.count('attempts')).toBe(1);
  });

  it('問題が更新されていたらセッションを無効にし、何も記録しない', async () => {
    const { db, study, practice } = await setup();
    await study.registerPack(pack(), 'bundled');
    await startToday(practice, '2026-10-23', 's1');
    const q = (await db.get('questions', 'sample-meal-q001'))!;
    await db.put('questions', { ...q, revision: 2 });
    expect(await practice.invalidateIfStale('s1')).toBe(true);
    expect((await practice.getSession('s1'))?.status).toBe('invalidated');
    await expect(
      practice.recordAnswer({
        submissionId: 'z',
        sessionId: 's1',
        index: 0,
        questionId: q.id,
        revision: 1,
        answer: 'a',
        result: 'correct',
        occurredAt: '2026-10-23T01:00:00.000Z',
        studyDate: '2026-10-23',
        timeZone: 'Asia/Tokyo',
      }),
    ).rejects.toBeInstanceOf(StorageError);
    expect(await db.count('attempts')).toBe(0);
  });

  it('T14 再接続（再読み込み）してもセッションと回答が残り、続きから再開できる', async () => {
    const { db, study, practice, name } = await setup();
    await study.registerPack(pack(), 'bundled');
    await startToday(practice, '2026-10-23', 's1');
    await answerCurrent(practice, db, 's1', true, '2026-10-23');
    db.close();
    const again = await setup(name);
    const active = await again.practice.getActiveSession();
    expect(active?.sessionId).toBe('s1');
    expect(currentItem(active!)?.item.questionId).toBe('sample-meal-q002');
    expect(await again.practice.listSessionAttempts('s1')).toHaveLength(1);
  });

  it('新しい演習を始めると進行中の演習は終了扱い（回答は残る）', async () => {
    const { db, study, practice } = await setup();
    await study.registerPack(pack(), 'bundled');
    await startToday(practice, '2026-10-23', 's1');
    await answerCurrent(practice, db, 's1', true, '2026-10-23');
    await startToday(practice, '2026-10-23', 's2');
    expect((await practice.getSession('s1'))?.status).toBe('completed');
    expect((await practice.getActiveSession())?.sessionId).toBe('s2');
    expect(await db.count('attempts')).toBe(1);
  });
});

describe('不正解→翌日以降の復習→克服→再不正解（フェーズ2の完了目安）', () => {
  it('日をまたいで一貫して動く', async () => {
    const { db, study, practice } = await setup();
    await study.registerPack(pack(), 'bundled');
    const state = () => db.get('questionStates', ['sample-meal-q001', 1]);

    // 10/23: q001を間違え、即時再挑戦で正解。他は正解
    await startToday(practice, '2026-10-23', 'd1');
    await answerCurrent(practice, db, 'd1', false, '2026-10-23');
    await answerCurrent(practice, db, 'd1', true, '2026-10-23');
    await answerCurrent(practice, db, 'd1', true, '2026-10-23');
    const retry = await answerCurrent(practice, db, 'd1', true, '2026-10-23');
    expect(retry.input.questionId).toBe('sample-meal-q001');
    expect(retry.outcome.status === 'saved' && retry.outcome.attempt.mode).toBe('immediate_retry');
    expect((await practice.getSession('d1'))?.status).toBe('completed');
    expect(await state()).toMatchObject({ nextReviewDate: '2026-10-24', lastResult: 'correct' });

    // 同じ日にもう一度始めても、期限前なので未学習も復習もない
    expect((await startToday(practice, '2026-10-23', 'd1b')).queue).toEqual([]);

    // 10/24: 3問とも期限到来。q001に正解 → 3日後
    const s2 = await startToday(practice, '2026-10-24', 'd2');
    expect(s2.queue.map((x) => x.questionId)).toContain('sample-meal-q001');
    for (let i = 0; i < s2.queue.length; i++) await answerCurrent(practice, db, 'd2', true, '2026-10-24');
    expect(await state()).toMatchObject({ reviewSuccessDays: 1, nextReviewDate: '2026-10-27' });

    // 10/27 → 11/03 → 克服
    for (const day of ['2026-10-27', '2026-11-03']) {
      const s = await startToday(practice, day, `day-${day}`);
      for (let i = 0; i < s.queue.length; i++) await answerCurrent(practice, db, `day-${day}`, true, day);
    }
    expect(await state()).toMatchObject({ reviewSuccessDays: 3, mastered: true, nextReviewDate: '2026-11-17' });

    // 11/17: 再不正解 → 克服が外れ翌日に復習
    const s5 = await startToday(practice, '2026-11-17', 'd5');
    const order = s5.queue.map((x) => x.questionId);
    for (const qid of order) await answerCurrent(practice, db, 'd5', qid !== 'sample-meal-q001', '2026-11-17');
    expect(await state()).toMatchObject({ mastered: false, reviewSuccessDays: 0, nextReviewDate: '2026-11-18', incorrectCount: 2 });
    expect((await startToday(practice, '2026-11-18', 'd6')).queue.map((x) => x.questionId)).toContain('sample-meal-q001');
  });
});

describe('ブックマーク', () => {
  it('付け外しでき、再接続後も保持される', async () => {
    const { practice, name, db } = await setup();
    expect(await practice.toggleBookmark('question', 'sample-meal-q002', '2026-10-23T00:00:00Z')).toBe(true);
    db.close();
    const again = await setup(name);
    expect(await again.practice.isBookmarked('question', 'sample-meal-q002')).toBe(true);
    expect(await again.practice.toggleBookmark('question', 'sample-meal-q002', '2026-10-24T00:00:00Z')).toBe(false);
    expect(await again.practice.listBookmarks()).toEqual([]);
  });
});
