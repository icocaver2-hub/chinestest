import type { Level, QuestionType, ScenarioCategory } from '../types/content';

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
