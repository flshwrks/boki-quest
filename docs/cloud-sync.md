# PC・スマホ間のセーブ同期の仕組み

ボキクエのセーブ同期の設計メモ。ほかのプロジェクトに流用できるよう、仕組み・判断理由・コード・既知の制約をまとめる。

## 1. 全体像

- **ローカルファースト**：遊んでいる間は端末の `localStorage` に保存し続ける。ネットワークがなくても遊べる。
- **クラウドは1枠だけのセーブスロット**：Upstash Redis（Vercel Marketplace 経由）に、圧縮したセーブ1件と、その版番号（revision）を置く。
- **認証は合言葉（共有シークレット）**：利用者は本人1人だけという前提。アカウントは作らない。
- **楽観的排他制御（optimistic concurrency）**：端末は「どの版をもとに進めたか（base）」を送る。サーバーは、それより新しい版がすでにあれば上書きせずに 409 を返す。
- **端末側での突き合わせ（reconcile）**：起動時・タブに戻ったとき・409 のときに、クラウドの版と「この端末が最後にクラウドとそろえた版」を比べ、次の3つから決める。
  - この端末で続ける
  - クラウドに合わせる
  - 両方で進めて分かれたので、利用者に選んでもらう

```
┌──────── 端末（PC・スマホ） ────────┐                     ┌──── Vercel ────┐      ┌─ Upstash Redis ─┐
│ React state ──400ms──▶ localStorage │                     │ /api/save      │      │ boki-quest:save    │ gzip+base64
│      │                               │  GET  (x-passcode)  │  GET  → mget   │ ───▶ │ boki-quest:save:at │ 版（サーバー時刻）
│      └─区切りの場面で─▶ pushCloud ───┼──── PUT {base,data}▶│  PUT  → CAS    │      └───────────────────┘
│ cloud-base {rev, progress} ◀─────────┼──── {savedAt} ◀─────│  409 if newer  │
└──────────────────────────────────────┘                     └────────────────┘
```

## 2. サーバー側（Next.js Route Handler）

`src/app/api/save/route.ts`

- 環境変数：`BOKI_PASSCODE`（合言葉）、`KV_REST_API_URL`・`KV_REST_API_TOKEN`（Upstash。Marketplace で接続すると自動で入る）
- Redis のキー：
  - `boki-quest:save`：セーブ本体（端末で gzip した文字列。サーバーは中身を解釈しない）
  - `boki-quest:save:at`：版番号（保存したときのサーバー時刻、ミリ秒）
- 上限：`MAX_BYTES = 900_000`（Upstash の1リクエスト1MBに余裕を持たせる）

```ts
// 合言葉の照合。一致する位置から推測されないよう、一定時間で比べる
function authorized(req: Request): boolean {
  const expected = process.env.BOKI_PASSCODE;
  const given = req.headers.get("x-passcode");
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) return unauthorized();
  const [data, savedAt] = await getRedis().mget<[string | null, number | null]>(KEY, KEY_AT);
  return Response.json({ savedAt: savedAt ?? 0, data });
}

// base は、その端末が最後に読み書きしたときの版。それより新しい版があれば 409
export async function PUT(req: Request) {
  if (!authorized(req)) return unauthorized();
  const body = (await req.json()) as { base?: unknown; data?: unknown };
  if (typeof body.base !== "number" || typeof body.data !== "string" || body.data.length > MAX_BYTES) {
    return Response.json({ error: "セーブの形式が正しくありません" }, { status: 400 });
  }
  const current = (await getRedis().get<number>(KEY_AT)) ?? 0;
  if (current > body.base) return Response.json({ savedAt: current }, { status: 409 });
  // 版はサーバーの時刻で付ける（端末ごとの時計のずれに左右されない）。単調増加を保証する
  const savedAt = Math.max(Date.now(), current + 1);
  await getRedis().mset({ [KEY]: body.data, [KEY_AT]: savedAt });
  return Response.json({ savedAt });
}
```

ポイント：

- **版はサーバー時刻**で付ける。端末の時計は信用しない。`current + 1` との max で単調増加にする。
- Redis クライアントは遅延初期化にする（`redis ??= new Redis(...)`）。ビルド時に環境変数がなくても落ちない。

## 3. 端末側

### 3.1 端末内の保存

- state が変わるたびに 400ms のデバウンスで `localStorage` に保存し、`pagehide` で必ず書き出す。
- `localStorage` のアクセスはすべて try/catch で包む（プライベートモードなどで例外になるため）。
- 端末の保存時刻（`savedAt`）も記録するが、**同期の判定には使わない**（理由は §5）。

### 3.2 クラウドへの書き込み（区切りの場面だけ）

- 1操作ごとには送らない。一日の始まり・終わり、月末、昇格、試験の採点などの区切り（checkpoint）が変わったときだけ、1秒のデバウンスで PUT する。
- 本体は `CompressionStream("gzip")` で圧縮して base64 にする。日本語の多い JSON が数分の1になる。

```ts
async function pack(state: GameState): Promise<string> {
  const stream = new Blob([JSON.stringify(state)]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
```

### 3.3 「最後にそろえた版」（CloudBase）

端末の `localStorage`（`boki-quest-cloud-base`）に、次の2つを持つ。

- `rev`：この端末のセーブが、クラウドのどの版から進めたものか
- `progress`：そろえた時点の進み具合の目印

```ts
export interface CloudBase { rev: number; progress: string }

/** 進み具合の目印：日付・記帳の数・正誤の記録の数がすべて同じなら、同じところまで進んでいる */
export const progressOf = (s: GameState) => `${s.day}:${s.journal.length}:${s.practice.length}`;
```

更新するタイミング：

| できごと | CloudBase |
|---|---|
| PUT が成功 | `{ rev: 返ってきた savedAt, progress: progressOf(送った state) }` |
| クラウドのセーブに合わせた | `{ rev: クラウドの版, progress: progressOf(クラウドの state) }` |
| 分かれたときに「この端末」を選んだ | `{ rev: クラウドの版, progress: "" }` → 直後に PUT して上書き |

`progress` は、目的に合わせて「単調に増える進捗の指標」を選ぶ。ゲームなら日付と記録件数、ドキュメントなら編集回数などが使える。

### 3.4 突き合わせ（reconcile）

```ts
/**
 * local：クラウドがこの端末の元の版のまま（または空）
 * remote：この端末はそろえたあと進めていない
 * ask：両方で進めて分かれた
 */
export function reconcile(local: GameState | null, remote: GameState | null, rev: number, base: CloudBase): "local" | "remote" | "ask" {
  if (!remote) return "local";
  if (!local) return "remote";
  if (rev === base.rev) return "local"; // クラウドは自分がそろえた版のまま → 自分のほうが新しいか同じ
  const here = progressOf(local);
  if (here === base.progress || here === progressOf(remote)) return "remote"; // 自分は進めていない／中身が同じ
  return "ask"; // 両方で進めた
}
```

呼ぶタイミング：

1. **起動時**：合言葉があれば GET → reconcile。確認が終わるまで「つづきから」は押せない（古いセーブで始めさせない）。
2. **タブに戻ったとき**：`visibilitychange` で `visible` になったら GET → reconcile。PCのタブを開いたままスマホで遊んだ、というケースを拾う。React 19 の `useEffectEvent` でハンドラーを登録している。
3. **PUT が 409**：別の端末が先に保存していたので、その場で GET → reconcile。

結果ごとの動き：

- `local`：何もしない。次の区切りで PUT すれば base が一致するので通る。
- `remote`：クラウドのセーブを端末に保存して CloudBase を更新する。遊んでいる途中なら、その状態に切り替える。
- `ask`：タイトル画面に戻し、「この端末のセーブ」「クラウドのセーブ」を進み具合（日付・Lv・記帳数）と並べて選ばせる。先まで進んでいる方を強調し、選ばなかった方は消える。

## 4. セーブの形式の移行

- セーブに `version` を持たせる。`MIGRATIONS[version]` を古い版から順に当てて、今の形式にする。
- 後から増えた項目は、`initialState()` の値で埋める（`{ ...base, ...saved }`）。
- 意味の変わった項目（たとえば「開業日」が後から増えた）は、移行関数の中でデータを作り直す。
- クラウドから読んだセーブも、同じ `parse → migrate` を通す。古い端末が書いたセーブも読める。

## 5. 失敗から学んだこと

- **端末の保存時刻で新しさを比べてはいけない。** 最初は「端末の savedAt とクラウドの版の新しい方」で選んでいた。しかし端末の savedAt は操作のたびに更新される。そのため、進み具合の遅れた端末で少し触るだけで「こちらが新しい」と判定され、次の区切りで、進んだ端末のセーブを上書きしかけた。
  - 対策：「最後にそろえた版」と「そのときの進み具合」で、**どちらが進めたか**を判定する。
- **409 は表示だけで終わらせない。** 以前は小さな「☁!」が出るだけで、利用者が気づかないまま古い端末で遊び続けていた。409 を受けたら、すぐに突き合わせ直す。
- **開いたままのタブ**は起動時の確認を通らない。`visibilitychange` での確認が必要。
- 移行直後は、どの端末にも CloudBase がない（rev 0）。そのため、進み具合が違えば一度だけ選択画面が出る。これは仕様として許容した。

## 6. 既知の制約・改善の余地

- **PUT の比較と書き込みがアトミックでない**：`get(KEY_AT)` と `mset` の間に別の PUT が入ると、両方が通る可能性がある。利用者1人・区切りでしか書かないので実害は小さい。厳密にするなら、Lua スクリプト（`EVAL`）で「版を比べて、同じなら書く」を1回で行う。

  ```lua
  -- KEYS[1]=save, KEYS[2]=save:at, ARGV[1]=base, ARGV[2]=data, ARGV[3]=now
  local cur = tonumber(redis.call('GET', KEYS[2]) or '0')
  if cur > tonumber(ARGV[1]) then return {409, cur} end
  local at = math.max(tonumber(ARGV[3]), cur + 1)
  redis.call('MSET', KEYS[1], ARGV[2], KEYS[2], at)
  return {200, at}
  ```

- **セーブ枠は1つだけ**：複数人で使うなら、合言葉ではなく本当の認証を入れ、キーを利用者ごとに分ける。
- **合言葉は共有シークレット**：漏れたら環境変数を変えるしかない。総当たり対策が要るなら、`@upstash/ratelimit` で GET/PUT に回数制限をかける。
- **差分ではなく全体を送る**：セーブが1MBに近づいたら、記録の古い部分を要約するか、キーを分ける。
- **どちらかを選ぶだけで、マージはしない**：分かれたら片方を捨てる。中身をマージできるデータなら、CRDT などを検討する。

## 7. 流用するときのチェックリスト

1. Vercel Marketplace で Upstash Redis を接続する（`KV_REST_API_URL` / `KV_REST_API_TOKEN` が入る）。
2. 合言葉を `vercel env add` で入れ、ローカルは `.env.local` に置く（`.gitignore` 済みか確認する）。
3. Route Handler（§2）をコピーし、キー名と `MAX_BYTES` を変える。
4. 端末側：`pack`/`unpack`、`fetchCloud`/`pushCloud`、`CloudBase`、`progressOf`、`reconcile` を用意する（`src/game/save.ts`）。
5. アプリ側：起動時・`visibilitychange`・409 のときに突き合わせ、区切りの場面で PUT する。`ask` のときは選択画面を出す（`src/components/GameApp.tsx`）。
6. `progressOf` は、そのアプリで単調に増える指標に置き換える。
7. reconcile の4パターン（local／remote／ask／どちらかが空）をテストする（`src/game/save.test.ts` を参照）。
