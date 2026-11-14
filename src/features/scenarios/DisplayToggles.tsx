import { useState } from 'react';
import { useReadyApp } from '../../app/AppContext';
import { describeStorageError, toStorageError } from '../../repositories/storage-error';

/** ピンイン・訳の表示切り替え。設定として保存し、再起動後も保持する。 */
export function DisplayToggles() {
  const { settings, updateSettings } = useReadyApp();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function set(patch: { showPinyin?: boolean; showTranslation?: boolean }) {
    setBusy(true);
    setError(null);
    try {
      await updateSettings(patch);
    } catch (e) {
      setError(describeStorageError(toStorageError(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="display-toggles" role="group" aria-label="表示の切り替え">
      <button
        type="button"
        className={`button button-small${settings.showPinyin ? ' button-on' : ''}`}
        aria-pressed={settings.showPinyin}
        disabled={busy}
        onClick={() => set({ showPinyin: !settings.showPinyin })}
      >
        ピンイン
      </button>
      <button
        type="button"
        className={`button button-small${settings.showTranslation ? ' button-on' : ''}`}
        aria-pressed={settings.showTranslation}
        disabled={busy}
        onClick={() => set({ showTranslation: !settings.showTranslation })}
      >
        日本語訳
      </button>
      {error && (
        <span role="alert" className="help help-error">
          ⚠ {error}
        </span>
      )}
    </div>
  );
}
