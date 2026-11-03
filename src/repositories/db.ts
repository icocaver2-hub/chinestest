/**
 * IndexedDBの定義とマイグレーション（docs/04_DATA_MODEL.md）。
 * DBバージョン・教材schemaVersion・revision・backupVersionは独立して管理する。
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  AttemptRecord,
  AudioAssetRecord,
  BookmarkRecord,
  BookmarkTargetType,
  ConversationAttemptRecord,
  ImportLogRecord,
  MetaRecord,
  PackRecord,
  QuestionRecord,
  QuestionStateRecord,
  QuestionVersionRecord,
  ScenarioRecord,
  ScenarioVersionRecord,
  SessionRecord,
  SettingRecord,
} from '../types/db';

export const DB_NAME = 'chinese-conversation-study';
export const DB_VERSION = 1;

export interface StudyDB extends DBSchema {
  packs: { key: string; value: PackRecord };
  scenarios: {
    key: string;
    value: ScenarioRecord;
    indexes: { ownerPackId: string; category: string; level: string };
  };
  scenarioVersions: { key: [string, number]; value: ScenarioVersionRecord };
  questions: {
    key: string;
    value: QuestionRecord;
    indexes: { ownerPackId: string; scenarioId: string; type: string; level: string };
  };
  questionVersions: { key: [string, number]; value: QuestionVersionRecord };
  attempts: {
    key: string;
    value: AttemptRecord;
    indexes: { questionId: string; sessionId: string; studyDate: string };
  };
  questionStates: {
    key: [string, number];
    value: QuestionStateRecord;
    indexes: { nextReviewDate: string };
  };
  conversationAttempts: {
    key: string;
    value: ConversationAttemptRecord;
    indexes: { scenarioId: string; studyDate: string };
  };
  bookmarks: { key: [BookmarkTargetType, string]; value: BookmarkRecord };
  sessions: { key: string; value: SessionRecord; indexes: { status: string } };
  audioAssets: { key: [string, string]; value: AudioAssetRecord };
  importLogs: { key: string; value: ImportLogRecord; indexes: { occurredAt: string } };
  settings: { key: string; value: SettingRecord };
  meta: { key: string; value: MetaRecord };
}

export type StudyDatabase = IDBPDatabase<StudyDB>;

/** バックアップ・復元の対象ストア（metaは実行環境依存のため含めない） */
export const BACKUP_STORES = [
  'packs',
  'scenarios',
  'scenarioVersions',
  'questions',
  'questionVersions',
  'attempts',
  'questionStates',
  'conversationAttempts',
  'bookmarks',
  'sessions',
  'audioAssets',
  'importLogs',
  'settings',
] as const;

type UpgradeDb = IDBPDatabase<StudyDB>;

function migrateToV1(db: UpgradeDb): void {
  db.createObjectStore('packs', { keyPath: 'packId' });

  const scenarios = db.createObjectStore('scenarios', { keyPath: 'id' });
  scenarios.createIndex('ownerPackId', 'ownerPackId');
  scenarios.createIndex('category', 'category');
  scenarios.createIndex('level', 'level');
  db.createObjectStore('scenarioVersions', { keyPath: ['id', 'revision'] });

  const questions = db.createObjectStore('questions', { keyPath: 'id' });
  questions.createIndex('ownerPackId', 'ownerPackId');
  questions.createIndex('scenarioId', 'scenarioId');
  questions.createIndex('type', 'type');
  questions.createIndex('level', 'level');
  db.createObjectStore('questionVersions', { keyPath: ['id', 'revision'] });

  const attempts = db.createObjectStore('attempts', { keyPath: 'submissionId' });
  attempts.createIndex('questionId', 'questionId');
  attempts.createIndex('sessionId', 'sessionId');
  attempts.createIndex('studyDate', 'studyDate');

  const states = db.createObjectStore('questionStates', { keyPath: ['questionId', 'revision'] });
  // nextReviewDateがnullのレコードは索引に入らない（未学習・期限なし）
  states.createIndex('nextReviewDate', 'nextReviewDate');

  const conv = db.createObjectStore('conversationAttempts', { keyPath: 'submissionId' });
  conv.createIndex('scenarioId', 'scenarioId');
  conv.createIndex('studyDate', 'studyDate');

  db.createObjectStore('bookmarks', { keyPath: ['targetType', 'targetId'] });

  const sessions = db.createObjectStore('sessions', { keyPath: 'sessionId' });
  sessions.createIndex('status', 'status');

  db.createObjectStore('audioAssets', { keyPath: ['packId', 'audioId'] });

  const logs = db.createObjectStore('importLogs', { keyPath: 'id' });
  logs.createIndex('occurredAt', 'occurredAt');

  db.createObjectStore('settings', { keyPath: 'key' });
  db.createObjectStore('meta', { keyPath: 'key' });
}

/** バージョンごとの移行。既存データを削除せず、順に適用する。 */
const MIGRATIONS: Record<number, (db: UpgradeDb) => void> = {
  1: migrateToV1,
};

export interface OpenOptions {
  name?: string;
  /** 別タブが古いバージョンのDBを開いたままでアップグレードできない */
  onBlocked?: () => void;
  /** 別タブが新しいバージョンを要求している（このタブは接続を閉じる） */
  onVersionChange?: () => void;
}

export async function openStudyDb(options: OpenOptions = {}): Promise<StudyDatabase> {
  const db = await openDB<StudyDB>(options.name ?? DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion, newVersion) {
      const target = newVersion ?? DB_VERSION;
      for (let v = oldVersion + 1; v <= target; v++) {
        const migrate = MIGRATIONS[v];
        if (!migrate) throw new Error(`DBバージョン${v}への移行手順がありません`);
        migrate(database);
      }
    },
    blocked() {
      options.onBlocked?.();
    },
    blocking() {
      db.close();
      options.onVersionChange?.();
    },
  });
  return db;
}
