import type { Settings } from '../types/db';

export const DEFAULT_STUDY_TIME_ZONE = 'Asia/Tokyo';
export const MIN_DAILY_QUESTIONS = 5;
export const MAX_DAILY_QUESTIONS = 30;

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  dailyQuestionCount: 10,
  showPinyin: true,
  showTranslation: true,
  studyTimeZone: DEFAULT_STUDY_TIME_ZONE,
});

export function isValidTimeZone(tz: string): boolean {
  if (tz.trim() === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isValidDailyQuestionCount(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= MIN_DAILY_QUESTIONS && n <= MAX_DAILY_QUESTIONS;
}

/** 保存値を検査し、不正・欠落の項目は既定値で補う（保存済みの値は書き換えない）。 */
export function normalizeSettings(raw: Partial<Record<keyof Settings, unknown>>): Settings {
  return {
    dailyQuestionCount: isValidDailyQuestionCount(raw.dailyQuestionCount)
      ? raw.dailyQuestionCount
      : DEFAULT_SETTINGS.dailyQuestionCount,
    showPinyin: typeof raw.showPinyin === 'boolean' ? raw.showPinyin : DEFAULT_SETTINGS.showPinyin,
    showTranslation: typeof raw.showTranslation === 'boolean' ? raw.showTranslation : DEFAULT_SETTINGS.showTranslation,
    studyTimeZone:
      typeof raw.studyTimeZone === 'string' && isValidTimeZone(raw.studyTimeZone)
        ? raw.studyTimeZone
        : DEFAULT_SETTINGS.studyTimeZone,
  };
}

/** 部分更新のうち不正な値のキーを返す */
export function invalidSettingKeys(patch: Partial<Record<keyof Settings, unknown>>): (keyof Settings)[] {
  const bad: (keyof Settings)[] = [];
  if ('dailyQuestionCount' in patch && !isValidDailyQuestionCount(patch.dailyQuestionCount)) bad.push('dailyQuestionCount');
  if ('showPinyin' in patch && typeof patch.showPinyin !== 'boolean') bad.push('showPinyin');
  if ('showTranslation' in patch && typeof patch.showTranslation !== 'boolean') bad.push('showTranslation');
  if ('studyTimeZone' in patch && !(typeof patch.studyTimeZone === 'string' && isValidTimeZone(patch.studyTimeZone)))
    bad.push('studyTimeZone');
  return bad;
}

/** 設定画面の候補。Intl.supportedValuesOfがない環境では主要なものだけを返す。 */
export function listTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  const list = intl.supportedValuesOf?.('timeZone') ?? [DEFAULT_STUDY_TIME_ZONE, 'Asia/Shanghai', 'UTC'];
  return list.includes(DEFAULT_STUDY_TIME_ZONE) ? list : [DEFAULT_STUDY_TIME_ZONE, ...list];
}
