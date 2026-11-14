import { useCallback } from 'react';
import { useReadyApp } from '../../app/AppContext';
import { hrefFor } from '../../app/router';
import { summarizeSession } from '../../domain/session';
import { toStudyDate } from '../../domain/study-date';
import { formatPercent, ORIGIN_LABELS, SELF_RATING_LABELS } from '../../components/labels';
import { EmptyState, ErrorState, Loading } from '../../components/States';
import { useAsyncData } from '../../components/useAsyncData';

const STATUS_LABELS = { active: '中断中', completed: '終了', invalidated: '教材更新で終了' } as const;

export function HistoryPage() {
  const { repo, practice, settings, dataVersion } = useReadyApp();
  const load = useCallback(async () => {
    void dataVersion;
    const [sessions, attempts, conversations] = await Promise.all([
      practice.listSessions(),
      repo.db.getAll('attempts'),
      practice.listConversationRatings(),
    ]);
    const bySession = new Map<string, typeof attempts>();
    for (const a of attempts) bySession.set(a.sessionId, [...(bySession.get(a.sessionId) ?? []), a]);
    const rows = sessions
      .map((s) => ({ session: s, summary: summarizeSession(bySession.get(s.sessionId) ?? []) }))
      .filter((r) => r.summary.answered > 0 || r.session.status === 'active');
    const ratingCounts = {
      said: conversations.filter((c) => c.rating === 'said').length,
      hesitated: conversations.filter((c) => c.rating === 'hesitated').length,
      could_not_say: conversations.filter((c) => c.rating === 'could_not_say').length,
    };
    return { rows, total: summarizeSession(attempts), conversations: conversations.length, ratingCounts };
  }, [repo, practice, dataVersion]);
  const data = useAsyncData(load);

  if (data.status === 'loading') return <Loading />;
  if (data.status === 'error') return <ErrorState title="学習記録を読み込めませんでした">再読み込みしてください。</ErrorState>;
  const { rows, total, conversations, ratingCounts } = data.data;

  return (
    <div className="page">
      <h1 className="page-title">学習記録</h1>
      {rows.length === 0 && conversations === 0 ? (
        <EmptyState
          title="まだ学習記録はありません"
          actions={
            <a className="button" href={hrefFor({ name: 'home' })}>
              今日の学習へ
            </a>
          }
        >
          <p>問題に回答したり会話を自己評価したりすると、ここに記録が表示されます。</p>
        </EmptyState>
      ) : (
        <>
          <section className="card">
            <h2>合計</h2>
            <dl className="stats">
              <div>
                <dt>問題の回答（自動採点）</dt>
                <dd>{total.answered}問</dd>
              </div>
              <div>
                <dt>初回正答率</dt>
                <dd>{formatPercent(total.firstAccuracy)}</dd>
              </div>
              <div>
                <dt>再挑戦</dt>
                <dd>
                  {total.retryCorrect}/{total.retried}問 正解
                </dd>
              </div>
              <div>
                <dt>会話の自己評価</dt>
                <dd>{conversations}件</dd>
              </div>
            </dl>
            {conversations > 0 && (
              <p className="small">
                会話の自己評価の内訳: {SELF_RATING_LABELS.said} {ratingCounts.said}・{SELF_RATING_LABELS.hesitated}{' '}
                {ratingCounts.hesitated}・{SELF_RATING_LABELS.could_not_say} {ratingCounts.could_not_say}
              </p>
            )}
            <p className="small muted">会話の自己評価は正答率に含めません。</p>
          </section>
          <section>
            <h2 className="section-title">演習の履歴</h2>
            <ul className="card-list" aria-label="演習の履歴">
              {rows.map(({ session: s, summary }) => (
                <li key={s.sessionId} className="card">
                  <p className="card-title">
                    <a href={hrefFor({ name: 'session', id: s.sessionId })}>
                      {toStudyDate(new Date(s.startedAt), settings.studyTimeZone)} {ORIGIN_LABELS[s.origin]}
                    </a>
                  </p>
                  <p className="meta-line">
                    <span className="badge">{STATUS_LABELS[s.status]}</span>
                    <span>
                      {summary.answered}/{s.queue.length}問
                    </span>
                    <span>初回正答率 {formatPercent(summary.firstAccuracy)}</span>
                    {summary.retried > 0 && (
                      <span>
                        再挑戦 {summary.retryCorrect}/{summary.retried}
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
