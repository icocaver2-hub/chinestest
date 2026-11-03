/**
 * 起動処理（docs/02「起動」）: DBを開き、同梱教材が未登録なら05と同じ検査を経て登録する。
 * 同梱教材の再配信で利用者の教材や履歴を上書きしない（登録済みのパックは書き換えない）。
 */
import { formatIssue, validatePackText, type ValidationIssue } from '../domain/import-validation';
import type { StudyRepository } from '../repositories/study-repository';
import { StorageError, toStorageError } from '../repositories/storage-error';

export interface BundledIndex {
  bundledPacks: string[];
}

export type FetchText = (url: string) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export interface BundledPackReport {
  file: string;
  packId?: string;
  status: 'registered' | 'already_registered' | 'invalid' | 'fetch_failed' | 'storage_failed';
  issues?: ValidationIssue[];
  message?: string;
}

export interface BootstrapReport {
  /** 同梱教材の一覧を取得できなかった（初回オフラインなど） */
  indexUnavailable: boolean;
  packs: BundledPackReport[];
  /** 学習に使える教材が1件もない */
  noContent: boolean;
}

const INDEX_FILE = 'content/index.json';

function isBundledIndex(v: unknown): v is BundledIndex {
  return (
    typeof v === 'object' &&
    v !== null &&
    Array.isArray((v as BundledIndex).bundledPacks) &&
    (v as BundledIndex).bundledPacks.every((f) => typeof f === 'string' && /^[a-z0-9][a-z0-9_.-]*\.json$/.test(f))
  );
}

async function fetchText(fetcher: FetchText, url: string): Promise<string> {
  const res = await fetcher(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export async function registerBundledContent(
  repo: StudyRepository,
  fetcher: FetchText,
  baseUrl: string,
): Promise<BootstrapReport> {
  const reports: BundledPackReport[] = [];
  let index: BundledIndex | null = null;
  try {
    const parsed: unknown = JSON.parse(await fetchText(fetcher, `${baseUrl}${INDEX_FILE}`));
    if (isBundledIndex(parsed)) index = parsed;
  } catch {
    index = null;
  }

  if (index) {
    // 取得と検査をすべて済ませてから、パックごとに1トランザクションで登録する
    for (const file of index.bundledPacks) {
      let text: string;
      try {
        text = await fetchText(fetcher, `${baseUrl}content/${file}`);
      } catch (e) {
        reports.push({ file, status: 'fetch_failed', message: e instanceof Error ? e.message : String(e) });
        continue;
      }
      const known = await repo.listScenarioIds();
      const result = validatePackText(text, { knownScenarioIds: known });
      if (!result.ok) {
        reports.push({ file, status: 'invalid', issues: result.error });
        continue;
      }
      const pack = result.value;
      try {
        const outcome = await repo.registerPack(pack, 'bundled');
        reports.push({ file, packId: pack.packId, status: outcome.status });
      } catch (e) {
        const se = toStorageError(e);
        if (se.kind === 'quota' || se.kind === 'unavailable') throw se;
        reports.push({ file, packId: pack.packId, status: 'storage_failed', message: se.message });
      }
    }
  }

  const noContent = (await repo.listPacks()).length === 0;
  return { indexUnavailable: index === null, packs: reports, noContent };
}

/** 利用者向けに、同梱教材の問題を1行ずつの説明にする */
export function describeBundledProblems(report: BootstrapReport): string[] {
  const lines: string[] = [];
  for (const p of report.packs) {
    if (p.status === 'invalid') {
      lines.push(`同梱教材 ${p.file} に不正な箇所があるため登録しませんでした。`);
      for (const issue of (p.issues ?? []).slice(0, 5)) lines.push(`・${formatIssue(issue)}`);
    } else if (p.status === 'fetch_failed') {
      lines.push(`同梱教材 ${p.file} を読み込めませんでした（${p.message ?? '不明な理由'}）。`);
    } else if (p.status === 'storage_failed') {
      lines.push(`同梱教材 ${p.file} を保存できませんでした（${p.message ?? '不明な理由'}）。`);
    }
  }
  return lines;
}

export { StorageError };
