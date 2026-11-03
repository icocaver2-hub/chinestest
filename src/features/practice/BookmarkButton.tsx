import { useCallback, useState } from 'react';
import { useReadyApp } from '../../app/AppContext';
import { useAsyncData } from '../../components/useAsyncData';
import { describeStorageError, toStorageError } from '../../repositories/storage-error';

/** 問題のブックマーク。回答前後のどちらでも操作できる。 */
export function BookmarkButton({ questionId }: { questionId: string }) {
  const { practice, clock } = useReadyApp();
  const [override, setOverride] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => practice.isBookmarked('question', questionId), [practice, questionId]);
  const data = useAsyncData(load);
  const on = override ?? (data.status === 'success' ? data.data : false);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      setOverride(await practice.toggleBookmark('question', questionId, clock().toISOString()));
    } catch (e) {
      setError(describeStorageError(toStorageError(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`button button-small${on ? ' button-on' : ''}`}
        aria-pressed={on}
        disabled={busy || data.status === 'loading'}
        onClick={toggle}
      >
        <span aria-hidden="true">{on ? '★ ' : '☆ '}</span>
        {on ? 'ブックマーク済み' : 'ブックマーク'}
      </button>
      {error && (
        <span role="alert" className="help help-error">
          {error}
        </span>
      )}
    </>
  );
}
