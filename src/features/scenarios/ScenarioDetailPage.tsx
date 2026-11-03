import { useCallback } from 'react';
import { useReadyApp } from '../../app/AppContext';
import { hrefFor } from '../../app/router';
import { CATEGORY_LABELS, LEVEL_LABELS, QUESTION_TYPE_LABELS } from '../../components/labels';
import { EmptyState, ErrorState, Loading } from '../../components/States';
import { useAsyncData } from '../../components/useAsyncData';

export function ScenarioDetailPage({ id }: { id: string }) {
  const { repo, settings, dataVersion } = useReadyApp();
  const load = useCallback(async () => {
    void dataVersion;
    const [scenario, questions] = await Promise.all([repo.getScenario(id), repo.listQuestionsByScenario(id)]);
    return { scenario, questions };
  }, [repo, id, dataVersion]);
  const data = useAsyncData(load);

  if (data.status === 'loading') return <Loading />;
  if (data.status === 'error') return <ErrorState title="場面を読み込めませんでした">再読み込みしてください。</ErrorState>;
  const { scenario: s, questions } = data.data;
  if (!s) {
    return (
      <EmptyState
        title="この場面は見つかりません"
        actions={
          <a className="button" href={hrefFor({ name: 'scenarios' })}>
            場面の一覧へ戻る
          </a>
        }
      >
        <p>教材が更新されたか、URLが正しくない可能性があります。</p>
      </EmptyState>
    );
  }

  return (
    <article className="page">
      <p className="small">
        <a href={hrefFor({ name: 'scenarios' })}>← 場面の一覧</a>
      </p>
      <h1 className="page-title">{s.title}</h1>
      <p className="meta-line">
        <span className="badge">{CATEGORY_LABELS[s.category]}</span>
        <span className="badge">{LEVEL_LABELS[s.level]}</span>
        <span>{s.turns.some((t) => t.audioId !== undefined) ? '音声あり（再生機能は準備中）' : '音声未収録'}</span>
      </p>

      <section className="card">
        <h2>場面と目標</h2>
        <p>{s.situation}</p>
        <p>
          <strong>目標:</strong> {s.goal}
        </p>
      </section>

      <section className="card">
        <h2>会話例</h2>
        <ol className="turns">
          {s.turns.map((t) => (
            <li key={t.id} className={`turn turn-${t.role}`}>
              <p className="speaker">{t.speaker}</p>
              <p className="zh" lang="zh-CN">
                {t.zh}
              </p>
              {settings.showPinyin && (
                <p className="pinyin" lang="zh-Latn-pinyin">
                  {t.pinyin}
                </p>
              )}
              {settings.showTranslation && <p className="ja">{t.ja}</p>}
            </li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h2>重要表現</h2>
        <ul className="phrases">
          {s.phrases.map((p, i) => (
            <li key={i}>
              <span className="zh" lang="zh-CN">
                {p.zh}
              </span>
              {settings.showPinyin && (
                <span className="pinyin" lang="zh-Latn-pinyin">
                  {' '}
                  {p.pinyin}
                </span>
              )}
              {settings.showTranslation && <span className="ja"> — {p.ja}</span>}
              <p className="small muted">{p.note}</p>
            </li>
          ))}
        </ul>
      </section>

      {s.substitutions.length > 0 && (
        <section className="card">
          <h2>置き換え例</h2>
          <ul>
            {s.substitutions.map((p, i) => (
              <li key={i}>
                <span className="zh" lang="zh-CN">
                  {p.zh}
                </span>
                {settings.showPinyin && (
                  <span className="pinyin" lang="zh-Latn-pinyin">
                    {' '}
                    {p.pinyin}
                  </span>
                )}
                {settings.showTranslation && <span className="ja"> — {p.ja}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {s.notes.length > 0 && (
        <section className="card">
          <h2>補足</h2>
          <ul>
            {s.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>関連問題</h2>
        {questions.length === 0 ? (
          <p>この場面の問題はまだありません。</p>
        ) : (
          <ul>
            {questions.map((q) => (
              <li key={q.id}>
                {QUESTION_TYPE_LABELS[q.type]}: {q.prompt}
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">会話練習・問題演習は準備中です（フェーズ2・3で追加予定）。</p>
      </section>
    </article>
  );
}
