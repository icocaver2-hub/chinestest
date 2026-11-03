import { describe, expect, it } from 'vitest';
import { answerText, correctAnswerText, gradeAnswer, normalizeFillAnswer } from '../../src/domain/grading';
import type { FillBlankQuestion, OrderingQuestion, SingleChoiceQuestion } from '../../src/types/content';
import { starterPack } from '../helpers/fixtures';

const pack = starterPack();
const single = pack.questions[0] as SingleChoiceQuestion;
const ordering = pack.questions[1] as OrderingQuestion;
const fill = pack.questions[2] as FillBlankQuestion;

describe('T02 選択式', () => {
  it('正解IDなら正解、それ以外は不正解', () => {
    expect(gradeAnswer(single, 'a')).toBe('correct');
    expect(gradeAnswer(single, 'b')).toBe('incorrect');
    expect(gradeAnswer(single, ['a'])).toBe('incorrect');
  });
});

describe('T02 並べ替え', () => {
  it('正解順序なら正解', () => {
    expect(gradeAnswer(ordering, ['t1', 't2', 't3', 't4'])).toBe('correct');
    expect(gradeAnswer(ordering, ['t2', 't1', 't3', 't4'])).toBe('incorrect');
  });

  it('全トークンを使っていない・重複・未知IDは不正解', () => {
    expect(gradeAnswer(ordering, ['t1', 't2', 't3'])).toBe('incorrect');
    expect(gradeAnswer(ordering, ['t1', 't1', 't3', 't4'])).toBe('incorrect');
    expect(gradeAnswer(ordering, ['t1', 't2', 't3', 'zz'])).toBe('incorrect');
    expect(gradeAnswer(ordering, 't1t2t3t4')).toBe('incorrect');
  });

  it('許容別解（acceptedOrdersの2件目以降）も正解', () => {
    const q: OrderingQuestion = {
      ...ordering,
      tokens: [
        { id: 'a', text: '今天' },
        { id: 'b', text: '我' },
        { id: 'c', text: '很忙' },
      ],
      acceptedOrders: [
        ['a', 'b', 'c'],
        ['b', 'a', 'c'],
      ],
    };
    expect(gradeAnswer(q, ['a', 'b', 'c'])).toBe('correct');
    expect(gradeAnswer(q, ['b', 'a', 'c'])).toBe('correct');
    expect(gradeAnswer(q, ['c', 'a', 'b'])).toBe('incorrect');
  });

  it('同じ文字のタイルは入れ替えても正解', () => {
    const q: OrderingQuestion = {
      ...ordering,
      tokens: [
        { id: 'x1', text: '谢谢' },
        { id: 'x2', text: '谢谢' },
        { id: 'y', text: '你' },
      ],
      acceptedOrders: [['x1', 'y', 'x2']],
    };
    expect(gradeAnswer(q, ['x1', 'y', 'x2'])).toBe('correct');
    expect(gradeAnswer(q, ['x2', 'y', 'x1'])).toBe('correct');
    expect(gradeAnswer(q, ['y', 'x1', 'x2'])).toBe('incorrect');
  });

  it('単語境界を残して比較する（連結文字列が同じでも区切りが違えば不正解）', () => {
    const q: OrderingQuestion = {
      ...ordering,
      tokens: [
        { id: 'a', text: '好' },
        { id: 'b', text: '吃' },
        { id: 'c', text: '好吃' },
      ],
      acceptedOrders: [['a', 'b', 'c']],
    };
    // 「好吃好吃」は c,a,b でも連結では同じになるが、単語列が違うので不正解
    expect(gradeAnswer(q, ['c', 'a', 'b'])).toBe('incorrect');
  });
});

describe('T02 穴埋め・正規化', () => {
  it('完全一致と許容別解', () => {
    expect(gradeAnswer(fill, '好吃')).toBe('correct');
    expect(gradeAnswer(fill, '好喝')).toBe('incorrect');
    expect(gradeAnswer({ ...fill, acceptedAnswers: ['好吃', '很好吃'] }, '很好吃')).toBe('correct');
  });

  it('前後空白・連続空白・末尾の句読点・全角英数字を正規化する', () => {
    expect(gradeAnswer(fill, '  好吃 ')).toBe('correct');
    expect(gradeAnswer(fill, '好吃。')).toBe('correct');
    expect(gradeAnswer(fill, '好吃！？')).toBe('correct');
    expect(normalizeFillAnswer('ＡＢＣ１２３')).toBe('ABC123');
    expect(normalizeFillAnswer('a   b　c')).toBe('a b c');
  });

  it('NFCで同一視する', () => {
    const decomposed = 'é'; // é（分解形）
    expect(normalizeFillAnswer(decomposed)).toBe('é');
  });

  it('声調・簡体字/繁体字・内部の句読点は自動で同一視しない', () => {
    expect(gradeAnswer({ ...fill, acceptedAnswers: ['hǎochī'] }, 'haochi')).toBe('incorrect');
    expect(gradeAnswer({ ...fill, acceptedAnswers: ['说话'] }, '說話')).toBe('incorrect');
    expect(gradeAnswer({ ...fill, acceptedAnswers: ['好，吃'] }, '好吃')).toBe('incorrect');
  });

  it('空の回答は不正解', () => {
    expect(gradeAnswer(fill, '   ')).toBe('incorrect');
    expect(gradeAnswer({ ...fill, acceptedAnswers: ['。'] }, '')).toBe('incorrect');
  });
});

describe('正解・回答の表示', () => {
  it('各形式の正解本文', () => {
    expect(correctAnswerText(single)).toBe('这道菜很好吃。');
    expect(correctAnswerText(ordering)).toBe('我喜欢吃鱼');
    expect(correctAnswerText(fill)).toBe('这道菜很好吃。');
  });

  it('回答の表示', () => {
    expect(answerText(single, 'b')).toBe('今天天气很好。');
    expect(answerText(ordering, ['t2', 't1'])).toBe('喜欢 我');
    expect(answerText(fill, '好喝')).toBe('好喝');
  });
});
