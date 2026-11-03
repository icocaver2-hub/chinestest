/** 保存処理の失敗。黙ってメモリ保存に切り替えず、原因を利用者に示すために分類する。 */
export type StorageErrorKind = 'quota' | 'unavailable' | 'blocked' | 'conflict' | 'unknown';

export class StorageError extends Error {
  readonly kind: StorageErrorKind;
  constructor(kind: StorageErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageError';
    this.kind = kind;
  }
}

export function toStorageError(e: unknown): StorageError {
  if (e instanceof StorageError) return e;
  const name = e instanceof Error || (typeof DOMException !== 'undefined' && e instanceof DOMException) ? e.name : '';
  if (name === 'QuotaExceededError') {
    return new StorageError('quota', '保存領域が不足しています。不要なデータを減らすか、バックアップを書き出してください。', {
      cause: e,
    });
  }
  if (name === 'InvalidStateError' || name === 'UnknownError' || name === 'SecurityError') {
    return new StorageError('unavailable', 'ブラウザの保存領域（IndexedDB）を利用できません。', { cause: e });
  }
  const detail = e instanceof Error ? e.message : String(e);
  return new StorageError('unknown', `保存処理に失敗しました（${detail}）`, { cause: e });
}

export function describeStorageError(e: StorageError): string {
  switch (e.kind) {
    case 'quota':
      return '保存領域が不足しているため保存できませんでした。バックアップを書き出し、不要な音声や教材を減らしてから再試行してください。';
    case 'unavailable':
      return 'このブラウザでは保存領域（IndexedDB）を利用できません。プライベートブラウズを解除するか、別のブラウザでお試しください。';
    case 'blocked':
      return 'このアプリを開いている別のタブがあるため、データの準備を完了できません。別のタブを閉じてから再読み込みしてください。';
    case 'conflict':
      return e.message;
    default:
      return e.message;
  }
}
