# 宝探しイベントアプリ 仕様書・設計書（React + Firebase）

最終更新: 2025-10-14 / 作成者: あなた（イベント実行委員）

---

## 1. 目的・概要

* **目的**: 寮内イベント「宝探し（謎解き）」の運営を、リアルタイムな得点集計とランキング表示で円滑に実施する。
* **要点**

  * 問題用紙から場所を特定 → 現地の宝箱 → **QRコード**読取 & **合言葉**入力で得点。
  * **チーム単位**で参加（リーダーのみユーザ登録）。
  * 問題（=ロケーション）ごとに**難易度/点数**を設定。
  * ランキング**リアルタイム更新**、終了前は**凍結（freeze）**。
  * 偶然発見や不正（横流し・改ざん）**抑止**。

---

## 2. 用語

* **Location（ロケーション）**: 宝箱設置場所（`location_i`）。
* **箱キーワード**: 宝箱に印刷/掲示する固定文字列（例: `AKAGANE`）。
* **TeamTag**: チーム固有タグ（`sha256(teamId)` 先頭5文字など）。
* **署名付きQR**: `locId|nonce|exp` を HMAC 署名したトークン入りのQR。
* **Freeze**: 公開順位表を非表示/更新停止する期間。

---

## 3. ステークホルダー・権限

| 役割          | 権限                                      |
| ----------- | --------------------------------------- |
| 参加チーム（リーダー） | ログイン、QR読取、提出（claim）、自チーム履歴閲覧            |
| 管理者         | ロケーション管理、点数/難易度設定、QR発行、イベント時刻/凍結切替、最終集計 |
| 観覧者（未ログイン）  | 公開順位表閲覧（凍結時は非表示/マスク）                    |

---

## 4. ユースフロー（要約）

1. **事前**

   * 管理者がチームの**リーダーEmail**をホワイトリスト登録。
   * 管理者がロケーション（難易度・基礎点）を登録し、**署名付きQR**と**箱キーワード**を準備・印刷。
   * `eventStart / freezeAt / eventEnd` を設定。
2. **当日**

   * リーダーがメールリンクでログイン、**TeamTag**確認。
   * 謎を解いて現地へ → QR読取 → **合言葉 `箱キーワード-TeamTag`** 入力 → 送信（claim）。
   * 成功で得点反映。**公開順位表**がリアルタイム更新（freeze中は更新/表示停止）。
3. **終了**

   * `eventEnd` 到来で受付停止。凍結解除し**最終順位**公開。
   * 必要に応じてエクスポート。

---

## 5. 機能要件（FRD）

### 5.1 認証・招待

* リーダーのみ登録可（**メールリンク認証** + **ホワイトリスト**）。
* 認証後に `customClaims.role = "leader"` を付与。
* CSVでユーザーを一括登録可能（ヘッダー例: `email,uid,role,teamName,teamTag,matchId,groupId`）。

### 5.2 ロケーション管理（管理者）

* 作成/編集/無効化（`title, difficulty, basePoints, boxKeyword, isActive`）。
* **署名付きQR**生成（`locId|nonce|exp|signature`）とPNGダウンロード。
* 試合 (`matches`)・組 (`groups`) を編成し、開始/終了時刻・表示順・有効状態を管理。
* 各ロケーションには所属する試合 (`matchId`) を必須で紐付ける。
* CSVインポートで複数ロケーションを一括登録（ヘッダー: `title,boxKeyword,difficulty,basePoints,matchId,isActive`）。
  サンプル:
  * `図書室,LIBRO,1,100,match-1,true`
  * `屋上,SKYKEY,2,150,match-1,false`
* リーダー割当時にチームへ試合・組を設定（未割当チームはランキングで警告表示）。

### 5.3 提出（claim）

* 入力: `token`（QR）, `providedKeyword`, `providedTeamTag`。
* バリデーション:

  * 署名・有効期限・`locId` の検証。
  * `providedTeamTag === team.teamTag`。
  * `providedKeyword === locations[locId].boxKeyword`。
  * `locations[locId].matchId === team.matchId`（相違時は不正提出として拒否）。
  * チームが未解済（同一`locId`で二重加点禁止）。
* 成功時: スコア加算（`basePoints × 難易度係数`）、提出履歴保存。
* 凍結中は**公開順位表を更新しない**（内部スコアは更新）。

### 5.4 ランキング

* 公開: `leaderboard_public/runtime` を購読。
* 凍結中: **非表示**または**マスク**表示（「ラストスパート中」）。
* 試合→組セレクタで閲覧し、同一点数の場合は**組の開始時刻から最終提出までの経過時間が短いチームを優先**表示。
* 未割当にチームが存在する場合は管理者向け警告を表示。
* 終了後: 即時に確定順位公開。

### 5.5 残り時間

* `settings.runtime.eventStart / eventEnd / freezeAt` をリアルタイム監視し、残り時間を表示。

---

## 6. 非機能要件（NFR）

* **RT性**: claim反映は1–3秒以内（Firestore RT購読 + Functions差分更新）。
* **スケール**: 同時チーム数〜数十、提出頻度ピーク時でも安定。
* **耐不正**: 署名トークン/HMAC、TeamTag、二重提出防止、Rulesで直書き禁止。
* **可用性**: Firebase Hosting/Functions/Firestore 標準SLA準拠。
* **運用性**: 管理画面から freeze/解禁、ロケーション編集、エクスポート可。

---

## 7. アーキテクチャ

* **Frontend**: React(Vite) + `@zxing/browser`（QR読取）
* **Auth**: Firebase Authentication（Email link, customClaims）
* **DB**: Cloud Firestore（リアルタイム/トランザクション）
* **API**: Cloud Functions（Callable/HTTPS）
* **Hosting**: Firebase Hosting
* **Scheduler**: Cloud Scheduler（自動freeze/終了 切替に利用可）

---

## 8. データモデル（Firestore）

```
/matches/{matchId}
  name: string
  order: number
  isActive: boolean
  createdAt: Timestamp
  updatedAt: Timestamp

/groups/{groupId}
  matchId: string
  name: string
  order: number
  startAt: Timestamp | null
  endAt?: Timestamp | null
  isActive: boolean
  createdAt: Timestamp
  updatedAt: Timestamp

/teams/{teamId}
  name: string
  leaderEmail: string
  teamTag: string                // sha256(teamId).hex.slice(0,5)
  score: number
  matchId?: string | null
  matchName?: string | null
  groupId?: string | null
  groupName?: string | null
  solved: { [locId]: { at: Timestamp, points: number } }
  createdAt: Timestamp

/locations/{locId}
  matchId: string
  title: string
  difficulty: number             // 1〜5 の難易度スケール
  basePoints: number             // 例: 100, 150, 200
  boxKeyword: string             // 紙に印刷する固定キーワード
  isActive: boolean
  createdAt: Timestamp

/submissions/{autoId}
  teamId: string
  locId: string
  providedKeyword: string
  providedTeamTag: string
  ok: boolean
  reason?: string                // mismatch, duplicated, expired...
  at: Timestamp
  points?: number

/settings/runtime
  eventStart: Timestamp
  freezeAt: Timestamp
  eventEnd: Timestamp
  scoreboardVisible: boolean     // 管理UIで強制切替用
  updatedAt: Timestamp

/leaderboard_public/runtime
  schemaVersion: 2
  matches: Array<{
    id: string
    name: string
    order: number
    isActive: boolean
    groups: Array<{
      id: string
      name: string
      order: number
      startAt: Timestamp | null
      endAt?: Timestamp | null
      isActive: boolean
      entries: Array<{
        teamId: string
        teamName: string
        score: number
        lastSolveAt?: Timestamp | null
        elapsedSeconds?: number | null
        solvedCount?: number
      }>
    }>
  }>
  masked: boolean
  unassignedNotice: boolean
  updatedAt: Timestamp
```

**難易度係数（例）**

* EASY=1.0 / MEDIUM=1.5 / HARD=2.0
  **得点** = `basePoints × 係数`（小数点は四捨五入）

---

## 9. セキュリティ（Auth & Rules 概要）

### 9.1 認証

* ホワイトリスト（`/allowed_leaders/{emailHash}`）に存在するメールのみサインアップ許可。
* サインアップ後に管理用 Function が `customClaims.role="leader"` を付与。

### 9.2 Firestore Rules（サンプル）

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {

    function isLeader() {
      return request.auth != null && request.auth.token.role == "leader";
    }

    match /teams/{teamId} {
      allow read: if isLeader() && request.auth.uid == teamId;
      allow write: if false; // スコア等の更新は全てFunctions経由
    }

    match /locations/{locId} {
      allow read: if isLeader();  // 問題のメタ情報表示はOK
      allow write: if false;      // 管理操作はFunctions経由
    }

    match /submissions/{id} {
      allow read, write: if false; // 直接アクセス禁止
    }

    match /settings/{doc} {
      allow read: if true;         // 残り時間表示に必要
      allow write: if false;       // 管理はFunctions
    }

    match /leaderboard_public/{doc} {
      allow read: if true;
      allow write: if false;
    }
  }
}
```

---

## 10. QRトークン仕様（署名付き）

* **形式**: `token = base64url( locId + "." + nonce + "." + exp + "." + signature )`

  * `locId`: 文字列
  * `nonce`: ランダム文字列
  * `exp`: 期限（UNIX秒）
  * `signature = HMAC_SHA256(secret, locId + "|" + nonce + "|" + exp)` → base64url

* **検証**（Cloud Functions）

  1. `exp` ≥ 現在時刻、2) `HMAC`一致、3) `locId` 存在・有効、**不一致は拒否**。

* **QRに埋めるURL例**
  `https://your.app/claim?token=<base64url_string>`

---

## 11. API（Cloud Functions）

### 11.1 `POST /claim`（Callableでも可）

* **Auth**: 必須（`role=leader`）
* **Request**

  ```json
  {
    "token": "string",
    "providedKeyword": "string",
    "providedTeamTag": "string"
  }
  ```
* **Validation**

  * `token` 署名/期限/locId 検証
  * `providedTeamTag === team.teamTag`
  * `providedKeyword === locations[locId].boxKeyword`
  * 重複提出禁止（`teams/{teamId}.solved[locId]` の有無）
* **Response**

  ```json
  {
    "ok": true,
    "message": "accepted",
    "locId": "loc_01",
    "newScore": 350
  }
  ```

  失敗時:

  ```json
  { "ok": false, "message": "keyword mismatch" }
  ```
* **副作用**

  * トランザクションで `teams.score` 加算 & `teams.solved[locId]` 記録 & `submissions` 追加。
  * `freeze` 中は `leaderboard_public` を更新しない。

### 11.2 `POST /admin/generateQRTokens`

* **Auth**: 管理者のみ
* **機能**: `locations/*` を走査し、`nonce, exp, signature` を生成、管理UIに返却（QR表示/保存）。

### 11.3 `POST /admin/freeze` / `POST /admin/unfreeze`

* **Auth**: 管理者のみ
* **機能**: `settings.runtime.scoreboardVisible` / `leaderboard_public.runtime.frozen` を切替。

---

## 12. アルゴリズム断片（実装方針）

### 12.1 TeamTag 生成（Node/TS）

```ts
import { createHash } from 'crypto';
export const makeTeamTag = (teamId: string, len = 5) =>
  createHash('sha256').update(teamId).digest('hex').slice(0, len);
```

### 12.2 HMAC 署名（Node/TS）

```ts
import { createHmac } from 'crypto';

export function sign(locId: string, nonce: string, exp: number, secret: string) {
  const payload = `${locId}|${nonce}|${exp}`;
  return createHmac('sha256', secret).update(payload).digest('base64url');
}
```

---

## 13. 画面仕様（主要コンポーネント）

### 13.1 TeamDashboard

* 表示: 残り時間 / **TeamTag** / 自スコア / 提出履歴
* 入力: QRスキャン（locId自動入力） or locationプルダウン（フォールバック）
* 合言葉: `箱キーワード-TeamTag` の入力支援UI（自動補完/プレースホルダ）
* 送信: `/claim`
* バリデーション結果: 成功/失敗トースト表示

### 13.2 AdminDashboard

* ロケーションCRUD（難易度/点数/キーワード/有効化）
* 署名付きQR生成/プレビュー/PNG保存
* イベント時刻設定（start / freezeAt / end）
* 手動freeze/unfreeze, 最終集計

### 13.3 PublicScoreboard

* ランキングテーブル（`teamName / score / lastSolveAt`）
* 凍結中は非表示または「🔒 ラストスパート中」と文言表示

### 13.4 LoginScreen

* ホワイトリストメールのみメールリンクサインイン
* サインイン後、`role=leader` 未付与時は待機/再読込（付与関数が走る）

---

## 14. ディレクトリ構成（提案）

```
treasure-hunt-app/
├── src/
│   ├── components/
│   │   ├── TeamDashboard.tsx
│   │   ├── AdminDashboard.tsx
│   │   ├── PublicScoreboard.tsx
│   │   ├── LoginScreen.tsx
│   │   └── LoadingSpinner.tsx
│   ├── firebase/
│   │   ├── config.ts
│   │   └── rules.firestore (メモ)
│   ├── lib/
│   │   ├── claim.ts           // CF呼び出しラッパ
│   │   ├── time.ts            // freeze判定/残り時間
│   │   └── qr.ts              // 管理UIでのQR生成（展示用）
│   ├── App.jsx
│   └── main.jsx
├── functions/
│   ├── src/
│   │   ├── claim.ts
│   │   ├── admin.ts           // generateQRTokens / freeze など
│   │   └── auth.ts            // whitelist確認・customClaims付与
│   └── package.json
├── package.json
└── vite.config.js
```

---

## 15. 残り時間/凍結ロジック

* **表示**: `now` と `settings.runtime` を比較

  * `now < eventStart`: 「開始まで T-xx:xx」
  * `eventStart ≤ now < freezeAt`: カウントダウン & 順位表**表示**
  * `freezeAt ≤ now < eventEnd`: カウントダウン & 順位表**非表示/マスク**
  * `now ≥ eventEnd`: 「イベント終了」& 最終順位**公開**

---

## 16. エラーハンドリング・不正対策

* claim アクセス制御は**必ず Functions**で。
* 二重提出は `teams.solved[locId]` の存在確認 + **transaction** で保護。
* QR改ざん対策に**HMAC署名**。
* 横流し対策に**TeamTag必須**（キーワード単体では不可）。
* 連続スパム提出は**レート制限**（`functions:limits` + クライアント側デバウンス）。

---

## 17. テスト観点

* 招待メールが**ホワイトリスト外**で拒否される。
* `token` 期限切れ/署名不一致/loc無効の拒否。
* `keyword`/`teamTag` 不一致時の拒否。
* `freeze` 中、公開ランキングが**更新/表示されない**。
* イベント終了後、**最終順位が一致**。
* 二重提出が**0点不採用**でログに残る。

---

## 18. 運用手順（簡略）

1. 管理画面でチーム登録（メール）→ ホワイトリスト登録
2. ロケーション登録 → 署名QR出力・印刷、箱キーワード印刷
3. 時刻設定（start/freezeAt/end）
4. 当日運用（必要に応じてfreeze手動切替）
5. 終了 → 解禁 → 最終結果公開 → エクスポート

---

## 19. ロールアウト戦略

* **v1（簡易版）**: 署名なし `?loc=...` + `keyword-TeamTag`、手動freezeでも可
* **v2（堅牢版）**: 署名付きQR/HMAC、Scheduler自動freeze、差分更新の最適化

---

## 20. 受け入れ基準（例）

* 署名付きQR + 合言葉 + TeamTag で**不正横流しが実質無効**。
* 凍結期間に**公開順位が見えない**。
* 複数チーム同時提出でスコア整合性が崩れない（トランザクションOK）。
* モバイル端末でQR読取・入力が**3操作以内**で完了。
* 管理者が**10分以内**でロケーションとQRを一括準備可能。

---

## 付録：UIコピー（例）

* TeamDashboard: 「**合言葉は `箱に書かれたキーワード-あなたのTeamTag`**」
* 凍結中: 「🔒 ラストスパート中！順位は終了後に公開されます」

---
