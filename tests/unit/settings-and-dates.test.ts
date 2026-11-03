import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, isValidTimeZone, normalizeSettings } from '../../src/domain/settings';
import { addStudyDays, isStudyDate, toStudyDate } from '../../src/domain/study-date';

describe('設定', () => {
  it('既定値: 10問、ピンイン・訳を表示、Asia/Tokyo', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      dailyQuestionCount: 10,
      showPinyin: true,
      showTranslation: true,
      studyTimeZone: 'Asia/Tokyo',
    });
  });

  it('範囲外・型違いの値は既定値で補う', () => {
    expect(normalizeSettings({ dailyQuestionCount: 4 }).dailyQuestionCount).toBe(10);
    expect(normalizeSettings({ dailyQuestionCount: 31 }).dailyQuestionCount).toBe(10);
    expect(normalizeSettings({ dailyQuestionCount: 7.5 }).dailyQuestionCount).toBe(10);
    expect(normalizeSettings({ dailyQuestionCount: 30 }).dailyQuestionCount).toBe(30);
    expect(normalizeSettings({ showPinyin: 'no' }).showPinyin).toBe(true);
    expect(normalizeSettings({ studyTimeZone: 'Mars/Base' }).studyTimeZone).toBe('Asia/Tokyo');
    expect(normalizeSettings({ studyTimeZone: 'America/New_York' }).studyTimeZone).toBe('America/New_York');
  });

  it('タイムゾーンの検査', () => {
    expect(isValidTimeZone('Asia/Tokyo')).toBe(true);
    expect(isValidTimeZone('Asia/Shanghai')).toBe(true);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
  });
});

describe('学習日', () => {
  it('UTC日時を学習タイムゾーンの日付にする', () => {
    // 2026-10-22T15:30Z は日本時間 10/23 00:30
    expect(toStudyDate(new Date('2026-10-22T15:30:00Z'), 'Asia/Tokyo')).toBe('2026-10-23');
    expect(toStudyDate(new Date('2026-10-22T15:30:00Z'), 'UTC')).toBe('2026-10-22');
  });

  it('カレンダー日で加算する（月末・年末・うるう日）', () => {
    expect(addStudyDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addStudyDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addStudyDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addStudyDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addStudyDays('2026-11-03', 14)).toBe('2026-11-17');
  });

  it('不正な学習日を拒否する', () => {
    expect(isStudyDate('2026-02-30')).toBe(false);
    expect(isStudyDate('2026-1-01')).toBe(false);
    expect(() => addStudyDays('2026-02-30', 1)).toThrow(RangeError);
  });
});
