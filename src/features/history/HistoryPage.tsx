import { useCallback } from 'react';
import { useReadyApp } from '../../app/AppContext';
import { hrefFor } from '../../app/router';
import { EmptyState, ErrorState, Loading } from '../../components/States';
import { useAsyncData } from '../../components/useAsyncData';

export function HistoryPage() {
  const { repo, dataVersion } = useReadyApp();
  const load = useCallback(async () => {
    void dataVersion;
    const [attempts, conversations] = await Promise.all([repo.db.count('attempts'), repo.db.count('conversationAttempts')]);
    return { attempts, conversations };
  }, [repo, dataVersion]);
  const data = useAsyncData(load);

  if (data.status === 'loading') return <Loading />;
  if (data.status === 'error') return <ErrorState title="学習記録を読み込めませんでした">再読み込みしてください。</ErrorState>;

  return (
    <div className="page">
      <h1 className="page-title">学習記録</h1>
      {data.data.attempts === 0 && data.data.conversations === 0 ? (
        <EmptyState
          title="まだ学習記録はありません"
          actions={
            <a className="button" href={hrefFor({ name: 'scenarios' })}>
              場面別の会話を見る
            </a>
          }
        >
          <p>問題に回答したり会話を自己評価したりすると、ここに記録が表示されます。</p>
        </EmptyState>
      ) : (
        <dl className="stats card">
          <div>
            <dt>問題の回答（自動採点）</dt>
            <dd>{data.data.attempts}件</dd>
          </div>
          <div>
            <dt>会話の自己評価</dt>
            <dd>{data.data.conversations}件</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
