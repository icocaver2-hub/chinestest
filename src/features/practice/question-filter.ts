import type { Level, QuestionType } from '../../types/content';
import type { QuestionRecord } from '../../types/db';

export interface QuestionFilter {
  scenarioId: string;
  tag: string;
  type: QuestionType | '';
  level: Level | '';
  bookmarkedOnly: boolean;
}

export const EMPTY_FILTER: QuestionFilter = { scenarioId: '', tag: '', type: '', level: '', bookmarkedOnly: false };

export function matchesFilter(q: QuestionRecord, f: QuestionFilter, bookmarked: ReadonlySet<string>): boolean {
  return (
    (f.scenarioId === '' || q.scenarioId === f.scenarioId) &&
    (f.tag === '' || q.tags.includes(f.tag)) &&
    (f.type === '' || q.type === f.type) &&
    (f.level === '' || q.level === f.level) &&
    (!f.bookmarkedOnly || bookmarked.has(q.id))
  );
}
