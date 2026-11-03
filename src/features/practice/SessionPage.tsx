import { useCallback, useEffect, useRef, useState } from 'react';
import { useReadyApp } from '../../app/AppContext';
import { newId } from '../../app/ids';
import { hrefFor } from '../../app/router';
import { startTodaySession } from '../../app/start-session';
import { answerText, correctAnswerText, gradeAnswer } from '../../domain/grading';
import { currentItem, sessionLength, summarizeSession } from '../../domain/session';
import { toStudyDate } from '../../domain/study-date';
import { formatPercent, ORIGIN_LABELS, QUESTION_TYPE_LABELS } from '../../components/labels';
import { EmptyState, ErrorState, Loading } from '../../components/States';
import { useAsyncData } from '../../components/useAsyncData';
import { describeStorageError, toStorageError } from '../../repositories/storage-error';
import type { AnswerValue, AttemptMode, AttemptRecord, QuestionRecord, QuestionStateRecord, SessionRecord } from '../../types/db';
import { FillBlankInput, OrderingInput, SingleChoiceInput } from './AnswerInputs';
import { BookmarkButton } from './BookmarkButton';

interface Feedback {
  question: QuestionRecord;
  attempt: AttemptRecord;
  state: QuestionStateRecord;
  mode: AttemptMode;
  /** 再挑戦キューに入ったか */
  willRetry: boolean;
}

export function SessionPage({ id }: { id: string }) {
  const { practice, repo, dataVersion } = useReadyApp();
  const [reloadKey, setReloadKey] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const load = useCallback(async () => {
    void dataVersion;
    void reloadKey;
    let session = await practice.getSession(id);
    if (session?.status === 'active' && (await practice.invalidateIfStale(id))) session = await practice.getSession(id);
    if (!session) return { session: undefined, question: undefined };
    const cur = currentItem(session);
    const question = cur ? await repo.db.get('questions', cur.item.questionId) : undefined;
    return { session, question };
  }, [practice, repo, id, dataVersion, reloadKey]);
  const data = useAsyncData(load);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  if (feedback) {
    return (
      <FeedbackView
        feedback={feedback}
        onNext={() => {
          setFeedback(null);
          reload();
        }}
      />
    );
  }
  if (data.status === 'loading') return <Loading />;
  if (data.status === 'error') return <ErrorState title="演習を読み込めませんでした">再読み込みしてください。</ErrorState>;
  const { session, question } = data.data;

  if (!session) {
    return (
      <EmptyState title="この演習は見つかりません" actions={<a className="button" href={hrefFor({ name: 'home' })}>ホームへ戻る</a>}>
        <p>URLが正しくないか、データが復元・削除された可能性があります。</p>
      </EmptyState>
    );
  }
  if (session.status === 'invalidated') return <InvalidatedView />;
  if (session.status === 'completed') return <ResultView session={session} />;

  const cur = currentItem(session);
  if (!cur || !question) return <InvalidatedView />;

  return (
    <QuestionCard
      key={`${session.sessionId}-${cur.index}`}
      session={session}
      question={question}
      index={cur.index}
      mode={cur.mode}
      onAnswered={setFeedback}
      onConflict={reload}
    />
  );
}

function QuestionCard({
  session,
  question,
  index,
  mode,
  onAnswered,
  onConflict,
}: {
  session: SessionRecord;
  question: QuestionRecord;
  index: number;
  mode: AttemptMode;
  onAnswered: (f: Feedback) => void;
  onConflict: () => void;
}) {
  const { practice, settings, clock } = useReadyApp();
  // 1回の回答ごとに固定のID。保存失敗後の再試行でも同じIDを使い、二重記録を防ぐ。
  const [submissionId] = useState(newId);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<AnswerValue | null>(null);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);
  const total = sessionLength(session);

  async function submit(answer: AnswerValue) {
    if (saving) return;
    setSaving(true);
    setPending(answer);
    setError(null);
    const now = clock();
    try {
      const outcome = await practice.recordAnswer({
        submissionId,
        sessionId: session.sessionId,
        index,
        questionId: question.id,
        revision: question.revision,
        answer,
        result: gradeAnswer(question, answer),
        occurredAt: now.toISOString(),
        studyDate: toStudyDate(now, settings.studyTimeZone),
        timeZone: settings.studyTimeZone,
      });
      if (outcome.status === 'invalidated') {
        onConflict();
        return;
      }
      onAnswered({
        question,
        attempt: outcome.attempt,
        state: outcome.state,
        mode,
        willRetry: outcome.attempt.mode === 'normal' && outcome.attempt.result === 'incorrect',
      });
    } catch (e) {
      const se = toStorageError(e);
      setError({ message: describeStorageError(se), conflict: se.kind === 'conflict' });
      setSaving(false);
    }
  }

  const inputProps = { disabled: saving, onSubmit: submit };
  return (
    <div className="page">
      <SessionHeader session={session} index={index} total={total} mode={mode} />
      <section className="card question-card" aria-labelledby="question-prompt">
        <div className="question-top">
          <span className="badge">{QUESTION_TYPE_LABELS[question.type]}</span>
          <BookmarkButton questionId={question.id} />
        </div>
        <h2 id="question-prompt" className="question-prompt">
          {question.prompt}
        </h2>
        {question.type === 'single_choice' && <SingleChoiceInput question={question} {...inputProps} />}
        {question.type === 'ordering' && <OrderingInput question={question} {...inputProps} />}
        {question.type === 'fill_blank' && <FillBlankInput question={question} {...inputProps} />}
        {saving && !error && (
          <p role="status" className="small muted">
            保存中…
          </p>
        )}
      </section>
      {error && (
        <ErrorState
          title="回答を保存できませんでした"
          actions={
            error.conflict ? (
              <button type="button" className="button button-primary" onClick={onConflict}>
                最新の状態を読み込む
              </button>
            ) : (
              <button type="button" className="button button-primary" onClick={() => pending !== null && void submit(pending)}>
                もう一度保存する
              </button>
            )
          }
        >
          <p>{error.message}</p>
          {!error.conflict && <p className="small">回答は失われていません。同じ回答をもう一度保存できます。</p>}
        </ErrorState>
      )}
    </div>
  );
}

function SessionHeader({ session, index, total, mode }: { session: SessionRecord; index: number; total: number; mode: AttemptMode }) {
  return (
    <div className="session-header">
      <h1 className="session-origin">{ORIGIN_LABELS[session.origin]}</h1>
      <p className="progress-text">
        {mode === 'immediate_retry' ? (
          <span className="badge badge-retry">再挑戦</span>
        ) : (
          <span>
            {index + 1} / {session.queue.length}問
          </span>
        )}
      </p>
      <progress className="progress" max={total} value={index} aria-label={`進み具合 ${index} / ${total}`} />
    </div>
  );
}

function FeedbackView({ feedback, onNext }: { feedback: Feedback; onNext: () => void }) {
  const { question: q, attempt, state, mode, willRetry } = feedback;
  const correct = attempt.result === 'correct';
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => nextRef.current?.focus(), []);

  return (
    <div className="page">
      <section className={`card feedback ${correct ? 'feedback-correct' : 'feedback-incorrect'}`} aria-live="polite">
        <h2 className="feedback-title">
          <span aria-hidden="true">{correct ? '○ ' : '× '}</span>
          {correct ? '正解' : '不正解'}
          {mode === 'immediate_retry' && <span className="small">（再挑戦）</span>}
        </h2>
        <p className="small muted">{q.prompt}</p>
        {!correct && (
          <p>
            あなたの回答:{' '}
            <span className="zh" lang="zh-CN">
              {answerText(q, attempt.answer) || '（空欄）'}
            </span>
          </p>
        )}
        <dl className="answer-detail">
          <dt>正解</dt>
          <dd className="zh" lang="zh-CN">
            {correctAnswerText(q)}
          </dd>
          <dt>ピンイン</dt>
          <dd className="pinyin" lang="zh-Latn-pinyin">
            {q.pinyin}
          </dd>
          <dt>訳</dt>
          <dd>{q.translation}</dd>
          <dt>解説</dt>
          <dd>{q.explanation}</dd>
        </dl>
        {willRetry && <p className="notice-inline">この問題は演習の最後にもう一度出題します。</p>}
        {state.nextReviewDate && <p className="small muted">次の復習予定: {state.nextReviewDate}</p>}
        <div className="row-actions">
          <BookmarkButton questionId={q.id} />
        </div>
      </section>
      <button ref={nextRef} type="button" className="button button-primary button-block" onClick={onNext}>
        次へ
      </button>
    </div>
  );
}

function ResultView({ session }: { session: SessionRecord }) {
  const { practice, repo } = useReadyApp();
  const load = useCallback(async () => {
    const attempts = await practice.listSessionAttempts(session.sessionId);
    const ids = [...new Set(session.queue.map((x) => x.questionId))];
    const rows = await Promise.all(
      ids.map(async (qid) => {
        const item = session.queue.find((x) => x.questionId === qid)!;
        const [question, state] = await Promise.all([
          repo.db.get('questionVersions', [qid, item.revision]),
          repo.db.get('questionStates', [qid, item.revision]),
        ]);
        return { qid, question, state };
      }),
    );
    return { attempts, rows };
  }, [practice, repo, session]);
  const data = useAsyncData(load);
  if (data.status === 'loading') return <Loading />;
  if (data.status === 'error') return <ErrorState title="結果を読み込めませんでした">再読み込みしてください。</ErrorState>;

  const sum = summarizeSession(data.data.attempts);
  const missed = new Set(sum.missedQuestionIds);
  const nextDates = data.data.rows
    .map((r) => r.state?.nextReviewDate)
    .filter((d): d is string => !!d)
    .sort();

  return (
    <div className="page">
      <h1 className="page-title">結果</h1>
      <p className="small muted">{ORIGIN_LABELS[session.origin]}</p>
      <section className="card">
        <dl className="stats">
          <div>
            <dt>回答数</dt>
            <dd>{sum.answered}問</dd>
          </div>
          <div>
            <dt>初回正答率</dt>
            <dd>
              {formatPercent(sum.firstAccuracy)}
              <span className="small muted">
                {' '}
                （{sum.firstCorrect}/{sum.answered}）
              </span>
            </dd>
          </div>
          <div>
            <dt>再挑戦</dt>
            <dd>
              {sum.retried === 0 ? 'なし' : `${sum.retryCorrect}/${sum.retried}問 正解`}
            </dd>
          </div>
          <div>
            <dt>次の復習予定</dt>
            <dd className="small">{nextDates[0] ?? '—'}</dd>
          </div>
        </dl>
        {sum.answered < session.queue.length && (
          <p className="small muted">途中で終了した演習です（保存済みの回答のみ集計）。</p>
        )}
      </section>

      {missed.size > 0 && (
        <section className="card">
          <h2>間違えた問題</h2>
          <ul>
            {data.data.rows
              .filter((r) => missed.has(r.qid))
              .map((r) => (
                <li key={r.qid}>
                  {r.question?.prompt ?? r.qid}
                  {r.state?.nextReviewDate && <span className="small muted">（復習予定 {r.state.nextReviewDate}）</span>}
                </li>
              ))}
          </ul>
        </section>
      )}

      <div className="row-actions">
        <a className="button button-primary" href={hrefFor({ name: 'home' })}>
          ホームへ
        </a>
        <a className="button" href={hrefFor({ name: 'review' })}>
          復習一覧へ
        </a>
      </div>
    </div>
  );
}

function InvalidatedView() {
  const { practice, settings, clock, bumpDataVersion } = useReadyApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function restart() {
    setBusy(true);
    try {
      const s = await startTodaySession(practice, settings, clock);
      bumpDataVersion();
      window.location.hash = s ? hrefFor({ name: 'session', id: s.sessionId }) : hrefFor({ name: 'home' });
    } catch (e) {
      setError(describeStorageError(toStorageError(e)));
      setBusy(false);
    }
  }
  return (
    <EmptyState
      title="教材が更新されたため、この演習は終了しました"
      actions={
        <button type="button" className="button button-primary" disabled={busy} onClick={restart}>
          新しい問題で今日の学習を始める
        </button>
      }
    >
      <p>保存済みの回答は残っています。</p>
      {error && <p role="alert">{error}</p>}
    </EmptyState>
  );
}
