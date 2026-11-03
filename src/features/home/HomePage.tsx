import { useCallback } from 'react';
import { useReadyApp } from '../../app/AppContext';
import { hrefFor } from '../../app/router';
import { toStudyDate } from '../../domain/study-date';
import { EmptyState, ErrorState, Loading } from '../../components/States';
import { useAsyncData } from '../../components/useAsyncData';

interface HomeStats {
  today: string;
  answeredToday: number;
  conversationRatingsToday: number;
  reviewDue: number;
  weakUnmastered: number;
  questionCount: number;
  activeSession: boolean;
}

export function HomePage() {
  const { repo, settings, clock, dataVersion } = useReadyApp();
  const tz = settings.studyTimeZone;

  const load = useCallback(async (): Promise<HomeStats> => {
    void dataVersion;
    const today = toStudyDate(clock(), tz);
    const db = repo.db;
    const [answeredToday, conversationRatingsToday, dueStates, allStates, questionCount, activeSessions] =
      await Promise.all([
        db.countFromIndex('attempts', 'studyDate', today),
        db.countFromIndex('conversationAttempts', 'studyDate', today),
        db.countFromIndex('questionStates', 'nextReviewDate', IDBKeyRange.upperBound(today)),
        db.getAll('questionStates'),
        db.count('questions'),
        db.countFromIndex('sessions', 'status', 'active'),
      ]);
    return {
      today,
      answeredToday,
      conversationRatingsToday,
      reviewDue: dueStates,
      weakUnmastered: allStates.filter((s) => s.incorrectCount >= 3 && !s.mastered).length,
      questionCount,
      activeSession: activeSessions > 0,
    };
  }, [repo, clock, tz, dataVersion]);

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

      <section className="card" aria-labelledby="today-heading">
        <h2 id="today-heading">今日の学習</h2>
        <p>
          1日の問題数: {settings.dailyQuestionCount}問。期限が来た復習を優先し、未学習の問題を加えます。
        </p>
        <button type="button" className="button button-primary" disabled aria-describedby="today-note">
          今日の学習を始める
        </button>
        <p id="today-note" className="muted small">
          問題演習・復習は準備中です（実装計画のフェーズ2で追加予定）。
        </p>
      </section>

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

      {s.reviewDue === 0 && (
        <EmptyState
          title="今日の復習はありません"
          actions={
            <a className="button" href={hrefFor({ name: 'scenarios' })}>
              場面別の会話を見る
            </a>
          }
        >
          <p>登録済みの問題は{s.questionCount}問です。場面別の会話で表現を確認しましょう。</p>
        </EmptyState>
      )}
    </div>
  );
}
