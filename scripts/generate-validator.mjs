// schemas/content-pack.schema.json から、実行時にevalを使わない検査関数を生成する。
// 本番ビルドのCSP（script-src 'self'）ではAjvの実行時コンパイルが使えないため。
// 使い方: node scripts/generate-validator.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import standaloneCode from 'ajv/dist/standalone/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = resolve(root, 'schemas/content-pack.schema.json');
const outPath = resolve(root, 'src/domain/import-validation/generated/content-pack-validator.js');

export function generate() {
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, unicodeRegExp: true, code: { source: true, esm: true } });
  const validate = ajv.compile(schema);
  let code = standaloneCode(ajv, validate);
  // Ajvのesm出力にはrequire()が残るため、ESMのimportへ置き換える。
  const imports = [];
  code = code.replace(/require\("(ajv\/dist\/runtime\/[a-z0-9]+)"\)\.default/g, (_m, mod) => {
    const name = `runtime_${mod.split('/').pop()}`;
    if (!imports.some((i) => i.name === name)) imports.push({ name, mod });
    return `__interop(${name})`;
  });
  if (/require\(/.test(code)) throw new Error('置き換えられないrequire()が残っています');
  code = code.replace(/^"use strict";/, '');
  // CJSモジュールのdefault取り込みは実行環境で形が異なるため吸収する。
  const header = [
    ...imports.map((i) => `import ${i.name} from "${i.mod}.js";`),
    'const __interop = (m) => (typeof m === "function" ? m : m.default);',
  ].join('\n');
  return `/* eslint-disable */\n// @ts-nocheck\n// 自動生成ファイル。直接編集せず npm run generate:validator を実行する。\n${header}\n${code}\n`;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const code = generate();
  if (process.argv.includes('--check')) {
    const current = readFileSync(outPath, 'utf8');
    if (current !== code) {
      console.error('生成済みの検査関数がスキーマと一致しません。npm run generate:validator を実行してください。');
      process.exit(1);
    }
    console.log('検査関数はスキーマと一致しています。');
  } else {
    writeFileSync(outPath, code);
    console.log(`生成しました: ${outPath}`);
  }
}
