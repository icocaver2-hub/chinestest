# 教材JSON契約 v1

この文書が教材入力形式の正本。実装時に`schemas/content-pack.schema.json`（JSON Schema Draft 2020-12）を作り、UIとテストで共用する。未知のフィールドはエラーにする。将来拡張はschemaVersionを上げる。

## 共通ルール

- UTF-8 JSONオブジェクト。Markdownコードフェンス付きの文章は入力ファイルとして受け付けない。
- ID: `^[a-z0-9][a-z0-9_-]{0,79}$`。数字のrevisionは1以上の整数。
- 通常文字列は前後の空白を除いて空でないこと。教材検査で勝手に本文を改変せず、問題箇所を示す。
- levelは`beginner | elementary | intermediate`。検定の級とは別の教材内分類。
- 中国語は簡体字、ピンインは声調記号付き、訳・解説は日本語。
- 任意項目は未指定ならキーを省略する。nullは受け付けない。
- 文字列はプレーンテキスト。HTMLとして解釈しない。
- 上限: JSON 5MiB、1回の取り込みでシーン100件・問題1,000件、通常の文字列は1〜4,000文字、titleは1〜120文字。

## パック

| キー | 型 | 必須 | 意味 |
| --- | --- | --- | --- |
| schemaVersion | integer（1） | ○ | 教材形式の版 |
| packId | ID | ○ | パックの識別子 |
| title | string | ○ | 名称 |
| scenarios | Scenario[] | ○ | シーン追加/更新。空配列可 |
| questions | Question[] | ○ | 問題追加/更新。空配列可 |
| audioAssets | AudioAssetDeclaration[] | 任意 | 今回取り込む音声ファイル |

scenariosとquestionsの両方が空のパックは拒否する。音声だけの更新でも参照元のシーン/問題のrevisionを増やす。

## Scenario

必須: `id`, `revision`, `category`, `title`, `level`, `situation`, `goal`, `turns`, `phrases`, `substitutions`, `notes`。

- category: `first_meeting | visit | meal | daily | care | relationship | marriage | future | repair`。
- situation/goal: 場面説明と会話の到達目標（string）。
- turns: 2〜30件。各要素は`id`（シーン内で一意）、`speaker`（string）、`role`（`learner | partner`）、`zh`、`pinyin`、`ja`、任意の`audioId`。少なくとも各roleが1件ずつ必要。
- phrases: 1〜30件。各要素は`zh`, `pinyin`, `ja`, `note`（すべてstring）。
- substitutions: 0〜30件。各要素は`zh`, `pinyin`, `ja`（すべてstring）。実際に使える置き換え済みの文にする。
- notes: string[]、0〜20件。

会話練習ではrole=learnerの発言を隠して返答を考え、例を開いて自己評価する。参照音声の探索範囲はシーンのownerPackId内。

## Question共通

必須: `id`, `revision`, `type`, `scenarioId`, `level`, `tags`, `prompt`, `explanation`, `pinyin`, `translation`。

- scenarioIdは既存または同時取り込みのシーンID。
- tagsは1〜10件の重複のないstring（各1〜40文字）。
- promptは設問。正解となる中国語文のピンインと日本語訳をpinyin/translationに記載する。
- explanationは日本語解説。
- 任意のaudioIdを指定可能。問題のownerPackId内の音声を参照する。
- 任意のpresentationは`text | listening`、省略時text。listeningにはaudioIdを必須とする。
- listeningではpromptに音声の全文や正解を載せない。音声の中国語本文は任意の`transcript`に記載し、listeningでは必須、回答後だけ表示する。

### single_choice

typeは`single_choice`。追加必須項目は`choices`（2〜6件、各`id`と`text`）、`answerId`。選択肢IDは問題内で一意。answerIdは必ず1つの選択肢を指す。解答は選択肢IDで保存する。

### ordering

typeは`ordering`。追加必須項目は`tokens`（2〜20件、各`id`と`text`）、`acceptedOrders`（1件以上のID配列）。各正解順序は全トークンIDを各1回ずつ使用する。意味上の別解がある場合は追加する。同じ文字のタイルは同一文字列として扱い、同一語のタイルID入れ替えだけを理由に誤答にしない。

比較はトークンのtextの配列で行い、単語境界を残す。単純な全文連結による採点はしない。UIは開始時にタイル順をシャッフルするが、IDを変えない。

### fill_blank

typeは`fill_blank`。追加必須項目は`sentence`（空欄を`{{blank}}`で1か所だけ指定）、`acceptedAnswers`（1〜20件のstring）。promptは指示、sentenceは穴埋め対象。採点対象は空欄への回答のみ。

採点時は双方にUnicode NFC、前後空白除去、連続空白の1つへの圧縮、全角英数字→半角を適用する。末尾の`。.!！?？`のみ除去して比較する。声調、簡体字/繁体字、語順、内部の句読点を自動同一視しない。許容する表現はacceptedAnswersに明記する。

## 音声

音声なしのJSONだけでも取り込める。音声付きではJSONと音声ファイルを同じ画面で選択する。宣言は以下の項目を持つ。

| キー | 型 | 内容 |
| --- | --- | --- |
| id | ID | パック内で一意 |
| fileName | string | 同時選択ファイルのベース名。パス・URL不可 |
| mimeType | enum | audio/mpeg, audio/wav, audio/ogg, audio/mp4 |
| source | string | 自作録音、配布元などの出典説明 |
| license | string | 利用権限・ライセンスの説明 |

音声1件10MiB、1回の追加合計50MiB、保存済み全音声100MiBを上限とする。ファイル名のパストラバーサル・重複・宣言外ファイルを拒否する。拡張子/MIME/ヘッダーの不整合も検査し、実際の再生可否をプレビューで確認できるようにする。

同じaudioIdで内容が異なる場合はエラー。音声差し替えは新しいaudioIdを使い、参照元revisionを上げる。SHA-256はアプリがファイル内容から計算する。生成プロンプトに架空の音声ファイルやハッシュを作らせない。

パック内の既存音声は宣言を省略して参照できる。参照音声が保存済みでも同梱でもなく、同時選択もされていなければ取り込み全体を拒否する。

## 検査順序

1. ファイルサイズ、UTF-8 JSONとしての解析。
2. schemaVersion、型、必須項目、enum、長さ、未知キー。
3. ID重複、正解参照、並べ替えの順序、空欄数。
4. ownerPackId、revision、既存との比較。
5. 適用後のシーン/音声参照と音声ファイル。
6. 差分プレビュー、利用者の取り込み操作、トランザクションで保存。

検査は中国語の文法的正しさを保証しない。プレビューで内容を確認し、不自然な教材は修正してrevisionを上げる。

## 例

完全な小型サンプルは[starter-pack.json](../examples/starter-pack.json)。1シーンに3形式を1問ずつ含む。サンプルは音声なし。初期教材の必要件数・内容は[会話教材計画](10_SCENARIO_CONTENT.md)を参照する。
