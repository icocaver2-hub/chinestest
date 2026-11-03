/** 現在日時の取得を注入可能にする（テストで実時間に依存しないため）。 */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();

export function fixedClock(iso: string): Clock {
  const t = new Date(iso).getTime();
  return () => new Date(t);
}
