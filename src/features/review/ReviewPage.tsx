import { useCallback, useState } from 'react';
import { useReadyApp } from '../../app/AppContext';
import { hrefFor } from '../../app/router';
import { startCustomSession } from '../../app/start-session';
import { isDue, isLastIncorrect, isRepeatedMistake } from '../../domain/review';
import { toStudyDate } from '../../domain/study-date';
import { LEVEL_LABELS, QUESTION_TYPE_LABELS } from '../../components/labels';
import { EmptyState, ErrorState, Loading } from '../../components/States';
import { useAsyncData } from '../../components/useAsyncData';
import { describeStorageError, toStorageError } from '../../repositories/storage-error';
import type { StudyItem } from '../../repositories/practice-repository';
import type { QuestionRecord } from '../../types/db';
import { EMPTY_FILTER, FilterFields, matchesFilter, type QuestionFilter } from '../practice/QuestionFilter';

type Tab = 'today' | 'last_incorrect' | 'repeated' | 'bookmarks';

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: '今日の復習' },
  { id: 'last_incorrect', label: '前回不正解' },
  { id: 'repeated', label: '繰り返し間違える' },
  { id: 'bookmarks', label: 'ブックマーク' },
];

const EMPTY_MESSAGES: Record<Tab, string> = {
  today: '今日が復習日の問題はありません',
  last_incorrect: '前回不正解の問題はありません',
  repeated: '3回以上間違えた未克服の問題はありません',
  bookmarks: 'ブックマークした問題はありません',
};

export function ReviewPage() {
  const { practice, repo, settings, clock, dataVersion, bumpDataVersion } = useReadyApp();
  const [tab, setTab] = useState<Tab>('today');
  const [filter, setFilter] = useState<QuestionFilter>(EMPTY_FILTER);
  const [showMastered, setShowMastered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    void dataVersion;
    const [items, scenarios, bookmarks] = await Promise.all([practice.listStudyItems(), repo.listScenarios(), practice.listBookmarks()]);
    return {
      items,
      scenarios: scenarios.map((s) => ({ id: s.id, title: s.title })),
      tags: [...new Set(items.flatMap((x) => x.question.tags))].sort(),
      bookmarked: new Set(bookmarks.filter((b) => b.targetType === 'question').map((b) => b.targetId)),
    };
  }, [practice, repo, dataVersion]);
  const data = useAsyncData(load);

  if (data.status === 'loading') return <Loading />;
  if (data.status === 'error') return <ErrorState title="復習の一覧を読み込めませんでした">再読み込みしてください。</ErrorState>;
  const { items, scenarios, tags, bookmarked } = data.data;
  const today = toStudyDate(clock(), settings.studyTimeZone);
  const titleOf = new Map(scenarios.map((s) => [s.id, s.title]));

  const inTab = (x: StudyItem): boolean => {
    switch (tab) {
      case 'today':
        return x.state !== undefined && isDue(x.state, today);
      case 'last_incorrect':
        return x.state !== undefined && isLastIncorrect(x.state);
      case 'repeated':
        return x.state !== undefined && isRepeatedMistake(x.state, showMastered);
      case 'bookmarks':
        return bookmarked.has(x.question.id);
    }
  };
  const list = items
    .filter(inTab)
    .filter((x) => matchesFilter(x.question, { ...filter, type: '', bookmarkedOnly: false }, bookmarked))
    .sort(
      (a, b) =>
        (a.state?.nextReviewDate ?? '9999').localeCompare(b.state?.nextReviewDate ?? '9999') || a.question.id.localeCompare(b.question.id),
    );

  async function solve(questions: QuestionRecord[]) {
    setBusy(true);
    setError(null);
    try {
      const s = await startCustomSession(practice, 'review', questions, clock);
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
      <h1 className="page-title">復習</h1>
      <div className="tabs" role="tablist" aria-label="復習の一覧">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="review-panel"
            className="tab"
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id="review-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        <details className="card filter-card">
          <summary>絞り込み</summary>
          <FilterFields filter={filter} onChange={setFilter} scenarios={scenarios} tags={tags} showType={false} showBookmark={false} />
          {tab === 'repeated' && (
            <label className="check">
              <input type="checkbox" checked={showMastered} onChange={(e) => setShowMastered(e.target.checked)} />
              克服済みも表示
            </label>
          )}
        </details>

        {list.length === 0 ? (
          <EmptyState
            title={EMPTY_MESSAGES[tab]}
            actions={
              <a className="button" href={hrefFor({ name: 'practice' })}>
                問題演習へ
              </a>
            }
          >
            {tab === 'bookmarks' && <p>問題を解くときに「☆ ブックマーク」で追加できます。</p>}
          </EmptyState>
        ) : (
          <>
            <button type="button" className="button button-primary button-block" disabled={busy} onClick={() => solve(list.map((x) => x.question))}>
              表示中の{list.length}問をまとめて解く
            </button>
            {error && (
              <p role="alert" className="help help-error">
                ⚠ 開始できませんでした。{error}
              </p>
            )}
            <ul className="card-list review-list" aria-label="問題の一覧">
              {list.map(({ question: q, state }) => (
                <li key={q.id} className="card">
                  <p className="card-title">{q.prompt}</p>
                  <p className="meta-line">
                    <span className="badge">{QUESTION_TYPE_LABELS[q.type]}</span>
                    <span className="badge">{LEVEL_LABELS[q.level]}</span>
                    <span>{titleOf.get(q.scenarioId) ?? q.scenarioId}</span>
                    {bookmarked.has(q.id) && <span>★ブックマーク</span>}
                  </p>
                  <dl className="state-line">
                    <div>
                      <dt>累計不正解</dt>
                      <dd>{state?.incorrectCount ?? 0}回</dd>
                    </div>
                    <div>
                      <dt>最新結果</dt>
                      <dd>{state?.lastResult === 'correct' ? '○ 正解' : state?.lastResult === 'incorrect' ? '× 不正解' : '未回答'}</dd>
                    </div>
                    <div>
                      <dt>復習日</dt>
                      <dd>{state?.nextReviewDate ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>状態</dt>
                      <dd>{state?.mastered ? '克服済み' : state ? '学習中' : '未学習'}</dd>
                    </div>
                  </dl>
                  <button type="button" className="button button-small" disabled={busy} onClick={() => solve([q])}>
                    この問題を解く
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
