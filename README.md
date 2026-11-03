# chinestest — 中国語会話学習アプリ

作成日: 2026-10-23（日本時間） / Claude Code向け改訂: 2026-11-01 / 仕様バージョン: 1.1 / 状態: フェーズ2（日々の演習・復習）実装済み

中国語を話すパートナーのご家族と日常会話ができることを目指す、自分専用の学習アプリです。場面別会話、問題演習、苦手問題の復習、教材ファイルの追加を、外部APIを使わずに提供します。

この一式は設計・実装指示書と、実装中のアプリ本体です。会話で未確定だった項目には仮の既定値を置いています。進み具合は[実装計画](docs/08_IMPLEMENTATION_PLAN.md)のチェックで確認できます。

## 開発・検証の手順

Node.js 22以上が必要です。以下は2026-11-01にLinux上で実行を確認したコマンドです。

```sh
npm ci                 # 依存パッケージをlockfileどおりに導入
npm run dev            # 開発サーバー（http://localhost:5173/）
npm run lint           # ESLint ＋ 生成済み検査関数とスキーマの一致確認
npm run typecheck      # TypeScriptの型検査
npm run test:unit      # 単体・統合テスト（Vitest、IndexedDBはfake-indexeddb）
npm run build          # 本番ビルド（dist/）
npm run test:e2e       # 本番ビルドを /chinestest-e2e/ 配下で配信してPlaywright（Chromium、幅360px）で検証
```

- E2Eは導入済みのPlaywright用Chromiumを使います。手元にない場合は`npx playwright install chromium`を先に実行してください。
- サブパスで配信する場合は`BASE_PATH`を指定してビルドします（例: `BASE_PATH=/chinestest/ npm run build`）。プレビューも同じ値で`BASE_PATH=/chinestest/ npm run preview`とします。
- `schemas/content-pack.schema.json`を変更したら`npm run generate:validator`で検査関数を作り直してください（`npm run lint`が不一致を検出します）。
- 同梱教材は`public/content/`に置き、`public/content/index.json`の`bundledPacks`に登録します。現在はサンプル（`sample-meal`）のみです。
- GitHub Pagesへの公開は`.github/workflows/deploy-pages.yml`で行います。`main`へのpush（またはActions画面からの手動実行）で、lint・型検査・単体テスト・ビルドのあと公開します。初回はリポジトリの Settings → Pages → Source を「GitHub Actions」にしてください。非公開リポジトリでPagesを使うにはGitHubの有料プランが必要です。公開したページと同梱教材はURLを知っている人なら閲覧できます（学習記録はブラウザ内のみ）。
- ブラウザでの確認はChromium（Playwright）のみです。Safari・Edge・実機スマートフォンでは未確認です。

## Claude Codeでの使い方

作業場所は次のどちらかです。GitHubリポジトリがまだない場合は、Aのパソコン上での作業から始められます。

| 方法 | 必要なもの | 向いている場合 |
| --- | --- | --- |
| A. パソコンのターミナルでClaude Codeを使う | Claude Codeを入れたパソコン、Node.js、Git | リポジトリなしで始めたい。ブラウザで動作確認したい |
| B. Web・スマートフォンのClaude Codeを使う | GitHubリポジトリ（中身はこの一式） | パソコンを使わずに進めたい |

### A. パソコンで進める手順

1. 空のフォルダを作り、この一式の中身（`CLAUDE.md`、`docs/`など）をフォルダ直下に置きます。
2. そのフォルダで`git init`と最初のコミットを行います（設計書の状態を残すため）。
3. 同じフォルダで`claude`を起動します。`CLAUDE.md`はClaude Codeが自動で読み込みます。
4. [実装依頼プロンプト](prompts/IMPLEMENT_APP.md)の「フェーズ1」の指示を貼り付けます。完了報告を確認したら、次のフェーズの指示を送ります。
5. コマンド実行やファイル変更の許可を求められたら、内容を見て承認します。

### B. Web・スマートフォンで進める手順

1. GitHubで新しいリポジトリを作り、この一式をルートに置いてpushします。
2. Claude Codeでそのリポジトリを選んでセッションを始め、Aの4と同じ指示を送ります。
3. 変更をGitHubへ送る・PRを作る場合は、プロンプト末尾の「GitHub反映まで依頼する場合」を、実在のリポジトリ名・ブランチ名に置き換えて添えます。

どちらの方法でも、この一式を置いただけではGitHubへの送信やサイトの公開は行われません。既存の`CLAUDE.md`がある場合は上書きせず、既存ルールと統合してください。

## 文書一覧

| ファイル | 役割 |
| --- | --- |
| [CLAUDE.md](CLAUDE.md) | Claude Codeの作業ルール・制約・完了条件 |
| [要件定義](docs/01_REQUIREMENTS.md) | 利用目的、機能、初期版の範囲 |
| [基本設計](docs/02_ARCHITECTURE.md) | 技術構成、責務、保存・オフライン設計 |
| [画面設計](docs/03_SCREENS.md) | 画面、操作、空状態・エラー状態 |
| [データ設計](docs/04_DATA_MODEL.md) | IndexedDB、履歴、教材更新、バックアップ |
| [教材仕様](docs/05_CONTENT_FORMAT.md) | JSON契約、検査、採点、音声取り込み |
| [復習仕様](docs/06_REVIEW_RULES.md) | 苦手判定、復習日、同日再回答 |
| [テスト・受け入れ条件](docs/07_ACCEPTANCE_TESTS.md) | 検証方法と完成条件 |
| [実装計画](docs/08_IMPLEMENTATION_PLAN.md) | 実装順、成果物、未確定事項 |
| [GitHub運用](docs/09_GITHUB_WORKFLOW.md) | リポジトリ配置、CI、Pages公開手順 |
| [会話教材計画](docs/10_SCENARIO_CONTENT.md) | 親との会話・結婚の挨拶などの教材構成 |
| [実装依頼](prompts/IMPLEMENT_APP.md) | Claude Codeに渡すフェーズ別の指示 |
| [教材生成依頼](prompts/GENERATE_CONTENT.md) | 別の対話で教材JSONを生成する指示 |
| [PRテンプレート](.github/PULL_REQUEST_TEMPLATE.md) | 変更と検証の記録 |
| [教材サンプル](examples/starter-pack.json) | 取り込み形式を確認できる小さな例 |

仕様の正本は`docs/`です。具体的な教材契約は05、復習ロジックは06、永続化と復元は04を優先し、実装時には参照側も整合させます。利用者の新しい明示的な指示は本書より優先します。

## 仮の既定値

- 普通話、簡体字、声調記号付きピンイン。UIと解説は日本語。
- 初心者向け、1日15〜20分・10問。設定から問題数を変更可能。
- 検定は未指定。中国語検定・HSKの形式を参考にしたオリジナル問題を扱い、級の同等性を断定しない。
- 新規実装はReact + TypeScript + Vite、IndexedDB、静的PWAを推奨。既存リポジトリでは既存構成を尊重する。
- 初期シーン6件、各8問の計48問。サンプルJSONは3問であり、初期教材の完成版ではない。

## 外部APIを使わない範囲

アプリ実行時には外部API、クラウドAI、認証・同期サービス、アクセス解析、外部CDN、オンライン読み上げを使いません。同一サイトからの静的ファイル配信とブラウザ標準APIは利用します。

開発時の依存パッケージ取得、GitHubへのコード保存、CI、任意の静的ホスティングはこの制約とは別です。教材を別の対話で生成し、手動で取り込む運用も可能です。アプリ自身は生成サービスへ接続しません。
