# 基本設計・技術構成

## 推奨構成

空のリポジトリではReact + TypeScript + Viteを使う。IndexedDBの薄いラッパーとしてidb、JSON検査にAjvとJSON Schema、単体テストにVitest、ブラウザテストにPlaywrightを推奨する。安定版を採用してlockfileをコミットする。既存構成がある場合は同じ機能を既存技術で実現してよい。

サーバーアプリ、APIルート、外部データベース、APIキーは不要。使用するライブラリはビルドに含め、実行時CDNから読み込まない。UIフォントはシステムフォントを基本とする。

## 層と責務

| 層 | 責務 |
| --- | --- |
| UI | 画面、フォーム、アクセシビリティ、表示状態 |
| Application | 学習セッション、教材取り込み、バックアップの処理順 |
| Domain | 採点、復習スケジュール、ID比較、内容検査 |
| Repository | IndexedDBのトランザクション、マイグレーション |
| Assets/PWA | 同一サイトの教材・音声・アプリ資産、オフラインキャッシュ |

推奨ディレクトリ:

```text
src/
  app/                 # 起動・ルーティング
  features/            # home, scenarios, practice, review, materials, settings
  domain/              # grading, review, import-validation
  repositories/        # IndexedDB
  components/          # 共通UI
  types/
public/
  content/             # 初期教材JSON
  audio/               # 権利と出典を確認した任意の音声
  icons/               # ローカルアイコン
schemas/               # 実装時に作るJSON Schema
tests/                 # unit, integration, e2e
docs/
prompts/
```

## 画面遷移・静的ホスティング

Hashルーティングを採用し、GitHub Pagesなどで深いURLへの再アクセス時に404を避ける。ルートは`#/`、`#/scenarios`、`#/scenarios/:id`、`#/practice`、`#/review`、`#/materials`、`#/settings`、`#/history`。

資産URL・Service WorkerのscopeはViteのbaseに追従させる。`/repository-name/`配下のホストを受け入れ検証に含める。`/content/...`のようなサイト直下固定パスを避ける。

## 起動

1. IndexedDBを開いて必要なマイグレーションを行う。
2. 初期教材が未登録なら05と同じ検査を経て一括登録する。
3. 保存済み教材・設定・進捗を読み込む。
4. 初期教材更新がある場合は差分をプレビューし、明示的な適用操作を用意する。
5. 対応環境でService Workerを登録し、オフライン準備状態を表示する。

初期教材の再配信で利用者の教材や履歴を上書きしない。必要な教材がない初回オフライン時には、準備に接続が必要であることと再試行操作を表示する。

## オフラインと通信

- アプリシェルと同梱教材を事前キャッシュする。同梱音声がある場合はその準備状態も管理する。
- 取り込み教材・音声BlobはIndexedDBに保存する。
- 全必要資産と初期教材の保存完了後に「オフライン利用可能」と表示する。
- 学習中の新バージョン検出は通知し、利用者が安全な時点で再読み込みする。
- Cache Storageの旧資産削除とIndexedDBのデータ削除を混同しない。
- HTTPSまたはlocalhostが必要。`file://`によるHTML直開きはサポート対象外。
- 外部ネットワーク取得を禁止する設計とし、可能なら配信設定/CSPも併用する。E2Eでは同一origin以外のHTTP通信がないことを確認する。
- Web Speech APIはクラウド実装を使う可能性があるため採用しない。音声はHTMLAudioElementとローカルBlob/同梱ファイルで再生する。

## 障害・排他

保存成功を確認してから完了画面へ遷移する。QuotaExceededError、DB利用不可、移行失敗では原因と再試行・バックアップ導線を出す。黙ってメモリ保存に切り替えて永続化したと扱わない。

複数タブではDBの現在値をトランザクション内で読み直し、取り込みプレビューが古くなった場合は再プレビューを要求する。回答は一意のsubmissionIdで重複登録を防ぐ。DBバージョン変更時は別タブを閉じる案内を表示する。
