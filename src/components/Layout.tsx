import type { ReactNode } from 'react';
import { hrefFor, type Route } from '../app/router';

const NAV_ITEMS = [
  { name: 'home', label: 'ホーム', icon: '⌂' },
  { name: 'scenarios', label: '会話', icon: '💬' },
  { name: 'practice', label: '問題', icon: '✎' },
  { name: 'review', label: '復習', icon: '↻' },
  { name: 'materials', label: '教材', icon: '📚' },
] as const;

type NavName = (typeof NAV_ITEMS)[number]['name'];

function activeNav(route: Route): NavName | null {
  switch (route.name) {
    case 'home':
    case 'settings':
    case 'history':
      return 'home';
    case 'scenarios':
    case 'scenario':
      return 'scenarios';
    case 'practice':
      return 'practice';
    case 'review':
      return 'review';
    case 'materials':
      return 'materials';
    default:
      return null;
  }
}

export function Layout({ route, children }: { route: Route; children: ReactNode }) {
  const active = activeNav(route);
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="app-title" href={hrefFor({ name: 'home' })}>
          中国語会話学習
        </a>
        <a className="header-link" href={hrefFor({ name: 'settings' })}>
          設定
        </a>
      </header>
      <main className="app-main" id="main" tabIndex={-1}>
        {children}
      </main>
      <nav className="bottom-nav" aria-label="メインメニュー">
        <ul>
          {NAV_ITEMS.map((item) => (
            <li key={item.name}>
              <a
                href={hrefFor({ name: item.name })}
                aria-current={active === item.name ? 'page' : undefined}
                className="nav-link"
              >
                <span className="nav-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="nav-label">{item.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
