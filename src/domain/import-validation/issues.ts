/** 検査で見つかった問題。pathは `questions[2].answerId` の形式。 */
export interface ValidationIssue {
  path: string;
  message: string;
}

/** JSON Pointer（/questions/2/answerId）を表示用パス（questions[2].answerId）へ変換する。 */
export function pointerToPath(pointer: string): string {
  if (pointer === '' || pointer === '/') return '(ルート)';
  const parts = pointer
    .split('/')
    .slice(1)
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let out = '';
  for (const part of parts) {
    if (/^\d+$/.test(part)) out += `[${part}]`;
    else out += out === '' ? part : `.${part}`;
  }
  return out;
}

export function formatIssue(issue: ValidationIssue): string {
  return `${issue.path}: ${issue.message}`;
}
