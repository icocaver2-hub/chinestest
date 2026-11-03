import { useId, useMemo, useState, type FormEvent } from 'react';
import { useReadyApp } from '../../app/AppContext';
import { describeStorageError, toStorageError } from '../../repositories/storage-error';
import {
  isValidDailyQuestionCount,
  isValidTimeZone,
  listTimeZones,
  MAX_DAILY_QUESTIONS,
  MIN_DAILY_QUESTIONS,
} from '../../domain/settings';

type SaveStatus = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string };
type PersistStatus = 'unknown' | 'unsupported' | 'granted' | 'denied' | 'requesting';

export function SettingsPage() {
  const { settings, updateSettings } = useReadyApp();
  const [count, setCount] = useState(String(settings.dailyQuestionCount));
  const [showPinyin, setShowPinyin] = useState(settings.showPinyin);
  const [showTranslation, setShowTranslation] = useState(settings.showTranslation);
  const [timeZone, setTimeZone] = useState(settings.studyTimeZone);
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });
  const [persist, setPersist] = useState<PersistStatus>(() =>
    typeof navigator !== 'undefined' && typeof navigator.storage?.persist === 'function' ? 'unknown' : 'unsupported',
  );
  const zones = useMemo(() => listTimeZones(), []);
  const ids = { count: useId(), countHelp: useId(), tz: useId(), tzHelp: useId() };

  const countNum = Number(count);
  const countValid = count.trim() !== '' && isValidDailyQuestionCount(countNum);
  const tzValid = isValidTimeZone(timeZone);
  const tzChanged = timeZone !== settings.studyTimeZone;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!countValid || !tzValid || status.kind === 'saving') return;
    setStatus({ kind: 'saving' });
    try {
      await updateSettings({ dailyQuestionCount: countNum, showPinyin, showTranslation, studyTimeZone: timeZone });
      setStatus({ kind: 'saved' });
    } catch (err) {
      setStatus({ kind: 'error', message: describeStorageError(toStorageError(err)) });
    }
  }

  async function requestPersist() {
    if (typeof navigator.storage?.persist !== 'function') return;
    setPersist('requesting');
    try {
      setPersist((await navigator.storage.persist()) ? 'granted' : 'denied');
    } catch {
      setPersist('denied');
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">設定</h1>
      <form className="card form" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor={ids.count}>1日の問題数</label>
          <input
            id={ids.count}
            type="number"
            inputMode="numeric"
            min={MIN_DAILY_QUESTIONS}
            max={MAX_DAILY_QUESTIONS}
            step={1}
            value={count}
            onChange={(e) => {
              setCount(e.target.value);
              setStatus({ kind: 'idle' });
            }}
            aria-invalid={!countValid}
            aria-describedby={ids.countHelp}
          />
          <p id={ids.countHelp} className={countValid ? 'help' : 'help help-error'}>
            {countValid ? '' : '⚠ '}
            {MIN_DAILY_QUESTIONS}〜{MAX_DAILY_QUESTIONS}の整数で指定します（既定10問）。
          </p>
        </div>

        <fieldset className="field">
          <legend>表示</legend>
          <label className="check">
            <input
              type="checkbox"
              checked={showPinyin}
              onChange={(e) => {
                setShowPinyin(e.target.checked);
                setStatus({ kind: 'idle' });
              }}
            />
            ピンインを表示する
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={showTranslation}
              onChange={(e) => {
                setShowTranslation(e.target.checked);
                setStatus({ kind: 'idle' });
              }}
            />
            日本語訳を表示する
          </label>
        </fieldset>

        <div className="field">
          <label htmlFor={ids.tz}>学習タイムゾーン</label>
          <select
            id={ids.tz}
            value={timeZone}
            onChange={(e) => {
              setTimeZone(e.target.value);
              setStatus({ kind: 'idle' });
            }}
            aria-describedby={ids.tzHelp}
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          <p id={ids.tzHelp} className="help">
            学習日と復習日の区切りに使います（既定 Asia/Tokyo）。変更しても、過去の学習日と決まっている復習予定日は再計算しません。
          </p>
          {tzChanged && (
            <p className="help help-warn" role="note">
              ⚠ タイムゾーンを変更すると、これからの回答だけが新しい学習日で記録されます。
            </p>
          )}
        </div>

        <div className="form-actions">
          <button type="submit" className="button button-primary" disabled={!countValid || !tzValid || status.kind === 'saving'}>
            {status.kind === 'saving' ? '保存中…' : '保存する'}
          </button>
          <p role="status" aria-live="polite" className="small">
            {status.kind === 'saved' && '✓ 保存しました'}
          </p>
          {status.kind === 'error' && (
            <p role="alert" className="help help-error">
              ⚠ 保存できませんでした。{status.message}
            </p>
          )}
        </div>
      </form>

      <section className="card">
        <h2>保存領域</h2>
        <p>
          学習記録はこのブラウザの中だけに保存され、サーバーへは送信しません。ブラウザが容量不足のときに自動で消さないよう、永続保存を要求できます。
        </p>
        {persist === 'unsupported' ? (
          <p className="muted">このブラウザは永続保存の要求に対応していません。</p>
        ) : (
          <>
            <button type="button" className="button" onClick={requestPersist} disabled={persist === 'requesting'}>
              永続保存を要求する
            </button>
            <p role="status" aria-live="polite" className="small">
              {persist === 'granted' && '✓ 永続保存が許可されました'}
              {persist === 'denied' && 'ブラウザが永続保存を許可しませんでした。定期的にバックアップを書き出してください。'}
            </p>
          </>
        )}
      </section>

      <section className="card">
        <h2>バックアップと復元</h2>
        <p>学習記録・教材・設定・音声の書き出しと復元は準備中です（実装計画のフェーズ4で追加予定）。</p>
      </section>
    </div>
  );
}
