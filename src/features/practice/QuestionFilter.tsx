import { useId } from 'react';
import { LEVEL_LABELS, QUESTION_TYPE_LABELS } from '../../components/labels';
import { LEVELS, type Level, type QuestionType } from '../../types/content';
import type { QuestionFilter } from './question-filter';

export { EMPTY_FILTER, matchesFilter, type QuestionFilter } from './question-filter';

const TYPES: QuestionType[] = ['single_choice', 'ordering', 'fill_blank'];

/** テーマ（場面・タグ）・形式・難易度の絞り込み。問題演習と復習で共用する。 */
export function FilterFields({
  filter,
  onChange,
  scenarios,
  tags,
  showType = true,
  showBookmark = true,
}: {
  filter: QuestionFilter;
  onChange: (f: QuestionFilter) => void;
  scenarios: { id: string; title: string }[];
  tags: string[];
  showType?: boolean;
  showBookmark?: boolean;
}) {
  const ids = { scene: useId(), tag: useId(), type: useId(), level: useId() };
  return (
    <div className="filters">
      <label htmlFor={ids.scene}>場面</label>
      <select id={ids.scene} value={filter.scenarioId} onChange={(e) => onChange({ ...filter, scenarioId: e.target.value })}>
        <option value="">すべて</option>
        {scenarios.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </select>
      <label htmlFor={ids.tag}>タグ</label>
      <select id={ids.tag} value={filter.tag} onChange={(e) => onChange({ ...filter, tag: e.target.value })}>
        <option value="">すべて</option>
        {tags.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      {showType && (
        <>
          <label htmlFor={ids.type}>形式</label>
          <select id={ids.type} value={filter.type} onChange={(e) => onChange({ ...filter, type: e.target.value as QuestionType | '' })}>
            <option value="">すべて</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {QUESTION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </>
      )}
      <label htmlFor={ids.level}>難易度</label>
      <select id={ids.level} value={filter.level} onChange={(e) => onChange({ ...filter, level: e.target.value as Level | '' })}>
        <option value="">すべて</option>
        {LEVELS.map((l) => (
          <option key={l} value={l}>
            {LEVEL_LABELS[l]}
          </option>
        ))}
      </select>
      {showBookmark && (
        <label className="check filters-wide">
          <input type="checkbox" checked={filter.bookmarkedOnly} onChange={(e) => onChange({ ...filter, bookmarkedOnly: e.target.checked })} />
          ブックマークした問題だけ
        </label>
      )}
    </div>
  );
}
