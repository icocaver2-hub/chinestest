import type { StandaloneError } from './generated/content-pack-validator';
import { pointerToPath, type ValidationIssue } from './issues';

function valueAt(root: unknown, pointer: string): unknown {
  if (pointer === '') return root;
  let cur: unknown = root;
  for (const raw of pointer.split('/').slice(1)) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function joinPointer(base: string, key: string): string {
  return `${base}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
}

const TYPE_NAMES: Record<string, string> = {
  string: '文字列',
  integer: '整数',
  number: '数値',
  object: 'オブジェクト',
  array: '配列',
  boolean: '真偽値',
};

function messageFor(e: StandaloneError, value: unknown): string | null {
  const p = e.params;
  switch (e.keyword) {
    case 'required':
      return `必須項目「${String(p.missingProperty)}」がありません`;
    case 'additionalProperties':
      return `契約にないフィールド「${String(p.additionalProperty)}」は使用できません`;
    case 'type':
      if (value === null) return 'nullは使用できません。未指定の任意項目はキーごと省略してください';
      return `${TYPE_NAMES[String(p.type)] ?? String(p.type)}である必要があります`;
    case 'const':
      if (e.schemaPath.endsWith('/schemaVersion/const') || e.instancePath === '/schemaVersion')
        return `対応していない教材形式の版です（対応: ${String(p.allowedValue)}）`;
      return `値は${JSON.stringify(p.allowedValue)}である必要があります`;
    case 'enum':
      return `使用できない値です（使用できる値: ${(p.allowedValues as unknown[]).map(String).join(' / ')}）`;
    case 'pattern':
      if (p.pattern === '\\S') return '空白だけの文字列は使用できません';
      if (String(p.pattern).startsWith('^[a-z0-9]'))
        return 'IDは英小文字・数字・ハイフン・アンダースコアで、先頭は英小文字か数字、1〜80文字にしてください';
      return 'ファイル名にパス区切りや使用できない文字を含められません';
    case 'not':
      return 'ファイル名として使用できません';
    case 'minLength':
      return `${String(p.limit)}文字以上にしてください`;
    case 'maxLength':
      return `${String(p.limit)}文字以下にしてください`;
    case 'minItems':
      return `${String(p.limit)}件以上必要です`;
    case 'maxItems':
      return `${String(p.limit)}件以下にしてください`;
    case 'minimum':
      return `${String(p.limit)}以上の値にしてください`;
    case 'uniqueItems':
      return '同じ値が重複しています';
    case 'if':
      return null; // 下位のエラーで内容を示す
    default:
      return e.message ?? '形式が正しくありません';
  }
}

/** Ajvのエラーを日本語の検査結果に変換する。問題の種類が不正なら、その問題の他のエラーは省く。 */
export function convertSchemaErrors(errors: readonly StandaloneError[], data: unknown): ValidationIssue[] {
  const badTypeQuestions = new Set<string>();
  for (const e of errors) {
    if (e.keyword === 'enum' && /^\/questions\/\d+\/type$/.test(e.instancePath)) {
      badTypeQuestions.add(e.instancePath.replace(/\/type$/, ''));
    }
  }
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  for (const e of errors) {
    const owner = [...badTypeQuestions].find((q) => e.instancePath === q || e.instancePath.startsWith(`${q}/`));
    if (owner && !(e.keyword === 'enum' && e.instancePath === `${owner}/type`)) continue;

    let pointer = e.instancePath;
    if (e.keyword === 'required') pointer = joinPointer(pointer, String(e.params.missingProperty));
    if (e.keyword === 'additionalProperties') pointer = joinPointer(pointer, String(e.params.additionalProperty));
    const message = messageFor(e, valueAt(data, e.instancePath));
    if (message === null) continue;
    const issue = { path: pointerToPath(pointer), message };
    const key = `${issue.path}\u0000${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push(issue);
  }
  return issues;
}
