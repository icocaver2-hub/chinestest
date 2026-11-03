import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '../..');

export function readText(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

/** examples/starter-pack.json の新しいコピー（テストごとに改変してよい） */
export function starterPack(): Record<string, any> {
  return JSON.parse(readText('examples/starter-pack.json'));
}
