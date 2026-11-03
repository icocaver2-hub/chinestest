/**
 * IndexedDBの読み書き。複数ストアにまたがる更新は1トランザクションで行い、
 * 失敗時に部分反映しない。トランザクション内でネットワークやファイル読み込みを待たない。
 */
import type { Clock } from '../domain/clock';
import { invalidSettingKeys, normalizeSettings } from '../domain/settings';
import type { ContentPack } from '../types/content';
import type { PackRecord, PackSource, QuestionRecord, ScenarioRecord, Settings, SettingKey } from '../types/db';
import type { StudyDatabase } from './db';
import { StorageError, toStorageError } from './storage-error';

export const META_CONTENT_GENERATION = 'contentGeneration';
export const META_NEXT_SEQ = 'nextSeq';

export type RegisterOutcome = { status: 'registered'; scenarios: number; questions: number } | { status: 'already_registered' };

export interface IdConflict {
  kind: 'scenario' | 'question';
  id: string;
  ownerPackId: string;
}

export class StudyRepository {
  readonly db: StudyDatabase;
  private readonly clock: Clock;

  constructor(db: StudyDatabase, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  // ---- 設定 ----

  async getSettings(): Promise<Settings> {
    const rows = await this.db.getAll('settings');
    const raw: Partial<Record<SettingKey, unknown>> = {};
    for (const r of rows) raw[r.key] = r.value;
    return normalizeSettings(raw);
  }

  /** 不正な値を含む場合は何も保存せずRangeErrorを投げる（既存の値を既定値で上書きしない） */
  async saveSettings(patch: Partial<Settings>): Promise<Settings> {
    const invalid = invalidSettingKeys(patch);
    if (invalid.length > 0) throw new RangeError(`設定値が正しくありません: ${invalid.join(', ')}`);
    const next = normalizeSettings({ ...(await this.getSettings()), ...patch });
    try {
      const tx = this.db.transaction('settings', 'readwrite');
      for (const key of Object.keys(patch) as SettingKey[]) {
        await tx.store.put({ key, value: next[key] });
      }
      await tx.done;
    } catch (e) {
      throw toStorageError(e);
    }
    return next;
  }

  // ---- 教材の読み出し ----

  listPacks(): Promise<PackRecord[]> {
    return this.db.getAll('packs');
  }

  async listScenarios(): Promise<ScenarioRecord[]> {
    const rows = await this.db.getAll('scenarios');
    return rows.sort((a, b) => a.seq - b.seq || a.id.localeCompare(b.id));
  }

  getScenario(id: string): Promise<ScenarioRecord | undefined> {
    return this.db.get('scenarios', id);
  }

  async listQuestions(): Promise<QuestionRecord[]> {
    const rows = await this.db.getAll('questions');
    return rows.sort((a, b) => a.seq - b.seq || a.id.localeCompare(b.id));
  }

  async listQuestionsByScenario(scenarioId: string): Promise<QuestionRecord[]> {
    const rows = await this.db.getAllFromIndex('questions', 'scenarioId', scenarioId);
    return rows.sort((a, b) => a.seq - b.seq || a.id.localeCompare(b.id));
  }

  async countQuestionsByScenario(): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const q of await this.db.getAll('questions')) counts.set(q.scenarioId, (counts.get(q.scenarioId) ?? 0) + 1);
    return counts;
  }

  async listScenarioIds(): Promise<Set<string>> {
    return new Set(await this.db.getAllKeys('scenarios'));
  }

  async listAudioIds(packId: string): Promise<Set<string>> {
    const keys = await this.db.getAllKeys('audioAssets', IDBKeyRange.bound([packId, ''], [packId, '￿']));
    return new Set(keys.map(([, audioId]) => audioId));
  }

  async getContentGeneration(): Promise<number> {
    const row = await this.db.get('meta', META_CONTENT_GENERATION);
    return typeof row?.value === 'number' ? row.value : 0;
  }

  async hasPack(packId: string): Promise<boolean> {
    return (await this.db.getKey('packs', packId)) !== undefined;
  }

  // ---- 初期教材の登録 ----

  /**
   * 検査済みの同梱パックを登録する。登録済み判定はpacksストアで行い（復元後の二重登録防止）、
   * 登録済みなら何も書き込まない。他パックが所有するIDと衝突する場合は全件書き込まない。
   */
  async registerPack(pack: ContentPack, source: PackSource): Promise<RegisterOutcome> {
    try {
      const tx = this.db.transaction(
        ['packs', 'scenarios', 'scenarioVersions', 'questions', 'questionVersions', 'meta'],
        'readwrite',
      );
      const packs = tx.objectStore('packs');
      if ((await packs.getKey(pack.packId)) !== undefined) {
        await tx.done;
        return { status: 'already_registered' };
      }

      const conflicts: IdConflict[] = [];
      for (const s of pack.scenarios) {
        const existing = await tx.objectStore('scenarios').get(s.id);
        if (existing) conflicts.push({ kind: 'scenario', id: s.id, ownerPackId: existing.ownerPackId });
      }
      for (const q of pack.questions) {
        const existing = await tx.objectStore('questions').get(q.id);
        if (existing) conflicts.push({ kind: 'question', id: q.id, ownerPackId: existing.ownerPackId });
      }
      if (conflicts.length > 0) {
        tx.abort();
        await tx.done.catch(() => undefined);
        const list = conflicts.map((c) => `${c.kind === 'scenario' ? 'シーン' : '問題'}「${c.id}」（${c.ownerPackId}）`);
        throw new StorageError('conflict', `既存の教材とIDが衝突しているため登録できません: ${list.join('、')}`);
      }

      const meta = tx.objectStore('meta');
      const seqRow = await meta.get(META_NEXT_SEQ);
      let seq = typeof seqRow?.value === 'number' ? seqRow.value : 0;
      const genRow = await meta.get(META_CONTENT_GENERATION);
      const generation = typeof genRow?.value === 'number' ? genRow.value : 0;

      await packs.put({
        packId: pack.packId,
        title: pack.title,
        source,
        schemaVersion: pack.schemaVersion,
        importedAt: this.clock().toISOString(),
      });
      for (const s of pack.scenarios) {
        const rec: ScenarioRecord = { ...s, ownerPackId: pack.packId, seq: seq++ };
        await tx.objectStore('scenarios').put(rec);
        await tx.objectStore('scenarioVersions').put(rec);
      }
      for (const q of pack.questions) {
        const rec: QuestionRecord = { ...q, ownerPackId: pack.packId, seq: seq++ };
        await tx.objectStore('questions').put(rec);
        await tx.objectStore('questionVersions').put(rec);
      }
      await meta.put({ key: META_NEXT_SEQ, value: seq });
      await meta.put({ key: META_CONTENT_GENERATION, value: generation + 1 });
      await tx.done;
      return { status: 'registered', scenarios: pack.scenarios.length, questions: pack.questions.length };
    } catch (e) {
      throw toStorageError(e);
    }
  }
}
