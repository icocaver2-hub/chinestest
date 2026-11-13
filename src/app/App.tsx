import { useEffect } from 'react';
import { Layout } from '../components/Layout';
import { ErrorState, Loading } from '../components/States';
import { HistoryPage } from '../features/history/HistoryPage';
import { HomePage } from '../features/home/HomePage';
import { MaterialsPage } from '../features/materials/MaterialsPage';
import { NotFoundPage } from '../features/NotFoundPage';
import { PracticePage } from '../features/practice/PracticePage';
import { ReviewPage } from '../features/review/ReviewPage';
import { SessionPage } from '../features/practice/SessionPage';
import { ScenarioDetailPage } from '../features/scenarios/ScenarioDetailPage';
import { ScenarioListPage } from '../features/scenarios/ScenarioListPage';
import { TalkPage } from '../features/scenarios/TalkPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { useApp, type AppErrorKind } from './AppContext';
import { parseHash, useHash, type Route } from './router';

const ERROR_TITLES: Record<AppErrorKind, string> = {
  db_unavailable: '保存領域を利用できません',
  blocked: '別のタブでアプリが開かれています',
  quota: '保存領域が不足しています',
  needs_connection: '初回の準備に接続が必要です',
  unknown: '準備中に問題が発生しました',
};

function Page({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <HomePage />;
    case 'scenarios':
      return <ScenarioListPage />;
    case 'scenario':
      return <ScenarioDetailPage key={route.id} id={route.id} />;
    case 'scenario_talk':
      return <TalkPage key={route.id} id={route.id} />;
    case 'practice':
      return <PracticePage />;
    case 'review':
      return <ReviewPage />;
    case 'materials':
      return <MaterialsPage />;
    case 'settings':
      return <SettingsPage />;
    case 'history':
      return <HistoryPage />;
    case 'session':
      return <SessionPage key={route.id} id={route.id} />;
    case 'not_found':
      return <NotFoundPage path={route.path} />;
  }
}

export function App() {
  const { state, retry } = useApp();
  const hash = useHash();
  const route = parseHash(hash);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [hash]);

  let body;
  if (state.status === 'loading') {
    body = <Loading label="学習データを準備しています…" />;
  } else if (state.status === 'error') {
    body = (
      <ErrorState
        title={ERROR_TITLES[state.kind]}
        actions={
          state.kind === 'blocked' ? (
            <button type="button" className="button" onClick={() => window.location.reload()}>
              再読み込み
            </button>
          ) : (
            <button type="button" className="button button-primary" onClick={retry}>
              再試行
            </button>
          )
        }
      >
        <p>{state.message}</p>
      </ErrorState>
    );
  } else {
    body = (
      <>
        {state.warnings.length > 0 && (
          <div className="notice" role="status">
            {state.warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </div>
        )}
        <Page route={route} />
      </>
    );
  }

  return <Layout route={route}>{body}</Layout>;
}
