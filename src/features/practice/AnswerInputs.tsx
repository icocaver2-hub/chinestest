/**
 * 3形式の回答入力。いずれもタップ・キーボードで操作できる（ドラッグ専用にしない）。
 */
import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { orderingTexts } from '../../domain/grading';
import { BLANK_MARKER, type FillBlankQuestion, type OrderingQuestion, type SingleChoiceQuestion } from '../../types/content';
import type { AnswerValue } from '../../types/db';

interface InputProps<Q> {
  question: Q;
  disabled: boolean;
  onSubmit: (answer: AnswerValue) => void;
}

export function SingleChoiceInput({ question, disabled, onSubmit }: InputProps<SingleChoiceQuestion>) {
  const [selected, setSelected] = useState<string | null>(null);
  const name = useId();
  function submit(e: FormEvent) {
    e.preventDefault();
    if (selected !== null && !disabled) onSubmit(selected);
  }
  return (
    <form onSubmit={submit} className="answer-form">
      <fieldset className="choices" disabled={disabled}>
        <legend className="visually-hidden">選択肢</legend>
        {question.choices.map((c) => (
          <label key={c.id} className={`choice${selected === c.id ? ' choice-selected' : ''}`}>
            <input type="radio" name={name} value={c.id} checked={selected === c.id} onChange={() => setSelected(c.id)} />
            <span className="zh" lang="zh-CN">
              {c.text}
            </span>
          </label>
        ))}
      </fieldset>
      <button type="submit" className="button button-primary button-block" disabled={disabled || selected === null}>
        回答する
      </button>
    </form>
  );
}

function shuffled<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** 開始時にタイル順をシャッフルする。正解の並びと同じなら並べ直す（IDは変えない）。 */
function initialPool(q: OrderingQuestion): string[] {
  const ids = q.tokens.map((t) => t.id);
  const correct = q.acceptedOrders.map((o) => (orderingTexts(q, o) ?? []).join('\u0000'));
  for (let i = 0; i < 10; i++) {
    const s = shuffled(ids);
    if (!correct.includes((orderingTexts(q, s) ?? []).join('\u0000'))) return s;
  }
  return shuffled(ids);
}

export function OrderingInput({ question, disabled, onSubmit }: InputProps<OrderingQuestion>) {
  const [pool] = useState(() => initialPool(question));
  const [chosen, setChosen] = useState<string[]>([]);
  const text = new Map(question.tokens.map((t) => [t.id, t.text]));
  const remaining = pool.filter((id) => !chosen.includes(id));
  const complete = chosen.length === question.tokens.length;

  return (
    <div className="answer-form">
      <div className="ordering-answer" aria-live="polite">
        <p className="small muted" id="ordering-answer-label">
          あなたの並び（タップで外す）
        </p>
        <ol className="tiles tiles-answer" aria-labelledby="ordering-answer-label">
          {chosen.length === 0 && <li className="tiles-empty muted small">下の語を順にタップしてください</li>}
          {chosen.map((id, i) => (
            <li key={id}>
              <button
                type="button"
                className="tile tile-chosen"
                lang="zh-CN"
                disabled={disabled}
                onClick={() => setChosen(chosen.filter((c) => c !== id))}
                aria-label={`${i + 1}番目「${text.get(id)}」を外す`}
              >
                {text.get(id)}
              </button>
            </li>
          ))}
        </ol>
      </div>
      <p className="small muted" id="ordering-pool-label">
        使える語
      </p>
      <ul className="tiles" aria-labelledby="ordering-pool-label">
        {remaining.map((id) => (
          <li key={id}>
            <button type="button" className="tile" lang="zh-CN" disabled={disabled} onClick={() => setChosen([...chosen, id])}>
              {text.get(id)}
            </button>
          </li>
        ))}
      </ul>
      <div className="row-actions">
        <button type="button" className="button" disabled={disabled || chosen.length === 0} onClick={() => setChosen(chosen.slice(0, -1))}>
          1つ戻す
        </button>
        <button type="button" className="button" disabled={disabled || chosen.length === 0} onClick={() => setChosen([])}>
          やり直し
        </button>
      </div>
      <button type="button" className="button button-primary button-block" disabled={disabled || !complete} onClick={() => onSubmit(chosen)}>
        回答する
      </button>
    </div>
  );
}

export function FillBlankInput({ question, disabled, onSubmit }: InputProps<FillBlankQuestion>) {
  const [value, setValue] = useState('');
  const id = useId();
  const [before, after] = splitOnce(question.sentence, BLANK_MARKER);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!disabled && value.trim() !== '') onSubmit(value);
  }
  // 中国語IMEの変換確定のEnterで送信しない
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault();
  }

  return (
    <form onSubmit={submit} className="answer-form">
      <p className="zh fill-sentence" lang="zh-CN">
        {before}
        <label htmlFor={id} className="visually-hidden">
          空欄に入る語
        </label>
        <input
          id={id}
          className="blank-input"
          lang="zh-CN"
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {after}
      </p>
      <button type="submit" className="button button-primary button-block" disabled={disabled || value.trim() === ''}>
        回答する
      </button>
    </form>
  );
}

function splitOnce(s: string, marker: string): [string, string] {
  const i = s.indexOf(marker);
  return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + marker.length)];
}
