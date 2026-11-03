import { useCallback } from 'react';
import { useReadyApp } from '../../app/AppContext';
import { hrefFor } from '../../app/router';
import { EmptyState, ErrorState, Loading } from '../../components/States';
import { useAsyncData } from '../../components/useAsyncData';

export function MaterialsPage() {
  const { repo, dataVersion } = useReadyApp();
  const load = useCallback(async () => {
    void dataVersion;
    const [packs, scenarios, questions] = await Promise.all([repo.listPacks(), repo.listScenarios(), repo.listQuestions()]);
    return packs
      .sort((a, b) => a.importedAt.localeCompare(b.importedAt) || a.packId.localeCompare(b.packId))
      .map((p) => ({
        pack: p,
        scenarios: scenarios.filter((s) => s.ownerPackId === p.packId).length,
        questions: questions.filter((q) => q.ownerPackId === p.packId).length,
      }));
  }, [repo, dataVersion]);
  const data = useAsyncData(load);

  if (data.status === 'loading') return <Loading />;
  if (data.status === 'error') return <ErrorState title="教材を読み込めませんでした">再読み込みしてください。</ErrorState>;

  return (
    <div className="page">
      <h1 className="page-title">教材</h1>
      {data.data.length === 0 ? (
        <EmptyState title="登録された教材がありません">
          <p>教材JSONの取り込み機能を追加すると、ここから教材を追加できます。</p>
        </EmptyState>
      ) : (
        <ul className="card-list" aria-label="登録済みの教材">
          {data.data.map(({ pack, scenarios, questions }) => (
            <li key={pack.packId} className="card">
              <h2 className="card-title">{pack.title}</h2>
              <p className="meta-line">
                <span className="badge">{pack.source === 'bundled' ? '同梱' : '取り込み'}</span>
                <span>場面 {scenarios}件</span>
                <span>問題 {questions}問</span>
              </p>
              <p className="muted small">パックID: {pack.packId}</p>
            </li>
          ))}
        </ul>
      )}

      <section className="card">
        <h2>教材の追加・更新</h2>
        <p>教材JSON・音声ファイルの取り込み、差分プレビュー、取り込み履歴は準備中です（実装計画のフェーズ4で追加予定）。</p>
      </section>

      <p className="links">
        <a href={hrefFor({ name: 'settings' })}>設定</a>
        <a href={hrefFor({ name: 'history' })}>学習記録</a>
      </p>
    </div>
  );
}
