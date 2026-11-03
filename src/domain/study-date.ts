/**
 * 学習日（YYYY-MM-DD）の扱い。UTC日時と学習日を混同しない。
 * 日付の加算はカレンダー日で行い、ミリ秒で24時間を足さない。
 */

const STUDY_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 日時を指定タイムゾーンの学習日へ変換する */
export function toStudyDate(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function isStudyDate(s: string): boolean {
  const m = STUDY_DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** 学習日にカレンダー日を加算する（タイムゾーン・夏時間に影響されない） */
export function addStudyDays(date: string, days: number): string {
  const m = STUDY_DATE_RE.exec(date);
  if (!m || !isStudyDate(date)) throw new RangeError(`学習日の形式が正しくありません: ${date}`);
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  const y = String(dt.getUTCFullYear()).padStart(4, '0');
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}
