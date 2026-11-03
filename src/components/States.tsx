import type { ReactNode } from 'react';

/** 空の一覧を障害と見せず、次にできる操作を提示する */
export function EmptyState({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <section className="state state-empty" aria-label={title}>
      <h2 className="state-title">{title}</h2>
      {children && <div className="state-body">{children}</div>}
      {actions && <div className="state-actions">{actions}</div>}
    </section>
  );
}

export function ErrorState({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <section className="state state-error" role="alert">
      <h2 className="state-title">
        <span aria-hidden="true">⚠ </span>
        {title}
      </h2>
      {children && <div className="state-body">{children}</div>}
      {actions && <div className="state-actions">{actions}</div>}
    </section>
  );
}

export function Loading({ label = '読み込み中…' }: { label?: string }) {
  return (
    <p className="loading" role="status" aria-live="polite">
      {label}
    </p>
  );
}

export function PendingFeature({ title, phase, children }: { title: string; phase: number; children?: ReactNode }) {
  return (
    <EmptyState title={title}>
      <p>
        この機能は準備中です（実装計画のフェーズ{phase}で追加予定）。
      </p>
      {children}
    </EmptyState>
  );
}
