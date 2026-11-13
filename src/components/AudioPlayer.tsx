/**
 * 音声の再生。ブラウザ内（IndexedDB）に保存された音声だけを HTMLAudioElement で再生する。
 * 自動再生しない。オンライン読み上げ（Web Speech APIなど）は使わない。
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useReadyApp } from '../app/AppContext';
import { useAsyncData } from './useAsyncData';

const RATES = [0.75, 1, 1.25] as const;

export function AudioPlayer({ packId, audioId, label }: { packId: string; audioId: string; label: string }) {
  const { repo } = useReadyApp();
  const load = useCallback(() => repo.getAudioAsset(packId, audioId), [repo, packId, audioId]);
  const data = useAsyncData(load);

  if (data.status === 'loading') return <span className="small muted">音声を読み込み中…</span>;
  if (data.status === 'error' || !data.data) {
    return (
      <span className="audio-missing small" role="note">
        音声ファイルが見つかりません（未収録）
      </span>
    );
  }
  return <BlobPlayer blob={data.data.blob} label={label} />;
}

function BlobPlayer({ blob, label }: { blob: Blob; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLAudioElement>(null);
  const rateId = useId();

  useEffect(() => {
    const u = URL.createObjectURL(blob);
    // 生成したURLを状態として保持し、アンマウント時に解放する
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = rate;
  }, [rate, url]);

  async function toggle() {
    const a = ref.current;
    if (!a) return;
    setError(null);
    if (a.paused) {
      try {
        await a.play();
      } catch {
        setError('この音声は再生できませんでした。');
      }
    } else {
      a.pause();
    }
  }

  function stop() {
    const a = ref.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
  }

  return (
    <div className="audio-player" role="group" aria-label={`${label}の音声`}>
      {url && (
        <audio
          ref={ref}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => setError('この形式の音声はこのブラウザで再生できません。')}
        />
      )}
      <button type="button" className="button button-small" onClick={toggle} disabled={!url} aria-pressed={playing}>
        <span aria-hidden="true">{playing ? '❚❚ ' : '▶ '}</span>
        {playing ? '一時停止' : '再生'}
      </button>
      <button type="button" className="button button-small" onClick={stop} disabled={!url}>
        停止
      </button>
      <label htmlFor={rateId} className="visually-hidden">
        再生速度
      </label>
      <select id={rateId} value={rate} onChange={(e) => setRate(Number(e.target.value))} className="rate-select">
        {RATES.map((r) => (
          <option key={r} value={r}>
            {r}倍
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="help help-error">
          {error}
        </span>
      )}
    </div>
  );
}
