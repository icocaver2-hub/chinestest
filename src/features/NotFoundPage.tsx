import { hrefFor } from '../app/router';
import { EmptyState } from '../components/States';

export function NotFoundPage({ path }: { path: string }) {
  return (
    <div className="page">
      <EmptyState
        title="ページが見つかりません"
        actions={
          <a className="button" href={hrefFor({ name: 'home' })}>
            ホームへ戻る
          </a>
        }
      >
        <p>
          「<code>{path}</code>」に対応する画面はありません。
        </p>
      </EmptyState>
    </div>
  );
}
