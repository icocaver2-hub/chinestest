# データモデル・保存・バックアップ

## 保存先とバージョン

DB名は`chinese-conversation-study`、初期DBバージョンは1。DBバージョン、教材のschemaVersion、各項目のrevision、バックアップのbackupVersionは独立して管理する。

| ストア | 主キー | 内容・主な索引 |
| --- | --- | --- |
| packs | packId | title、importedAt、bundled/importedの区分 |
| scenarios | id | 現在有効なシーン。ownerPackId、revision、教材本文 |
| scenarioVersions | [id, revision] | 過去を含むシーン本文。会話履歴から参照 |
| questions | id | 現在有効な問題。ownerPackId、revision、scenarioId、type、level |
| questionVersions | [id, revision] | 過去を含む問題本文。回答履歴から参照 |
| attempts | submissionId | questionId、revision、sessionId、occurredAt、studyDate、timeZone、回答、result、mode |
| questionStates | [questionId, revision] | 06の学習状態。nextReviewDateに索引 |
| conversationAttempts | submissionId | scenarioId、revision、turnId、日時、学習日、自己評価 |
| bookmarks | [targetType, targetId] | question/scenarioとID、作成日時 |
| sessions | sessionId | キュー、問題revision、現在位置、保存済み回答ID、再挑戦キュー、状態 |
| audioAssets | [packId, audioId] | MIME、byteLength、SHA-256、Blob |
| importLogs | id | 日時、packId、ファイル名、追加/更新/スキップ件数 |
| settings | key | dailyQuestionCount、showPinyin、showTranslation、studyTimeZone |
| meta | key | DB状態、教材世代番号、初期化済み情報 |

日時はISO 8601 UTCで保存し、学習日は設定タイムゾーンから生成する。設定変更後も既存履歴の日付と復習予定日は変えない。学習状態は現在revisionのものを表示し、履歴画面では旧revisionを明示できるようにする。

回答のresultは`correct | incorrect`、modeは`normal | immediate_retry`。回答値は選択式なら選択肢ID（string）、並べ替えならトークンIDの配列、穴埋めなら入力文字列。自己評価は`said | hesitated | could_not_say`。自動採点と自己評価を同じ数値の正答率に混ぜない。

sessionには起点（today/practice/review）、開始日時、現在の問題IDとrevision、状態（active/completed/invalidated）を持たせる。questionStatesの初期値は件数0、日数0、mastered=false、日時・結果・復習日・加点日・不正解日はnull。実装時にこの構造をTypeScript型とバックアップスキーマに反映する。

## 教材更新

IDは全パックで一意。ownerPackIdが異なる既存IDとの衝突はエラーとし、他のパックを上書きしない。

- 新規ID: 現在版と履歴版を登録。
- 同じID・同じrevision・同じ本文: スキップ。
- 同じID・同じrevision・異なる本文: エラー。
- 大きいrevision: 旧版を保持し、新版を現在版にする。問題の学習状態は新規作成する。
- 小さいrevision: 古い項目としてスキップし、件数を表示。
- ファイルに含まれない既存項目: 保持する。取り込みを暗黙の削除として扱わない。

本文の比較はJSONオブジェクトのキー順を無視し、配列順は維持する。欠落とnullを同一視しない。音声内容も同一性検査の対象とする。

ブックマークはID単位で新版に引き継ぐ。シーンだけの更新では関連問題の学習状態をリセットしない。参照関係は取り込み適用後の全体に対して検査する。

取り込みプレビュー時の教材世代番号を記録する。適用直前に番号が変わっていたら再プレビュー。検査・ファイル読み込みは先に完了させ、書き込みトランザクションの途中でネットワークやファイル読み込みを待たない。

## 回答保存

submissionIdで二重送信を防ぐ。履歴追加、学習状態更新、セッション位置更新を1トランザクションに含める。保存失敗時は回答を失わず再試行できるようにする。

問題更新があった場合は未完了セッションを終了扱いにして新規開始を促す。旧問題の回答履歴はそのrevisionの本文で表示する。

## バックアップ形式

初期版は1つのUTF-8 JSONファイルで書き出す。名称例は`chinese-study-backup-20261023.json`。

```json
{
  "backupVersion": 1,
  "exportedAt": "2026-10-23T00:00:00Z",
  "data": {
    "packs": [],
    "scenarios": [],
    "scenarioVersions": [],
    "questions": [],
    "questionVersions": [],
    "attempts": [],
    "questionStates": [],
    "conversationAttempts": [],
    "bookmarks": [],
    "sessions": [],
    "audioAssets": [],
    "importLogs": [],
    "settings": []
  }
}
```

上記は構造説明であり、完全な復元用サンプルではない。実装時には各ストアの型を反映したバックアップ用スキーマも作る。audioAssetsはBlobを`base64`文字列に変換し、packId、audioId、mimeType、byteLength、sha256を含める。metaなど実行環境依存の内部情報は復元時に再作成する。初期教材の登録済み判定はmetaではなくpacksストアの内容で行い、復元後に初期教材を重複登録しない。

アプリ資産のキャッシュはバックアップに含めない。初期版のファイル上限は200MiB、音声の復号後合計は100MiB。超過を事前に説明し、不完全なバックアップを成功として出力しない。拡張が必要になった時点でZIP等の新しい形式を検討する。

## 復元

バックアップ種別・版、全項目の型、ID重複、revision参照、外部キー、履歴の正誤値、音声サイズ・ハッシュなどを検査する。不明な版は拒否し、可能な対応版を表示する。

全検査と音声Blobへの変換後、件数プレビューと利用者の実行操作を経て、全対象ストアを1トランザクションで置き換える。途中失敗時はロールバックし元のデータを残す。DBを先に削除してから再作成する手順にしない。

復元はマージではなく置き換え。復元前の書き出しボタンを置く。正常復元後、画面のキャッシュ/選択状態を再読み込みする。外部ファイルからプログラム、Service Worker、アプリコードを復元しない。
