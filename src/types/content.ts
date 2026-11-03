/** 教材JSON契約 v1（docs/05_CONTENT_FORMAT.md）の型。schemas/content-pack.schema.json と対応させる。 */

export const CONTENT_SCHEMA_VERSION = 1 as const;

export type Level = 'beginner' | 'elementary' | 'intermediate';
export const LEVELS: readonly Level[] = ['beginner', 'elementary', 'intermediate'];

export type ScenarioCategory =
  | 'first_meeting'
  | 'visit'
  | 'meal'
  | 'daily'
  | 'care'
  | 'relationship'
  | 'marriage'
  | 'future'
  | 'repair';

export type TurnRole = 'learner' | 'partner';

export interface Turn {
  id: string;
  speaker: string;
  role: TurnRole;
  zh: string;
  pinyin: string;
  ja: string;
  audioId?: string;
}

export interface Phrase {
  zh: string;
  pinyin: string;
  ja: string;
  note: string;
}

export interface Substitution {
  zh: string;
  pinyin: string;
  ja: string;
}

export interface Scenario {
  id: string;
  revision: number;
  category: ScenarioCategory;
  title: string;
  level: Level;
  situation: string;
  goal: string;
  turns: Turn[];
  phrases: Phrase[];
  substitutions: Substitution[];
  notes: string[];
}

export type QuestionType = 'single_choice' | 'ordering' | 'fill_blank';
export type Presentation = 'text' | 'listening';

interface QuestionBase {
  id: string;
  revision: number;
  scenarioId: string;
  level: Level;
  tags: string[];
  prompt: string;
  explanation: string;
  pinyin: string;
  translation: string;
  audioId?: string;
  presentation?: Presentation;
  transcript?: string;
}

export interface Choice {
  id: string;
  text: string;
}

export interface Token {
  id: string;
  text: string;
}

export interface SingleChoiceQuestion extends QuestionBase {
  type: 'single_choice';
  choices: Choice[];
  answerId: string;
}

export interface OrderingQuestion extends QuestionBase {
  type: 'ordering';
  tokens: Token[];
  acceptedOrders: string[][];
}

export interface FillBlankQuestion extends QuestionBase {
  type: 'fill_blank';
  sentence: string;
  acceptedAnswers: string[];
}

export type Question = SingleChoiceQuestion | OrderingQuestion | FillBlankQuestion;

export type AudioMimeType = 'audio/mpeg' | 'audio/wav' | 'audio/ogg' | 'audio/mp4';

export interface AudioAssetDeclaration {
  id: string;
  fileName: string;
  mimeType: AudioMimeType;
  source: string;
  license: string;
}

export interface ContentPack {
  schemaVersion: typeof CONTENT_SCHEMA_VERSION;
  packId: string;
  title: string;
  scenarios: Scenario[];
  questions: Question[];
  audioAssets?: AudioAssetDeclaration[];
}

/** 空欄の記号（fill_blank.sentence内にちょうど1つ） */
export const BLANK_MARKER = '{{blank}}';
