/**
 * 会話練習（docs/03「シチュエーション一覧・詳細」）。
 * 相手の発言を見て自分の返答を考え、例を開いてから「言えた／少し迷った／言えなかった」を記録する。
 * 自己評価は問題の正答率に加えない。発音の自動採点は行わない。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useReadyApp } from '../../app/AppContext';
import { newId } from '../../app/ids';
import { hrefFor } from '../../app/router';
import { toStudyDate } from '../../domain/study-date';
import { AudioPlayer } from '../../components/AudioPlayer';
import { SELF_RATING_LABELS } from '../../components/labels';
import { EmptyState, ErrorState, Loading } from '../../components/States';
import { useAsyncData } from '../../components/useAsyncData';
import { describeStorageError, toStorageError } from '../../repositories/storage-error';
import type { ConversationAttemptRecord, ScenarioRecord, SelfRating } from '../../types/db';
import type { Turn } from '../../types/content';
import { DisplayToggles } from './DisplayToggles';

const RATINGS: SelfRating[] = ['said', 'hesitated', 'could_not_say'];

export function TalkPage({ id }: { id: string }) {
  const { repo, practice } = useReadyApp();
  const load = useCallback(async () => {
    const [scenario, ratings] = await Promise.all([repo.getScenario(id), practice.listConversationRatings(id)]);
    return { scenario, ratings };
  }, [repo, practice, id]);
  const data = useAsyncData(load);

  if (data.status === 'loading') return <Loading />;
  if (data.status === 'error') return <ErrorState title="会話練習を読み込めませんでした">再読み込みしてください。</ErrorState>;
  const { scenario, ratings } = data.data;
  if (!scenario) {
    return (
      <EmptyState title="この場面は見つかりません" actions={<a className="button" href={hrefFor({ name: 'scenarios' })}>場面の一覧へ戻る</a>}>
        <p>教材が更新されたか、URLが正しくない可能性があります。</p>
      </EmptyState>
    );
  }
  return <TalkRunner scenario={scenario} previous={ratings} />;
}

function latestByTurn(ratings: readonly ConversationAttemptRecord[], revision: number): Map<string, SelfRating> {
  const m = new Map<string, SelfRating>();
  for (const r of ratings) if (r.revision === revision) m.set(r.turnId, r.rating);
  return m;
}

function TalkRunner({ scenario, previous }: { scenario: ScenarioRecord; previous: ConversationAttemptRecord[] }) {
  const steps = scenario.turns.map((t, i) => ({ turn: t, index: i })).filter((x) => x.turn.role === 'learner');
  const [step, setStep] = useState(0);
  const [round, setRound] = useState(0);
  const [results, setResults] = useState<Map<string, SelfRating>>(new Map());
  const last = latestByTurn(previous, scenario.revision);

  if (steps.length === 0) {
    return <EmptyState title="この場面には自分の発言がありません" />;
  }
  if (step >= steps.length) {
    const counts = RATINGS.map((r) => [r, [...results.values()].filter((v) => v === r).length] as const);
    return (
      <div className="page">
        <h1 className="page-title">会話練習の記録</h1>
        <p className="small muted">{scenario.title}</p>
        <section className="card">
          <dl className="stats">
            {counts.map(([r, n]) => (
              <div key={r}>
                <dt>{SELF_RATING_LABELS[r]}</dt>
                <dd>{n}回</dd>
              </div>
            ))}
          </dl>
          <p className="small muted">自己評価は記録として残し、問題の正答率には含めません。</p>
        </section>
        <div className="row-actions">
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              setResults(new Map());
              setStep(0);
              setRound((r) => r + 1);
            }}
          >
            もう一度練習する
          </button>
          <a className="button" href={hrefFor({ name: 'scenario', id: scenario.id })}>
            場面に戻る
          </a>
        </div>
      </div>
    );
  }

  const cur = steps[step]!;
  return (
    <TalkStep
      key={`${round}-${cur.turn.id}`}
      scenario={scenario}
      turnIndex={cur.index}
      stepNo={step + 1}
      stepCount={steps.length}
      previousRating={last.get(cur.turn.id)}
      onRated={(rating) => {
        setResults((m) => new Map(m).set(cur.turn.id, rating));
        setStep((s) => s + 1);
      }}
    />
  );
}

function TurnView({ turn, packId }: { turn: Turn; packId: string }) {
  const { settings } = useReadyApp();
  return (
    <>
      <p className="speaker">{turn.speaker}</p>
      <p className="zh" lang="zh-CN">
        {turn.zh}
      </p>
      {settings.showPinyin && (
        <p className="pinyin" lang="zh-Latn-pinyin">
          {turn.pinyin}
        </p>
      )}
      {settings.showTranslation && <p className="ja">{turn.ja}</p>}
      {turn.audioId && <AudioPlayer packId={packId} audioId={turn.audioId} label={turn.zh} />}
    </>
  );
}

function TalkStep({
  scenario,
  turnIndex,
  stepNo,
  stepCount,
  previousRating,
  onRated,
}: {
  scenario: ScenarioRecord;
  turnIndex: number;
  stepNo: number;
  stepCount: number;
  previousRating: SelfRating | undefined;
  onRated: (r: SelfRating) => void;
}) {
  const { practice, settings, clock } = useReadyApp();
  const [submissionId] = useState(newId);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState<SelfRating | null>(null);
  const [error, setError] = useState<string | null>(null);
  const turn = scenario.turns[turnIndex]!;
  const context = scenario.turns.slice(0, turnIndex);
  const answerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (revealed) answerRef.current?.focus();
  }, [revealed]);

  async function rate(rating: SelfRating) {
    if (saving) return;
    setSaving(rating);
    setError(null);
    const now = clock();
    try {
      await practice.recordConversationRating({
        submissionId,
        scenarioId: scenario.id,
        revision: scenario.revision,
        turnId: turn.id,
        occurredAt: now.toISOString(),
        studyDate: toStudyDate(now, settings.studyTimeZone),
        timeZone: settings.studyTimeZone,
        rating,
      });
      onRated(rating);
    } catch (e) {
      setError(describeStorageError(toStorageError(e)));
      setSaving(null);
    }
  }

  return (
    <div className="page">
      <p className="small">
        <a href={hrefFor({ name: 'scenario', id: scenario.id })}>← {scenario.title}</a>
      </p>
      <h1 className="session-origin">会話練習</h1>
      <p className="progress-text">
        {stepNo} / {stepCount}
      </p>
      <progress className="progress" max={stepCount} value={stepNo - 1} aria-label={`進み具合 ${stepNo - 1} / ${stepCount}`} />
      <DisplayToggles />

      {context.length > 0 && (
        <section className="card" aria-label="ここまでの会話">
          <ol className="turns">
            {context.map((t) => (
              <li key={t.id} className={`turn turn-${t.role}`}>
                <TurnView turn={t} packId={scenario.ownerPackId} />
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="card talk-card" aria-labelledby="talk-heading">
        <h2 id="talk-heading">あなたの番です</h2>
        {!revealed ? (
          <>
            <p>
              {context.length > 0 ? '相手の言葉に、どう返しますか。' : '会話の始めに、何と言いますか。'}
              声に出して言ってみてから、例を確認しましょう。
            </p>
            <p className="small muted">日本語の意味: {turn.ja}</p>
            <button type="button" className="button button-primary button-block" onClick={() => setRevealed(true)}>
              例を見る
            </button>
          </>
        ) : (
          <>
            <div className={`turn turn-learner revealed`} ref={answerRef} tabIndex={-1}>
              <TurnView turn={turn} packId={scenario.ownerPackId} />
            </div>
            <p id="rate-label">言えましたか？</p>
            <div className="rating-buttons" role="group" aria-labelledby="rate-label">
              {RATINGS.map((r) => (
                <button key={r} type="button" className="button" disabled={saving !== null} onClick={() => rate(r)}>
                  {SELF_RATING_LABELS[r]}
                </button>
              ))}
            </div>
            {previousRating && <p className="small muted">前回の自己評価: {SELF_RATING_LABELS[previousRating]}</p>}
          </>
        )}
        {error && (
          <p role="alert" className="help help-error">
            ⚠ 保存できませんでした。{error} もう一度選んでください。
          </p>
        )}
      </section>
    </div>
  );
}
