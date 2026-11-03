/**
 * 教材JSONの検査（docs/05「検査順序」の1〜3と、パック内で完結する参照検査）。
 * 既存データとの比較（4）と適用後全体の参照・音声ファイル検査（5）は取り込み処理側で行う。
 * 検査は本文を書き換えない。問題箇所をパス付きで返す。
 */
import { BLANK_MARKER, type ContentPack, type Question, type Scenario } from '../../types/content';
import { err, ok, type Result } from '../../types/result';
import validateSchema from './generated/content-pack-validator';
import type { ValidationIssue } from './issues';
import { convertSchemaErrors } from './schema-errors';

export const MAX_PACK_BYTES = 5 * 1024 * 1024;

export interface PackValidationContext {
  /** 同時取り込み以外で参照してよい既存シーンID（登録済み・同梱） */
  knownScenarioIds?: ReadonlySet<string>;
  /** このパックの保存済み・同梱の音声ID（宣言を省略して参照できる） */
  knownAudioIds?: ReadonlySet<string>;
}

export type PackValidationResult = Result<ContentPack, ValidationIssue[]>;

/** 1. ファイルサイズとUTF-8 JSONとしての解析 */
export function parsePackText(text: string, byteLength?: number): Result<unknown, ValidationIssue[]> {
  const size = byteLength ?? new TextEncoder().encode(text).byteLength;
  if (size > MAX_PACK_BYTES) {
    return err([{ path: '(ファイル)', message: `ファイルが大きすぎます（上限5MiB、実際${(size / 1024 / 1024).toFixed(1)}MiB）` }]);
  }
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const trimmed = body.trimStart();
  if (trimmed.startsWith('```')) {
    return err([
      {
        path: '(ファイル)',
        message: 'Markdownのコードフェンス（```）が含まれています。JSONオブジェクトだけを保存したファイルを選んでください',
      },
    ]);
  }
  try {
    return ok(JSON.parse(body) as unknown);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return err([{ path: '(ファイル)', message: `JSONとして読み込めません（${detail}）` }]);
  }
}

function dupCheck<T>(
  items: readonly T[],
  key: (item: T) => string,
  pathOf: (index: number) => string,
  label: string,
  issues: ValidationIssue[],
): void {
  const first = new Map<string, number>();
  items.forEach((item, i) => {
    const k = key(item);
    const prev = first.get(k);
    if (prev !== undefined) {
      issues.push({ path: pathOf(i), message: `${label}「${k}」が重複しています（${pathOf(prev)}と同じ）` });
    } else {
      first.set(k, i);
    }
  });
}

function checkScenario(s: Scenario, si: number, issues: ValidationIssue[]): void {
  const base = `scenarios[${si}]`;
  dupCheck(s.turns, (t) => t.id, (i) => `${base}.turns[${i}].id`, '発言ID', issues);
  if (!s.turns.some((t) => t.role === 'learner')) {
    issues.push({ path: `${base}.turns`, message: 'role=learner（自分）の発言が1件以上必要です' });
  }
  if (!s.turns.some((t) => t.role === 'partner')) {
    issues.push({ path: `${base}.turns`, message: 'role=partner（相手）の発言が1件以上必要です' });
  }
}

function countOccurrences(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function checkQuestion(q: Question, qi: number, issues: ValidationIssue[]): void {
  const base = `questions[${qi}]`;
  switch (q.type) {
    case 'single_choice': {
      dupCheck(q.choices, (c) => c.id, (i) => `${base}.choices[${i}].id`, '選択肢ID', issues);
      if (!q.choices.some((c) => c.id === q.answerId)) {
        issues.push({ path: `${base}.answerId`, message: `正解ID「${q.answerId}」に対応する選択肢がありません` });
      }
      break;
    }
    case 'ordering': {
      dupCheck(q.tokens, (t) => t.id, (i) => `${base}.tokens[${i}].id`, 'トークンID', issues);
      const tokenIds = new Set(q.tokens.map((t) => t.id));
      q.acceptedOrders.forEach((order, oi) => {
        const path = `${base}.acceptedOrders[${oi}]`;
        const unknown = order.filter((id) => !tokenIds.has(id));
        if (unknown.length > 0) {
          issues.push({ path, message: `存在しないトークンIDがあります: ${[...new Set(unknown)].join(', ')}` });
          return;
        }
        const used = new Set(order);
        if (order.length !== q.tokens.length || used.size !== tokenIds.size) {
          issues.push({ path, message: '正解順序は全トークンIDを各1回ずつ使う必要があります' });
        }
      });
      break;
    }
    case 'fill_blank': {
      const n = countOccurrences(q.sentence, BLANK_MARKER);
      if (n !== 1) {
        issues.push({ path: `${base}.sentence`, message: `空欄${BLANK_MARKER}はちょうど1か所必要です（現在${n}か所）` });
      }
      break;
    }
  }
  if (q.presentation === 'listening' && q.transcript !== undefined && q.prompt.includes(q.transcript)) {
    issues.push({ path: `${base}.prompt`, message: 'リスニング問題の設問に音声の全文を載せないでください' });
  }
}

/** 2〜3と、パック内で完結する参照の検査 */
export function validatePackObject(data: unknown, ctx: PackValidationContext = {}): PackValidationResult {
  if (!validateSchema(data)) {
    return err(convertSchemaErrors(validateSchema.errors ?? [], data));
  }
  const pack = data as ContentPack;
  const issues: ValidationIssue[] = [];

  if (pack.scenarios.length === 0 && pack.questions.length === 0) {
    issues.push({ path: '(ルート)', message: 'scenariosとquestionsの両方が空のパックは取り込めません' });
  }

  dupCheck(pack.scenarios, (s) => s.id, (i) => `scenarios[${i}].id`, 'シーンID', issues);
  dupCheck(pack.questions, (q) => q.id, (i) => `questions[${i}].id`, '問題ID', issues);
  pack.scenarios.forEach((s, i) => checkScenario(s, i, issues));
  pack.questions.forEach((q, i) => checkQuestion(q, i, issues));

  // シーン参照
  const scenarioIds = new Set(pack.scenarios.map((s) => s.id));
  pack.questions.forEach((q, i) => {
    if (!scenarioIds.has(q.scenarioId) && !ctx.knownScenarioIds?.has(q.scenarioId)) {
      issues.push({
        path: `questions[${i}].scenarioId`,
        message: `シーン「${q.scenarioId}」がこのファイルにも登録済みの教材にもありません`,
      });
    }
  });

  // 音声の宣言と参照
  const assets = pack.audioAssets ?? [];
  dupCheck(assets, (a) => a.id, (i) => `audioAssets[${i}].id`, '音声ID', issues);
  dupCheck(assets, (a) => a.fileName, (i) => `audioAssets[${i}].fileName`, 'ファイル名', issues);
  const audioIds = new Set(assets.map((a) => a.id));
  const checkAudioRef = (audioId: string | undefined, path: string) => {
    if (audioId !== undefined && !audioIds.has(audioId) && !ctx.knownAudioIds?.has(audioId)) {
      issues.push({ path, message: `音声「${audioId}」が宣言されておらず、保存済み・同梱の音声にもありません` });
    }
  };
  pack.scenarios.forEach((s, si) =>
    s.turns.forEach((t, ti) => checkAudioRef(t.audioId, `scenarios[${si}].turns[${ti}].audioId`)),
  );
  pack.questions.forEach((q, qi) => checkAudioRef(q.audioId, `questions[${qi}].audioId`));

  return issues.length > 0 ? err(issues) : ok(pack);
}

/** 1〜3をまとめて行う */
export function validatePackText(text: string, ctx: PackValidationContext = {}, byteLength?: number): PackValidationResult {
  const parsed = parsePackText(text, byteLength);
  if (!parsed.ok) return parsed;
  return validatePackObject(parsed.value, ctx);
}
