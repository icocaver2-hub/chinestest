import { useCallback, useState } from 'react';
import { useReadyApp } from '../../app/AppContext';
import { hrefFor } from '../../app/router';
import { toStudyDate } from '../../domain/study-date';
import { startTodaySession } from '../../app/start-session';
import { selectTodayQuestions } from '../../domain/review';
import { describeStorageError, toStorageError } from '../../repositories/storage-error';
import { ORIGIN_LABELS } from '../../components/labels';
import { currentItem } from '../../domain/session';
import type { SessionRecord } from '../../types/db';
import { EmptyState, ErrorState, Loading } from '../../components/States';
import { useAsyncData } from '../../components/useAsyncData';

interface HomeStats {
  today: string;
  answeredToday: number;
  conversationRatingsToday: number;
  reviewDue: number;
  weakUnmastered: number;
  questionCount: number;
  activeSession: SessionRecord | undefined;
  todayCount: number;
  unlearned: number;
}

export function HomePage() {
  const { repo, practice, settings, clock, dataVersion } = useReadyApp();
  const tz = settings.studyTimeZone;

  const load = useCallback(async (): Promise<HomeStats> => {
    void dataVersion;
    const today = toStudyDate(clock(), tz);
    const db = repo.db;
    const [answeredToday, conversationRatingsToday, items, activeSession] = await Promise.all([
      db.countFromIndex('attempts', 'studyDate', today),
      db.countFromIndex('conversationAttempts', 'studyDate', today),
      practice.listStudyItems(),
      practice.getActiveSession(),
    ]);
    // 学習状態は現在revisionのものだけを数える
    const states = items.map((x) => x.state).filter((x) => x !== undefined);
    const sel = selectTodayQuestions(items, today, settings.dailyQuestionCount);
    return {
      today,
      answeredToday,
      conversationRatingsToday,
      reviewDue: sel.dueCount,
      weakUnmastered: states.filter((s) => s.incorrectCount >= 3 && !s.mastered).length,
      questionCount: items.length,
      activeSession,
      todayCount: sel.items.length,
      unlearned: sel.unlearnedCount,
    };
  }, [repo, practice, clock, tz, settings.dailyQuestionCount, dataVersion]);

  const stats = useAsyncData(load);

  if (stats.status === 'loading') return <Loading />;
  if (stats.status === 'error') {
    return <ErrorState title="記録を読み込めませんでした">再読み込みしてください。</ErrorState>;
  }
  const s = stats.data;

  return (
    <div className="page">
      <h1 className="page-title">ホーム</h1>
      <p className="muted">学習日: {s.today}（{tz}）</p>

      <TodayCard stats={s} />

      <section className="card" aria-labelledby="record-heading">
        <h2 id="record-heading">記録</h2>
        <dl className="stats">
          <div>
            <dt>今日の回答数（自動採点）</dt>
            <dd>{s.answeredToday}問</dd>
          </div>
          <div>
            <dt>今日の会話の自己評価</dt>
            <dd>{s.conversationRatingsToday}件</dd>
          </div>
          <div>
            <dt>復習予定</dt>
            <dd>{s.reviewDue}問</dd>
          </div>
          <div>
            <dt>未克服の苦手問題</dt>
            <dd>{s.weakUnmastered}問</dd>
          </div>
        </dl>
        <p className="small">
          <a href={hrefFor({ name: 'history' })}>学習記録を見る</a>
        </p>
      </section>

      {s.reviewDue === 0 && !s.activeSession && (
        <EmptyState
          title="今日の復習はありません"
          actions={
            <a className="button" href={hrefFor({ name: 'scenarios' })}>
              場面別の会話を見る
            </a>
          }
        >
          <p>
            {s.unlearned > 0
              ? `未学習の問題が${s.unlearned}問あります。`
              : `登録済みの${s.questionCount}問はすべて学習済みで、次の復習日はまだ来ていません。`}
            場面別の会話や<a href={hrefFor({ name: 'practice' })}>問題演習</a>も利用できます。
          </p>
        </EmptyState>
      )}
    </div>
  );
}

function TodayCard({ stats }: { stats: HomeStats }) {
  const { practice, settings, clock, bumpDataVersion } = useReadyApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = stats.activeSession;
  const cur = active ? currentItem(active) : null;

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const s = await startTodaySession(practice, settings, clock);
      bumpDataVersion();
      if (s) window.location.hash = hrefFor({ name: 'session', id: s.sessionId });
      else setBusy(false);
    } catch (e) {
      setError(describeStorageError(toStorageError(e)));
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="today-heading">
      <h2 id="today-heading">今日の学習</h2>
      {active && cur ? (
        <>
          <p>
            中断した{ORIGIN_LABELS[active.origin]}があります（{Math.min(cur.index + 1, active.queue.length)} / {active.queue.length}問目
            {cur.mode === 'immediate_retry' ? '・再挑戦中' : ''}）。
          </p>
          <div className="row-actions">
            <a className="button button-primary" href={hrefFor({ name: 'session', id: active.sessionId })}>
              続きから再開
            </a>
            <button type="button" className="button" disabled={busy || stats.todayCount === 0} onClick={start}>
              終了して今日の学習を始める
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            今日の対象: {stats.todayCount}問（復習 {Math.min(stats.reviewDue, stats.todayCount)}問・1日の問題数 {settings.dailyQuestionCount}問）。期限が来た復習を優先し、未学習の問題を加えます。
          </p>
          <button type="button" className="button button-primary" disabled={busy || stats.todayCount === 0} onClick={start}>
            今日の学習を始める
          </button>
          {stats.todayCount === 0 && <p className="small muted">今日の対象の問題はありません。</p>}
        </>
      )}
      {error && (
        <p role="alert" className="help help-error">
          ⚠ 開始できませんでした。{error}
        </p>
      )}
    </section>
  );
}
