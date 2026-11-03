/**
 * 演習・復習の保存（docs/04「回答保存」、docs/06）。
 * 回答は submissionId で重複を防ぎ、履歴追加・学習状態更新・セッション位置更新を1トランザクションで行う。
 */
import { applyAttempt, initialQuestionState } from '../domain/review';
import { advanceSession, createSession, currentItem, isSessionStale } from '../domain/session';
import type {
  AnswerValue,
  AttemptRecord,
  AttemptResult,
  BookmarkRecord,
  BookmarkTargetType,
  QuestionRecord,
  QuestionStateRecord,
  SessionOrigin,
  SessionQueueItem,
  SessionRecord,
} from '../types/db';
import type { StudyDatabase } from './db';
import { StorageError, toStorageError } from './storage-error';

export interface AnswerInput {
  submissionId: string;
  sessionId: string;
  /** 回答した時点の出題位置（別タブで進んだ場合の誤記録を防ぐ） */
  index: number;
  questionId: string;
  revision: number;
  answer: AnswerValue;
  result: AttemptResult;
  occurredAt: string;
  studyDate: string;
  timeZone: string;
}

export type AnswerOutcome =
  | { status: 'saved' | 'duplicate'; attempt: AttemptRecord; state: QuestionStateRecord; session: SessionRecord }
  | { status: 'invalidated'; session: SessionRecord };

export interface StudyItem {
  question: QuestionRecord;
  /** 現在revisionの学習状態（未回答ならundefined） */
  state: QuestionStateRecord | undefined;
}

export class PracticeRepository {
  readonly db: StudyDatabase;

  constructor(db: StudyDatabase) {
    this.db = db;
  }

  /** 現在の問題と、現在revisionの学習状態 */
  async listStudyItems(): Promise<StudyItem[]> {
    const tx = this.db.transaction(['questions', 'questionStates']);
    const [questions, states] = await Promise.all([tx.objectStore('questions').getAll(), tx.objectStore('questionStates').getAll()]);
    await tx.done;
    const stateMap = new Map(states.map((s) => [`${s.questionId}\u0000${s.revision}`, s]));
    return questions
      .sort((a, b) => a.seq - b.seq || a.id.localeCompare(b.id))
      .map((question) => ({ question, state: stateMap.get(`${question.id}\u0000${question.revision}`) }));
  }

  // ---- セッション ----

  /** 新しい演習を始める。進行中の演習は終了扱いにする（保存済みの回答は残る）。 */
  async startSession(params: { sessionId: string; origin: SessionOrigin; startedAt: string; queue: SessionQueueItem[] }): Promise<SessionRecord> {
    const session = createSession(params);
    try {
      const tx = this.db.transaction('sessions', 'readwrite');
      for (const s of await tx.store.index('status').getAll('active')) {
        await tx.store.put({ ...s, status: 'completed' });
      }
      await tx.store.put(session);
      await tx.done;
    } catch (e) {
      throw toStorageError(e);
    }
    return session;
  }

  async getSession(sessionId: string): Promise<SessionRecord | undefined> {
    return this.db.get('sessions', sessionId);
  }

  async getActiveSession(): Promise<SessionRecord | undefined> {
    const active = await this.db.getAllFromIndex('sessions', 'status', 'active');
    return active.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  }

  async endSession(sessionId: string): Promise<void> {
    try {
      const tx = this.db.transaction('sessions', 'readwrite');
      const s = await tx.store.get(sessionId);
      if (s && s.status === 'active') await tx.store.put({ ...s, status: 'completed' });
      await tx.done;
    } catch (e) {
      throw toStorageError(e);
    }
  }

  /** 教材更新で出題予定の問題が古くなっていれば無効にする。無効にしたらtrue。 */
  async invalidateIfStale(sessionId: string): Promise<boolean> {
    try {
      const tx = this.db.transaction(['sessions', 'questions'], 'readwrite');
      const s = await tx.objectStore('sessions').get(sessionId);
      if (!s || s.status !== 'active') {
        await tx.done;
        return false;
      }
      const revisions = new Map<string, number>();
      for (const item of [...s.queue, ...s.retryQueue]) {
        const q = await tx.objectStore('questions').get(item.questionId);
        if (q) revisions.set(q.id, q.revision);
      }
      const stale = isSessionStale(s, revisions);
      if (stale) await tx.objectStore('sessions').put({ ...s, status: 'invalidated' });
      await tx.done;
      return stale;
    } catch (e) {
      throw toStorageError(e);
    }
  }

  async listSessionAttempts(sessionId: string): Promise<AttemptRecord[]> {
    const rows = await this.db.getAllFromIndex('attempts', 'sessionId', sessionId);
    return rows.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.submissionId.localeCompare(b.submissionId));
  }

  async listSessions(): Promise<SessionRecord[]> {
    const rows = await this.db.getAll('sessions');
    return rows.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  // ---- 回答保存 ----

  async recordAnswer(input: AnswerInput): Promise<AnswerOutcome> {
    try {
      const tx = this.db.transaction(['attempts', 'questionStates', 'sessions', 'questions'], 'readwrite');
      const attempts = tx.objectStore('attempts');
      const states = tx.objectStore('questionStates');
      const sessions = tx.objectStore('sessions');

      const existing = await attempts.get(input.submissionId);
      if (existing) {
        const [state, session] = await Promise.all([states.get([existing.questionId, existing.revision]), sessions.get(existing.sessionId)]);
        await tx.done;
        if (!state || !session) throw new StorageError('unknown', '保存済みの回答に対応する記録が見つかりません');
        return { status: 'duplicate', attempt: existing, state, session };
      }

      const session = await sessions.get(input.sessionId);
      const cur = session ? currentItem(session) : null;
      if (
        !session ||
        !cur ||
        cur.index !== input.index ||
        cur.item.questionId !== input.questionId ||
        cur.item.revision !== input.revision
      ) {
        tx.abort();
        await tx.done.catch(() => undefined);
        throw new StorageError('conflict', 'この演習は別の画面で進んだか終了しています。最新の状態を読み込み直してください。');
      }

      const question = await tx.objectStore('questions').get(input.questionId);
      if (!question || question.revision !== input.revision) {
        const invalidated: SessionRecord = { ...session, status: 'invalidated' };
        await sessions.put(invalidated);
        await tx.done;
        return { status: 'invalidated', session: invalidated };
      }

      const prev = (await states.get([input.questionId, input.revision])) ?? initialQuestionState(input.questionId, input.revision);
      const state = applyAttempt(prev, {
        result: input.result,
        mode: cur.mode,
        today: input.studyDate,
        occurredAt: input.occurredAt,
      });
      const attempt: AttemptRecord = {
        submissionId: input.submissionId,
        questionId: input.questionId,
        revision: input.revision,
        sessionId: input.sessionId,
        occurredAt: input.occurredAt,
        studyDate: input.studyDate,
        timeZone: input.timeZone,
        answer: input.answer,
        result: input.result,
        mode: cur.mode,
      };
      const nextSession = advanceSession(session, input.submissionId, input.result);
      await attempts.add(attempt);
      await states.put(state);
      await sessions.put(nextSession);
      await tx.done;
      return { status: 'saved', attempt, state, session: nextSession };
    } catch (e) {
      throw toStorageError(e);
    }
  }

  // ---- ブックマーク ----

  async listBookmarks(): Promise<BookmarkRecord[]> {
    return this.db.getAll('bookmarks');
  }

  async isBookmarked(targetType: BookmarkTargetType, targetId: string): Promise<boolean> {
    return (await this.db.getKey('bookmarks', [targetType, targetId])) !== undefined;
  }

  /** 付け外しを切り替え、切り替え後の状態を返す */
  async toggleBookmark(targetType: BookmarkTargetType, targetId: string, createdAt: string): Promise<boolean> {
    try {
      const tx = this.db.transaction('bookmarks', 'readwrite');
      const key: [BookmarkTargetType, string] = [targetType, targetId];
      const exists = (await tx.store.getKey(key)) !== undefined;
      if (exists) await tx.store.delete(key);
      else await tx.store.put({ targetType, targetId, createdAt });
      await tx.done;
      return !exists;
    } catch (e) {
      throw toStorageError(e);
    }
  }
}
