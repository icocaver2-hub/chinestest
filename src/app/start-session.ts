/** 演習の開始（Application層）。出題の選び方はdomain、保存はRepositoryに任せる。 */
import type { Clock } from '../domain/clock';
import { selectTodayQuestions } from '../domain/review';
import { toStudyDate } from '../domain/study-date';
import type { PracticeRepository } from '../repositories/practice-repository';
import type { QuestionRecord, SessionOrigin, SessionRecord, Settings } from '../types/db';
import { newId } from './ids';

export interface TodayPlan {
  questionIds: string[];
  dueCount: number;
  unlearnedCount: number;
}

export async function planToday(practice: PracticeRepository, settings: Settings, clock: Clock): Promise<TodayPlan> {
  const today = toStudyDate(clock(), settings.studyTimeZone);
  const sel = selectTodayQuestions(await practice.listStudyItems(), today, settings.dailyQuestionCount);
  return { questionIds: sel.items.map((x) => x.question.id), dueCount: sel.dueCount, unlearnedCount: sel.unlearnedCount };
}

export async function startTodaySession(practice: PracticeRepository, settings: Settings, clock: Clock): Promise<SessionRecord | null> {
  const today = toStudyDate(clock(), settings.studyTimeZone);
  const sel = selectTodayQuestions(await practice.listStudyItems(), today, settings.dailyQuestionCount);
  if (sel.items.length === 0) return null;
  return practice.startSession({
    sessionId: newId(),
    origin: 'today',
    startedAt: clock().toISOString(),
    queue: sel.items.map((x) => ({ questionId: x.question.id, revision: x.question.revision })),
  });
}

export async function startCustomSession(
  practice: PracticeRepository,
  origin: Exclude<SessionOrigin, 'today'>,
  questions: readonly Pick<QuestionRecord, 'id' | 'revision'>[],
  clock: Clock,
): Promise<SessionRecord | null> {
  if (questions.length === 0) return null;
  return practice.startSession({
    sessionId: newId(),
    origin,
    startedAt: clock().toISOString(),
    queue: questions.map((q) => ({ questionId: q.id, revision: q.revision })),
  });
}
