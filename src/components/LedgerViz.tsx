"use client";

import { type AccountName, categoryOf } from "@/engine/accounts";
import { type Entry, sumAmounts } from "@/engine/journal";
import { statements } from "@/engine/ledger";
import { CATEGORY_BG, fmt } from "./ui";

interface Block {
  key: string;
  label: string;
  amount: number;
  bg: string;
}

const HEIGHT = 200;

function Column({ blocks, scale, highlight }: { blocks: Block[]; scale: number; highlight: Set<string> }) {
  return (
    <div className="flex flex-1 flex-col justify-end">
      {blocks.map((b) => {
        const h = Math.max(18, b.amount * scale);
        const lit = highlight.has(b.key);
        return (
          <div
            key={b.key}
            style={{ height: h }}
            className={`${b.bg} flex items-center justify-between overflow-hidden border border-black/40 px-1.5 text-[11px] leading-none transition-all duration-500 ${
              lit ? "relative z-10 outline-2 outline-gold" : ""
            }`}
          >
            <span className="truncate">{b.label}</span>
            {h >= 18 && <span className="ml-1 tabular-nums">{fmt(b.amount)}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** 期中の貸借対照表と損益計算書をブロックの高さで見せる */
export function LedgerViz({ entries, highlight = [] }: { entries: Entry[]; highlight?: AccountName[] }) {
  const s = statements(entries);
  const lit = new Set<string>(highlight);
  const toBlocks = (xs: { account: AccountName; amount: number }[]): Block[] =>
    xs.map((x) => ({ key: x.account, label: x.account, amount: x.amount, bg: CATEGORY_BG[categoryOf(x.account)] }));

  const profit = s.netIncome;
  // 利益は純資産側（右）、損失はT字の左側に置いて、左右の合計をそろえる
  const profitBlock = (key: string): Block[] =>
    profit > 0 ? [{ key, label: "当期純利益", amount: profit, bg: "bg-equity/70" }] : [];
  const lossBlock = (key: string): Block[] =>
    profit < 0 ? [{ key, label: "当期純損失", amount: -profit, bg: "bg-ng/40" }] : [];

  const bsLeftBlocks = [...toBlocks(s.assets), ...lossBlock("bs-loss")];
  const bsRightBlocks = [...toBlocks(s.liabilities), ...toBlocks(s.equity), ...profitBlock("bs-profit")];
  const plLeft = [...toBlocks(s.expenses), ...profitBlock("pl-profit")];
  const plRight = [...toBlocks(s.revenues), ...lossBlock("pl-loss")];

  const bsTotal = sumAmounts(bsLeftBlocks);
  const plTotal = sumAmounts(plLeft);
  const bsScale = bsTotal > 0 ? HEIGHT / bsTotal : 0;
  const plScale = plTotal > 0 ? HEIGHT / plTotal : 0;

  if (entries.length === 0) {
    return <p className="text-sm text-dim">まだ帳簿は白紙じゃ。最初の仕訳をすると、ここに店の姿が現れる。</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <figure>
        <figcaption className="mb-1 flex justify-between text-xs">
          <span className="text-gold">貸借対照表（いまの財産）</span>
        </figcaption>
        <div className="flex gap-1" style={{ minHeight: HEIGHT }}>
          <Column blocks={bsLeftBlocks} scale={bsScale} highlight={lit} />
          <Column blocks={bsRightBlocks} scale={bsScale} highlight={lit} />
        </div>
        <div className="mt-1 flex text-[10px] text-dim">
          <span className="flex-1">資産 {fmt(sumAmounts(s.assets))}</span>
          <span className="flex-1">負債＋純資産</span>
        </div>
      </figure>
      <figure>
        <figcaption className="mb-1 text-xs text-gold">損益計算書（今期のもうけ）</figcaption>
        <div className="flex gap-1" style={{ minHeight: HEIGHT * 0.8 }}>
          <Column blocks={plLeft} scale={plScale * 0.8} highlight={lit} />
          <Column blocks={plRight} scale={plScale * 0.8} highlight={lit} />
        </div>
        <div className="mt-1 flex text-[10px] text-dim">
          <span className="flex-1">費用＋利益</span>
          <span className="flex-1">収益</span>
        </div>
        <p className={`mt-1 text-sm ${profit >= 0 ? "text-ok" : "text-ng"}`}>
          {profit >= 0 ? "当期純利益" : "当期純損失"} {fmt(Math.abs(profit))}円
        </p>
        {profit < 0 && <p className="text-[11px] text-dim">※売れ残った商品の仕入も費用に入っているため。決算で調整する。</p>}
      </figure>
    </div>
  );
}
