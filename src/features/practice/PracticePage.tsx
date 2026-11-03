import { useCallback, useId, useState } from 'react';
import { useReadyApp } from '../../app/AppContext';
import { hrefFor } from '../../app/router';
import { startCustomSession } from '../../app/start-session';
import { EmptyState, ErrorState, Loading } from '../../components/States';
import { useAsyncData } from '../../components/useAsyncData';
import { describeStorageError, toStorageError } from '../../repositories/storage-error';
import { EMPTY_FILTER, FilterFields, matchesFilter, type QuestionFilter } from './QuestionFilter';

const MAX_COUNT = 50;

export function PracticePage() {
  const { repo, practice, settings, clock, dataVersion, bumpDataVersion } = useReadyApp();
  const [filter, setFilter] = useState<QuestionFilter>(EMPTY_FILTER);
  const [count, setCount] = useState(String(settings.dailyQuestionCount));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const countId = useId();

  const load = useCallback(async () => {
    void dataVersion;
    const [questions, scenarios, bookmarks] = await Promise.all([repo.listQuestions(), repo.listScenarios(), practice.listBookmarks()]);
    return {
      questions,
      scenarios: scenarios.map((s) => ({ id: s.id, title: s.title })),
      tags: [...new Set(questions.flatMap((q) => q.tags))].sort(),
      bookmarked: new Set(bookmarks.filter((b) => b.targetType === 'question').map((b) => b.targetId)),
    };
  }, [repo, practice, dataVersion]);
  const data = useAsyncData(load);

  if (data.status === 'loading') return <Loading />;
  if (data.status === 'error') return <ErrorState title="問題を読み込めませんでした">再読み込みしてください。</ErrorState>;
  const { questions, scenarios, tags, bookmarked } = data.data;

  if (questions.length === 0) {
    return (
      <div className="page">
        <h1 className="page-title">問題演習</h1>
        <EmptyState title="登録された問題がありません" actions={<a className="button" href={hrefFor({ name: 'materials' })}>教材画面を開く</a>}>
          <p>教材を追加すると、ここで問題を解けます。</p>
        </EmptyState>
      </div>
    );
  }

  const matched = questions.filter((q) => matchesFilter(q, filter, bookmarked));
  const n = Number(count);
  const countValid = Number.isInteger(n) && n >= 1 && n <= MAX_COUNT;

  async function start() {
    if (!countValid) return;
    setBusy(true);
    setError(null);
    try {
      const s = await startCustomSession(practice, 'practice', matched.slice(0, n), clock);
      bumpDataVersion();
      if (s) window.location.hash = hrefFor({ name: 'session', id: s.sessionId });
      else setBusy(false);
    } catch (e) {
      setError(describeStorageError(toStorageError(e)));
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">問題演習</h1>
      <section className="card">
        <h2>出題の条件</h2>
        <FilterFields filter={filter} onChange={setFilter} scenarios={scenarios} tags={tags} />
        <div className="field">
          <label htmlFor={countId}>問題数</label>
          <input
            id={countId}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_COUNT}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            aria-invalid={!countValid}
          />
          {!countValid && <p className="help help-error">⚠ 1〜{MAX_COUNT}の整数で指定してください。</p>}
        </div>
        <p role="status" aria-live="polite">
          条件に合う問題: {matched.length}問
          {matched.length > 0 && countValid && `（${Math.min(n, matched.length)}問を出題）`}
        </p>
        {matched.length === 0 ? (
          <div className="row-actions">
            <button type="button" className="button" onClick={() => setFilter(EMPTY_FILTER)}>
              絞り込みを解除
            </button>
          </div>
        ) : (
          <button type="button" className="button button-primary button-block" disabled={busy || !countValid} onClick={start}>
            演習を始める
          </button>
        )}
        <p className="small muted">期限前の問題に正解しても、復習日は前倒し・延長されません。</p>
        {error && (
          <p role="alert" className="help help-error">
            ⚠ 開始できませんでした。{error}
          </p>
        )}
      </section>
    </div>
  );
}
