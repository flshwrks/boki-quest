# ボキクエ 〜道具屋の帳簿〜

道具屋を経営しながら、日商簿記3級を身につけるWebゲーム。

- 公開版：https://boki-quest-ebon.vercel.app
- 仕様：[SPEC.md](SPEC.md)、出題範囲の対照表：[COVERAGE.md](COVERAGE.md)
- PC・スマホ間のセーブ同期：[docs/cloud-sync.md](docs/cloud-sync.md)
- 改修の履歴：[improvement_list/](improvement_list/)

## 技術構成

Next.js 16（App Router）・React 19・TypeScript・Tailwind CSS 4・Vitest。クラウド保存は Upstash Redis（Vercel Marketplace）。

```
src/engine/   仕訳エンジン（勘定科目・貸借の判定・帳簿の集計）
src/content/  講義・取引イベント・問題集・世界設定
src/game/     ゲームの進行（純粋関数）・セーブ・復習の予定組み
src/components/ 画面
```

## 開発

```bash
npm install
npm run dev        # http://localhost:3000
npx vitest run     # テスト
npm run build
```

クラウド保存を使うには `.env.local` に `BOKI_PASSCODE`・`KV_REST_API_URL`・`KV_REST_API_TOKEN` を設定する（コミットしない）。
