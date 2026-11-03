import { hrefFor } from '../../app/router';
import { PendingFeature } from '../../components/States';

export function ReviewPage() {
  return (
    <div className="page">
      <h1 className="page-title">復習</h1>
      <PendingFeature title="復習は準備中です" phase={2}>
        <p>
          「今日の復習 / 前回不正解 / 繰り返し間違える / ブックマーク」の一覧を追加予定です。
          <a href={hrefFor({ name: 'scenarios' })}>場面別の会話</a>は今すぐ利用できます。
        </p>
      </PendingFeature>
    </div>
  );
}
