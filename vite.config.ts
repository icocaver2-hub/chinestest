/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 配信パス。GitHub Pagesのプロジェクトサイトでは `/<repository-name>/` を指定する。
 * 例: BASE_PATH=/chinestest/ npm run build
 */
function resolveBase(): string {
  const raw = (process.env.BASE_PATH ?? '').trim();
  // 前後のスラッシュを1つにそろえる（'' → '/', '/chinestest' → '/chinestest/'）
  const inner = raw.replace(/^\/+|\/+$/g, '');
  return inner === '' ? '/' : `/${inner}/`;
}

/**
 * 本番ビルドだけにCSPを付与し、同一origin以外への通信をブラウザ側でも遮断する。
 * （開発サーバーはインラインのHMRスクリプトを使うため対象外）
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head' }];
    },
  };
}

export default defineConfig({
  base: resolveBase(),
  plugins: [react(), cspPlugin()],
  build: {
    target: 'es2022',
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
  },
});
