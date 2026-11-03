import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { systemClock, type Clock } from '../domain/clock';
import { openStudyDb } from '../repositories/db';
import { describeStorageError, StorageError, toStorageError } from '../repositories/storage-error';
import { StudyRepository } from '../repositories/study-repository';
import type { Settings } from '../types/db';
import { describeBundledProblems, registerBundledContent, type FetchText } from './bootstrap';

export type AppErrorKind = 'db_unavailable' | 'blocked' | 'quota' | 'needs_connection' | 'unknown';

export type AppState =
  | { status: 'loading' }
  | { status: 'error'; kind: AppErrorKind; message: string }
  | { status: 'ready'; repo: StudyRepository; settings: Settings; warnings: string[]; noContent: boolean };

interface AppContextValue {
  state: AppState;
  clock: Clock;
  retry: () => void;
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>;
  /** 教材やDBが変わったときに画面のデータを読み直すための番号 */
  dataVersion: number;
  bumpDataVersion: () => void;
}

const Ctx = createContext<AppContextValue | null>(null);

const browserFetch: FetchText = (url) => fetch(url, { cache: 'no-cache', credentials: 'same-origin' });

function errorKindOf(e: StorageError): AppErrorKind {
  if (e.kind === 'quota') return 'quota';
  if (e.kind === 'blocked') return 'blocked';
  if (e.kind === 'unavailable') return 'db_unavailable';
  return 'unknown';
}

async function start(clock: Clock, onVersionChange: () => void, onBlocked: () => void): Promise<AppState> {
  if (typeof indexedDB === 'undefined') {
    return { status: 'error', kind: 'db_unavailable', message: describeStorageError(new StorageError('unavailable', '')) };
  }
  let repo: StudyRepository;
  try {
    const db = await openStudyDb({ onVersionChange, onBlocked });
    repo = new StudyRepository(db, clock);
  } catch (e) {
    const se = toStorageError(e);
    const kind = se.kind === 'unknown' ? 'db_unavailable' : errorKindOf(se);
    return { status: 'error', kind, message: `${describeStorageError(new StorageError(kind === 'db_unavailable' ? 'unavailable' : se.kind, se.message))}` };
  }
  try {
    const report = await registerBundledContent(repo, browserFetch, import.meta.env.BASE_URL);
    if (report.indexUnavailable && report.noContent) {
      return {
        status: 'error',
        kind: 'needs_connection',
        message: '初回の準備には、このサイトへの接続が必要です。接続を確認してから再試行してください。',
      };
    }
    const warnings = describeBundledProblems(report);
    if (report.indexUnavailable) warnings.unshift('同梱教材の一覧を確認できませんでした。保存済みの教材で学習できます。');
    const settings = await repo.getSettings();
    return { status: 'ready', repo, settings, warnings, noContent: report.noContent };
  } catch (e) {
    const se = toStorageError(e);
    return { status: 'error', kind: errorKindOf(se), message: describeStorageError(se) };
  }
}

export function AppProvider({ children, clock = systemClock }: { children: ReactNode; clock?: Clock }) {
  const [state, setState] = useState<AppState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const onVersionChange = () =>
      setState({
        status: 'error',
        kind: 'blocked',
        message: '別のタブで新しい版のアプリが開かれたため、このタブの接続を閉じました。ページを再読み込みしてください。',
      });
    const onBlocked = () =>
      setState({ status: 'error', kind: 'blocked', message: describeStorageError(new StorageError('blocked', '')) });
    void start(clock, onVersionChange, onBlocked).then((s) => {
      if (!cancelled) setState(s);
      else if (s.status === 'ready') s.repo.db.close();
    });
    return () => {
      cancelled = true;
    };
  }, [clock, attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      if (state.status !== 'ready') throw new Error('準備が完了していません');
      const next = await state.repo.saveSettings(patch);
      setState({ ...state, settings: next });
      return next;
    },
    [state],
  );

  const bumpDataVersion = useCallback(() => setDataVersion((n) => n + 1), []);

  return (
    <Ctx.Provider value={{ state, clock, retry, updateSettings, dataVersion, bumpDataVersion }}>{children}</Ctx.Provider>
  );
}

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProviderの外で使用されています');
  return v;
}

/** 準備完了後の画面でだけ使う */
export function useReadyApp() {
  const app = useApp();
  if (app.state.status !== 'ready') throw new Error('準備が完了していません');
  return { ...app, state: app.state, repo: app.state.repo, settings: app.state.settings };
}
