/** 一意なID（submissionId・sessionId）。crypto.randomUUIDが使えない非HTTPS環境でも動くようにする。 */
export function newId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') {
    try {
      return c.randomUUID();
    } catch {
      // 非セキュアコンテキストでは例外になる
    }
  }
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
