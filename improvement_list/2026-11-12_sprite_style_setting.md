# キャラクターの絵を、細かい絵と前の粗い絵から選べるようにする

ブランチ：`sprite-hires`（master には未反映。ユーザーの確認待ち）
前の段階：`2026-11-11_sprites_32px_all_more_frames.md`

## 対象

- `src/content/sprites.ts`（絵のそろい `SpriteSet`・`FINE`・`poser` に整理）
- `src/content/spritesClassic.ts`（新規：前の 16×16 の絵とコマ `CLASSIC`）
- `src/components/spriteStyle.ts`（新規：選んだ絵を覚える）
- `src/components/Sprite.tsx`・`src/components/Scene.tsx`・`src/components/ui.tsx`・`src/components/GameApp.tsx`
- `src/content/world.ts`（妖精のきらめきの色 `y` を戻した）
- `src/app/globals.css`（前の粗い絵の動き）
- `src/app/sprites/page.tsx`（確認ページでも切り替えられる）
- `src/content/sprites.test.ts`（新規）

## 変更内容

- タイトル画面の下に「キャラクターの絵：細かい絵／前の粗い絵」を足した。選ぶとその場で切り替わり、この端末に覚える
  （`localStorage` の `boki-quest-sprites`。音や入力方法の設定と同じ扱いで、クラウドには保存しない）。初期値は細かい絵。
- 前の粗い絵は master の絵・コマ・動きをそのまま持ってきた。
  - 絵とコマ：`spritesClassic.ts`。コマの名前は新しい名前の1コマ目に合わせた（`walk1`・`crouch1`・`jump1`・`talk1`・`think1`・`sleep1`・`oops1`）。
  - コマの並び：`Scene.tsx` の `CLIP_SETS.classic`（`CLIPS`・`ENTER` は `CLIP_SETS` にまとめた）。
  - 体ごとの動き：`globals.css` の `.sprites-classic` の中（跳ねる・首をかしげる・うとうと・歩いてくる 0.45秒）。
    `Scene` が、前の粗い絵のときだけこのクラスをつける。
  - 待機は息づかいではなく、前と同じく体ごと上下に浮く。
- `Sprite` は「絵のそろい」（`SpriteSet`：ポーズの絵・まばたき・羽ばたき・息づかい・口の位置）だけを見て描く。
  そろいを足せば、絵の種類を増やせる。
- テスト：どちらのそろいでも、全キャラクター・全コマで大きさがそろい、パレットにない色を使っていないこと。

## 理由

「設定か何かから、現行の粗いバージョンと新しいバージョンを選べるように。前のやつも選択できるように」という要望。

## 前とちがうところ（前の粗い絵を選んだとき）

- 顔の大きさは、細かい絵に合わせて直した値のまま（48・64・96 など。前は 44・56・72・88）。
- 体ごとの動き（跳ねる・震える）は、歩き終えてから始まる（前は歩いている間に始まっていた）。

## 確認したこと

- `npx tsc --noEmit`：エラーなし
- `npm test`：9ファイル・126件すべて成功
- Chrome で `/sprites` とタイトル画面を表示：切り替えるとその場で絵が変わり、再読み込みしても選択が残る。コンソールのエラーなし。
  確認のあと、選択は「細かい絵」に戻した
- 動きのなめらかさ・速さは静止画でしか見ていない（前回と同じく、確認用の Chrome は描画が進みにくい）

## 残作業

- ユーザーの OK のあと master に入れる（デプロイは指示があってから）
- OK のあとに消すもの：`src/app/sprites/`、`Scene.tsx` の `CLIP_SETS`・`Clip`・`ClipSet` の export
- 「一ひねり」の案（人を1人ずつ描き分ける、キャラクターごとの決めポーズ、など）は、ユーザーが選んでから着手する
