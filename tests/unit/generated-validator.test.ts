import { describe, expect, it } from 'vitest';
// @ts-expect-error 型定義のない開発用スクリプト
import { generate } from '../../scripts/generate-validator.mjs';
import { readText } from '../helpers/fixtures';

describe('生成済みの検査関数', () => {
  it('schemas/content-pack.schema.json から生成した内容と一致する', () => {
    expect(readText('src/domain/import-validation/generated/content-pack-validator.js')).toBe(generate());
  });

  it('実行時にevalやnew Functionを使わない（CSP対応）', () => {
    const code = readText('src/domain/import-validation/generated/content-pack-validator.js');
    expect(code).not.toMatch(/\beval\(|new Function\(/);
  });
});
