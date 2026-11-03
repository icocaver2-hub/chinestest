import { hrefFor } from '../../app/router';
import { PendingFeature } from '../../components/States';

export function PracticePage() {
  return (
    <div className="page">
      <h1 className="page-title">問題演習</h1>
      <PendingFeature title="問題演習は準備中です" phase={2}>
        <p>
          それまでは<a href={hrefFor({ name: 'scenarios' })}>場面別の会話</a>で表現を確認できます。
        </p>
      </PendingFeature>
    </div>
  );
}
