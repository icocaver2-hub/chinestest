/** IndexedDBに保存するレコードの型（docs/04_DATA_MODEL.md）。バックアップスキーマにも反映する。 */
import type { AudioMimeType, Question, Scenario } from './content';

export type PackSource = 'bundled' | 'imported';

export interface PackRecord {
  packId: string;
  title: string;
  source: PackSource;
  schemaVersion: number;
  /** ISO 8601 UTC */
  importedAt: string;
}

/** 現在有効なシーン/問題。seqは教材の登録順（今日の学習の並び順に使う）。 */
export type ScenarioRecord = Scenario & { ownerPackId: string; seq: number };
export type QuestionRecord = Question & { ownerPackId: string; seq: number };
/** 過去を含む本文。主キーは[id, revision]。 */
export type ScenarioVersionRecord = ScenarioRecord;
export type QuestionVersionRecord = QuestionRecord;

export type AttemptResult = 'correct' | 'incorrect';
export type AttemptMode = 'normal' | 'immediate_retry';
/** 選択式: 選択肢ID / 並べ替え: トークンID配列 / 穴埋め: 入力文字列 */
export type AnswerValue = string | string[];

export interface AttemptRecord {
  submissionId: string;
  questionId: string;
  revision: number;
  sessionId: string;
  /** ISO 8601 UTC */
  occurredAt: string;
  /** 学習タイムゾーンで日付化したYYYY-MM-DD */
  studyDate: string;
  timeZone: string;
  answer: AnswerValue;
  result: AttemptResult;
  mode: AttemptMode;
}

export interface QuestionStateRecord {
  questionId: string;
  revision: number;
  attemptCount: number;
  incorrectCount: number;
  lastResult: AttemptResult | null;
  lastAttemptAt: string | null;
  nextReviewDate: string | null;
  reviewSuccessDays: number;
  lastCreditedDate: string | null;
  lastIncorrectDate: string | null;
  mastered: boolean;
}

export type SelfRating = 'said' | 'hesitated' | 'could_not_say';

export interface ConversationAttemptRecord {
  submissionId: string;
  scenarioId: string;
  revision: number;
  turnId: string;
  occurredAt: string;
  studyDate: string;
  timeZone: string;
  rating: SelfRating;
}

export type BookmarkTargetType = 'question' | 'scenario';

export interface BookmarkRecord {
  targetType: BookmarkTargetType;
  targetId: string;
  createdAt: string;
}

export type SessionOrigin = 'today' | 'practice' | 'review';
export type SessionStatus = 'active' | 'completed' | 'invalidated';

export interface SessionQueueItem {
  questionId: string;
  revision: number;
}

export interface SessionRecord {
  sessionId: string;
  origin: SessionOrigin;
  startedAt: string;
  status: SessionStatus;
  queue: SessionQueueItem[];
  currentIndex: number;
  /** 保存済み回答のsubmissionId */
  submissionIds: string[];
  retryQueue: SessionQueueItem[];
}

export interface AudioAssetRecord {
  packId: string;
  audioId: string;
  mimeType: AudioMimeType;
  byteLength: number;
  sha256: string;
  source: string;
  license: string;
  blob: Blob;
}

export interface ImportLogRecord {
  id: string;
  occurredAt: string;
  packId: string;
  fileName: string;
  added: number;
  updated: number;
  skipped: number;
}

export interface Settings {
  dailyQuestionCount: number;
  showPinyin: boolean;
  showTranslation: boolean;
  studyTimeZone: string;
}

export type SettingKey = keyof Settings;

export interface SettingRecord<K extends SettingKey = SettingKey> {
  key: K;
  value: Settings[K];
}

export interface MetaRecord {
  key: string;
  value: unknown;
}
