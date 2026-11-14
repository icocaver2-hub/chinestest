import type { Level, QuestionType, ScenarioCategory } from '../types/content';
import type { SelfRating, SessionOrigin } from '../types/db';

export const LEVEL_LABELS: Record<Level, string> = {
  beginner: '入門',
  elementary: '初級',
  intermediate: '中級',
};

export const CATEGORY_LABELS: Record<ScenarioCategory, string> = {
  first_meeting: '初対面',
  visit: '訪問',
  meal: '食事',
  daily: '日常会話',
  care: '気遣い',
  relationship: '関係づくり',
  marriage: '結婚の挨拶',
  future: '今後の暮らし',
  repair: '聞き返し',
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single_choice: '選択式',
  ordering: '並べ替え',
  fill_blank: '穴埋め',
};

export const ORIGIN_LABELS: Record<SessionOrigin, string> = {
  today: '今日の学習',
  practice: '問題演習',
  review: '復習',
};

export function formatPercent(ratio: number | null): string {
  return ratio === null ? '—' : `${Math.round(ratio * 100)}%`;
}

export const SELF_RATING_LABELS: Record<SelfRating, string> = {
  said: '言えた',
  hesitated: '少し迷った',
  could_not_say: '言えなかった',
};

/** かなを含む文字列は日本語、それ以外は中国語として lang を付ける */
export function langOf(text: string): 'ja' | 'zh-CN' {
  return /[\u3040-\u30ff]/u.test(text) ? 'ja' : 'zh-CN';
}
