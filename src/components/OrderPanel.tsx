"use client";

import { useState } from "react";
import { sumAmounts } from "@/engine/journal";
import { QTY } from "@/content/events";
import { tradeScale } from "@/content/eventKit";
import { ITEMS, itemsForLevel } from "@/content/world";
import { type OrderPay, orderPreview } from "@/game/logic";
import type { GameState, ItemId } from "@/game/types";
import { Sprite } from "./Sprite";
import { Btn, fmt } from "./ui";

/** 開店前に、ガンテツへ仕入れを注文する欄 */
export function OrderPanel({ state, onOrder }: { state: GameState; onOrder: (item: ItemId, qty: number, pay: OrderPay) => void }) {
  const items = itemsForLevel(state.level);
  // 最初は、いちばん在庫の少ない商品を選んでおく
  const [item, setItem] = useState<ItemId>(() => [...items].sort((a, b) => state.stock[a] - state.stock[b])[0]);
  const qtys = QTY[item].map((q) => q * tradeScale(state.level));
  const [qty, setQty] = useState(qtys[0]);
  const pays: OrderPay[] = state.lessonsDone.includes("credit") ? ["現金", "普通預金", "買掛金"] : ["現金", "普通預金"];
  const [pay, setPay] = useState<OrderPay>(pays[0]);
  const { tx, disabled } = orderPreview(state, item, qty, pay);
  const total = sumAmounts(tx.answer.debit);

  const chip = (active: boolean) => `rounded-full border px-2.5 py-1 text-xs ${active ? "border-gold bg-gold/15 text-gold" : "border-white/40 hover:bg-white/10"}`;

  return (
    <div className="mb-3 rounded-lg border border-white/30 p-2 text-sm">
      <div className="mb-1 text-gold">開店前の仕入れ（ドワーフ商会に注文）</div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {items.map((id) => (
          <button
            key={id}
            type="button"
            className={`${chip(item === id)} flex items-center gap-1`}
            onClick={() => {
              setItem(id);
              setQty(QTY[id][0] * tradeScale(state.level));
            }}
          >
            <Sprite name={ITEMS[id].sprite} palette={ITEMS[id].palette} size={12} />
            {ITEMS[id].name}
            <span className="text-dim">（在庫{state.stock[id]}）</span>
          </button>
        ))}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-dim">数量</span>
        {qtys.map((q) => (
          <button key={q} type="button" className={chip(qty === q)} onClick={() => setQty(q)}>
            {q}
            {ITEMS[item].unit}
          </button>
        ))}
        <span className="text-xs text-dim">支払い</span>
        {pays.map((p) => (
          <button key={p} type="button" className={chip(pay === p)} onClick={() => setPay(p)}>
            {p === "買掛金" ? "掛け（月末払い）" : p}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs">
          仕入値 1{ITEMS[item].unit}{fmt(ITEMS[item].cost)}円 × {qty} ＝ <span className="text-gold">{fmt(ITEMS[item].cost * qty)}円</span>
          {total !== ITEMS[item].cost * qty && `（消費税込みで${fmt(total)}円）`}
          <span className="text-dim">／店での売値 1{ITEMS[item].unit}{fmt(ITEMS[item].price)}円</span>
        </span>
        <Btn variant="ghost" disabled={!!disabled} onClick={() => onOrder(item, qty, pay)}>
          {disabled ? `注文できない（${disabled}）` : "注文して記帳する"}
        </Btn>
      </div>
    </div>
  );
}
