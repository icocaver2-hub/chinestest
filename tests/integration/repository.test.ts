import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { registerBundledContent, type FetchText } from '../../src/app/bootstrap';
import { fixedClock } from '../../src/domain/clock';
import { validatePackObject } from '../../src/domain/import-validation';
import { BACKUP_STORES, DB_VERSION, openStudyDb, type StudyDatabase } from '../../src/repositories/db';
import { StorageError } from '../../src/repositories/storage-error';
import { META_CONTENT_GENERATION, StudyRepository } from '../../src/repositories/study-repository';
import type { ContentPack } from '../../src/types/content';
import { readText, starterPack } from '../helpers/fixtures';

const clock = fixedClock('2026-11-01T00:00:00Z');
let counter = 0;
const opened: StudyDatabase[] = [];

async function freshRepo(name = `test-db-${++counter}`) {
  const db = await openStudyDb({ name });
  opened.push(db);
  return { repo: new StudyRepository(db, clock), name };
}

afterEach(() => {
  while (opened.length) opened.pop()?.close();
});

function validPack(raw = starterPack()): ContentPack {
  const r = validatePackObject(raw);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}

/** public/content/ を返す擬似fetch */
function fakeFetch(files: Record<string, string | Error>): FetchText {
  return async (url) => {
    const key = url.replace(/^.*\/content\//, '');
    const v = files[key];
    if (v === undefined) return { ok: false, status: 404, text: async () => '' };
    if (v instanceof Error) throw v;
    return { ok: true, status: 200, text: async () => v };
  };
}

/** サンプル教材だけを同梱とみなす（テストを小さく保つため） */
const bundled = () =>
  fakeFetch({
    'index.json': '{"bundledPacks":["sample-meal.json"]}',
    'sample-meal.json': readText('public/content/sample-meal.json'),
  });

describe('IndexedDBの作成', () => {
  it('docs/04のストアをすべて作成する', async () => {
    const { repo } = await freshRepo();
    expect(repo.db.version).toBe(DB_VERSION);
    const names = [...repo.db.objectStoreNames].sort();
    expect(names).toEqual([...BACKUP_STORES, 'meta'].sort());
    const tx = repo.db.transaction(['questions', 'questionStates', 'attempts']);
    expect([...tx.objectStore('questions').indexNames].sort()).toEqual(['level', 'ownerPackId', 'scenarioId', 'type']);
    expect([...tx.objectStore('questionStates').indexNames]).toEqual(['nextReviewDate']);
    expect(tx.objectStore('questionStates').keyPath).toEqual(['questionId', 'revision']);
    expect([...tx.objectStore('attempts').indexNames].sort()).toEqual(['questionId', 'sessionId', 'studyDate']);
    await tx.done;
  });

  it('同じDBを開き直してもデータが残る', async () => {
    const { repo, name } = await freshRepo();
    await repo.registerPack(validPack(), 'bundled');
    repo.db.close();
    const again = await freshRepo(name);
    expect(await again.repo.db.count('questions')).toBe(3);
  });
});

describe('初期教材の登録（T01）', () => {
  it('サンプルJSONが検査・保存され、シーンと3問が登録される', async () => {
    const { repo } = await freshRepo();
    const report = await registerBundledContent(repo, bundled(), '/base/');
    expect(report.packs).toEqual([{ file: 'sample-meal.json', packId: 'sample-meal', status: 'registered' }]);
    expect(report.noContent).toBe(false);

    const packs = await repo.listPacks();
    expect(packs).toEqual([
      { packId: 'sample-meal', title: '取り込みサンプル：ご両親との食事', source: 'bundled', schemaVersion: 1, importedAt: '2026-11-01T00:00:00.000Z' },
    ]);
    const scenarios = await repo.listScenarios();
    expect(scenarios.map((s) => [s.id, s.ownerPackId, s.revision])).toEqual([['sample-meal-scene', 'sample-meal', 1]]);
    const questions = await repo.listQuestions();
    expect(questions.map((q) => q.id)).toEqual(['sample-meal-q001', 'sample-meal-q002', 'sample-meal-q003']);
    expect(await repo.db.count('scenarioVersions')).toBe(1);
    expect(await repo.db.get('questionVersions', ['sample-meal-q002', 1])).toMatchObject({ type: 'ordering' });
    // 本文はそのまま保存される
    const { ownerPackId: _o, seq: _s, ...stored } = questions[0]!;
    expect(stored).toEqual(starterPack().questions[0]);
  });

  it('再起動（再登録）しても増殖しない', async () => {
    const { repo, name } = await freshRepo();
    await registerBundledContent(repo, bundled(), '/');
    const gen = await repo.getContentGeneration();
    repo.db.close();

    const { repo: repo2 } = await freshRepo(name);
    const report = await registerBundledContent(repo2, bundled(), '/');
    expect(report.packs[0]?.status).toBe('already_registered');
    expect(await repo2.db.count('packs')).toBe(1);
    expect(await repo2.db.count('scenarios')).toBe(1);
    expect(await repo2.db.count('questions')).toBe(3);
    expect(await repo2.db.count('questionVersions')).toBe(3);
    expect(await repo2.getContentGeneration()).toBe(gen);
  });

  it('同時に2回起動しても1回だけ登録される', async () => {
    const { repo, name } = await freshRepo();
    const { repo: repo2 } = await freshRepo(name);
    const [a, b] = await Promise.all([
      registerBundledContent(repo, bundled(), '/'),
      registerBundledContent(repo2, bundled(), '/'),
    ]);
    expect([a.packs[0]?.status, b.packs[0]?.status].sort()).toEqual(['already_registered', 'registered']);
    expect(await repo.db.count('questions')).toBe(3);
  });

  it('登録済み判定はpacksストアで行う（metaが失われても重複しない）', async () => {
    const { repo } = await freshRepo();
    await registerBundledContent(repo, bundled(), '/');
    await repo.db.clear('meta');
    await registerBundledContent(repo, bundled(), '/');
    expect(await repo.db.count('questions')).toBe(3);
  });

  it('不正な同梱教材は1件も保存しない', async () => {
    const { repo } = await freshRepo();
    const broken = starterPack();
    broken.questions[0].answerId = 'zz';
    const report = await registerBundledContent(
      repo,
      fakeFetch({ 'index.json': '{"bundledPacks":["sample-meal.json"]}', 'sample-meal.json': JSON.stringify(broken) }),
      '/',
    );
    expect(report.packs[0]?.status).toBe('invalid');
    expect(report.packs[0]?.issues?.[0]?.path).toBe('questions[0].answerId');
    expect(report.noContent).toBe(true);
    for (const store of BACKUP_STORES) expect(await repo.db.count(store)).toBe(0);
  });

  it('他パックが所有するIDと衝突したら全件書き込まない', async () => {
    const { repo } = await freshRepo();
    await repo.registerPack(validPack(), 'bundled');
    const other = starterPack();
    other.packId = 'other-pack';
    other.scenarios[0].id = 'other-scene';
    for (const q of other.questions) q.scenarioId = 'other-scene';
    other.questions[2].id = 'other-q003';
    // questions[0], [1] のIDは sample-meal と衝突
    const err = await repo.registerPack(validPack(other), 'imported').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StorageError);
    expect((err as StorageError).kind).toBe('conflict');
    expect((err as StorageError).message).toContain('sample-meal-q001');
    expect(await repo.hasPack('other-pack')).toBe(false);
    expect(await repo.getScenario('other-scene')).toBeUndefined();
    expect(await repo.db.count('questions')).toBe(3);
  });

  it('初回オフラインで教材の一覧を取得できなければ、接続が必要と分かる', async () => {
    const { repo } = await freshRepo();
    const report = await registerBundledContent(repo, fakeFetch({ 'index.json': new TypeError('Failed to fetch') }), '/');
    expect(report).toEqual({ indexUnavailable: true, packs: [], noContent: true });
  });

  it('登録済みならオフラインでも保存済みの教材で起動できる', async () => {
    const { repo } = await freshRepo();
    await registerBundledContent(repo, bundled(), '/');
    const report = await registerBundledContent(repo, fakeFetch({ 'index.json': new TypeError('offline') }), '/');
    expect(report.indexUnavailable).toBe(true);
    expect(report.noContent).toBe(false);
  });

  it('教材世代番号は登録ごとに増える', async () => {
    const { repo } = await freshRepo();
    expect(await repo.getContentGeneration()).toBe(0);
    await repo.registerPack(validPack(), 'bundled');
    expect((await repo.db.get('meta', META_CONTENT_GENERATION))?.value).toBe(1);
  });
});

describe('実際の同梱教材', () => {
  it('public/content/index.json の教材（core-family: 6シーン48問）が登録される', async () => {
    const { repo } = await freshRepo();
    const index = JSON.parse(readText('public/content/index.json')) as { bundledPacks: string[] };
    const files: Record<string, string> = { 'index.json': readText('public/content/index.json') };
    for (const f of index.bundledPacks) files[f] = readText(`public/content/${f}`);
    const report = await registerBundledContent(repo, fakeFetch(files), '/');
    expect(report.packs.map((p) => [p.packId, p.status])).toEqual([['core-family', 'registered']]);
    expect(await repo.db.count('scenarios')).toBe(6);
    expect(await repo.db.count('questions')).toBe(48);
  });

  it('サンプルを登録済みの利用者にも core-family が追加され、サンプルは残る', async () => {
    const { repo } = await freshRepo();
    await registerBundledContent(repo, bundled(), '/');
    const files = {
      'index.json': readText('public/content/index.json'),
      'core-family.json': readText('public/content/core-family.json'),
    };
    await registerBundledContent(repo, fakeFetch(files), '/');
    expect((await repo.listPacks()).map((p) => p.packId).sort()).toEqual(['core-family', 'sample-meal']);
    expect(await repo.db.count('questions')).toBe(51);
  });
});

describe('設定', () => {
  it('未保存なら既定値、保存すると再起動後も保持される', async () => {
    const { repo, name } = await freshRepo();
    expect(await repo.getSettings()).toEqual({
      dailyQuestionCount: 10,
      showPinyin: true,
      showTranslation: true,
      studyTimeZone: 'Asia/Tokyo',
    });
    await repo.saveSettings({ dailyQuestionCount: 15, showPinyin: false });
    repo.db.close();
    const { repo: again } = await freshRepo(name);
    expect(await again.getSettings()).toMatchObject({ dailyQuestionCount: 15, showPinyin: false, showTranslation: true });
  });

  it('不正な値を含む更新は何も保存しない（保存済みの値を上書きしない）', async () => {
    const { repo } = await freshRepo();
    await repo.saveSettings({ dailyQuestionCount: 15 });
    await expect(repo.saveSettings({ dailyQuestionCount: 100, showPinyin: false })).rejects.toThrow(RangeError);
    await expect(repo.saveSettings({ studyTimeZone: 'Not/AZone' })).rejects.toThrow(RangeError);
    expect(await repo.getSettings()).toMatchObject({ dailyQuestionCount: 15, showPinyin: true, studyTimeZone: 'Asia/Tokyo' });
  });
});
