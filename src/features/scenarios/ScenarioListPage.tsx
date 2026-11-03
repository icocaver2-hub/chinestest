import { useCallback, useId, useState } from 'react';
import { useReadyApp } from '../../app/AppContext';
import { hrefFor } from '../../app/router';
import { CATEGORY_LABELS, LEVEL_LABELS } from '../../components/labels';
import { EmptyState, ErrorState, Loading } from '../../components/States';
import { useAsyncData } from '../../components/useAsyncData';
import { LEVELS, type Level, type ScenarioCategory } from '../../types/content';
import type { ScenarioRecord } from '../../types/db';

function hasAudio(s: ScenarioRecord): boolean {
  return s.turns.some((t) => t.audioId !== undefined);
}

export function ScenarioListPage() {
  const { repo, dataVersion } = useReadyApp();
  const [category, setCategory] = useState<ScenarioCategory | ''>('');
  const [level, setLevel] = useState<Level | ''>('');
  const catId = useId();
  const levelId = useId();

  const load = useCallback(async () => {
    void dataVersion;
    const [scenarios, counts] = await Promise.all([repo.listScenarios(), repo.countQuestionsByScenario()]);
    return { scenarios, counts };
  }, [repo, dataVersion]);
  const data = useAsyncData(load);

  if (data.status === 'loading') return <Loading />;
  if (data.status === 'error') return <ErrorState title="場面の一覧を読み込めませんでした">再読み込みしてください。</ErrorState>;

  const { scenarios, counts } = data.data;
  const categories = [...new Set(scenarios.map((s) => s.category))];
  const filtered = scenarios.filter((s) => (category === '' || s.category === category) && (level === '' || s.level === level));

  return (
    <div className="page">
      <h1 className="page-title">場面別の会話</h1>
      {scenarios.length === 0 ? (
        <EmptyState
          title="登録された場面がありません"
          actions={
            <a className="button" href={hrefFor({ name: 'materials' })}>
              教材画面を開く
            </a>
          }
        >
          <p>教材を追加すると、ここに場面別の会話が表示されます。</p>
        </EmptyState>
      ) : (
        <>
          <div className="filters">
            <label htmlFor={catId}>カテゴリ</label>
            <select id={catId} value={category} onChange={(e) => setCategory(e.target.value as ScenarioCategory | '')}>
              <option value="">すべて</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            <label htmlFor={levelId}>難易度</label>
            <select id={levelId} value={level} onChange={(e) => setLevel(e.target.value as Level | '')}>
              <option value="">すべて</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABELS[l]}
                </option>
              ))}
            </select>
          </div>
          {filtered.length === 0 ? (
            <EmptyState
              title="条件に合う場面がありません"
              actions={
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setCategory('');
                    setLevel('');
                  }}
                >
                  絞り込みを解除
                </button>
              }
            />
          ) : (
            <ul className="card-list" aria-label="場面の一覧">
              {filtered.map((s) => (
                <li key={s.id} className="card">
                  <h2 className="card-title">
                    <a href={hrefFor({ name: 'scenario', id: s.id })}>{s.title}</a>
                  </h2>
                  <p>{s.goal}</p>
                  <p className="meta-line">
                    <span className="badge">{CATEGORY_LABELS[s.category]}</span>
                    <span className="badge">{LEVEL_LABELS[s.level]}</span>
                    <span>関連問題 {counts.get(s.id) ?? 0}問</span>
                    <span>{hasAudio(s) ? '音声あり' : '音声未収録'}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
