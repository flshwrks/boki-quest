"use client";

import { useState } from "react";
import { sumAmounts } from "@/engine/journal";
import { type PurchasePay, lowestStockItem, orderQtys } from "@/content/events";
import { ITEMS, itemsForLevel } from "@/content/world";
import { orderPreview } from "@/game/logic";
import type { GameState, ItemId } from "@/game/types";
import { Sprite } from "./Sprite";
import { Btn, fmt } from "./ui";

/** 開店前に、ガンテツへ仕入れを注文する欄 */
export function OrderPanel({ state, onOrder }: { state: GameState; onOrder: (item: ItemId, qty: number, pay: PurchasePay) => void }) {
  const items = itemsForLevel(state.level);
  // 最初は、いちばん在庫の少ない商品を選んでおく
  const [item, setItem] = useState<ItemId>(() => lowestStockItem(state));
  // 数量は候補の何番目かで持つ（商品を変えても、候補の中から選ばれたままになる）
  const [qi, setQi] = useState(0);
  const qtys = orderQtys(item, state.level);
  const qty = qtys[qi] ?? qtys[0];
  const pays: PurchasePay[] = state.lessonsDone.includes("credit") ? ["現金", "普通預金", "買掛金"] : ["現金", "普通預金"];
  const [pay, setPay] = useState<PurchasePay>(pays[0]);
  const { tx, disabled } = orderPreview(state, item, qty, pay);
  const it = ITEMS[item];
  const subtotal = it.cost * qty;
  const total = sumAmounts(tx.answer.debit);

  return (
    <div className="mb-3 rounded-lg border border-white/30 p-2 text-sm">
      <div className="mb-1 text-gold">開店前の仕入れ（ドワーフ商会に注文）</div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {items.map((id) => (
          <Btn key={id} variant="chip" active={item === id} className="flex items-center gap-1" onClick={() => setItem(id)}>
            <Sprite name={ITEMS[id].sprite} palette={ITEMS[id].palette} size={12} />
            {ITEMS[id].name}
            <span className="text-dim">（在庫{state.stock[id]}）</span>
          </Btn>
        ))}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-dim">数量</span>
        {qtys.map((q, i) => (
          <Btn key={q} variant="chip" active={qty === q} onClick={() => setQi(i)}>
            {q}
            {it.unit}
          </Btn>
        ))}
        <span className="text-xs text-dim">支払い</span>
        {pays.map((p) => (
          <Btn key={p} variant="chip" active={pay === p} onClick={() => setPay(p)}>
            {p === "買掛金" ? "掛け（月末払い）" : p}
          </Btn>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs">
          仕入値 1{it.unit}{fmt(it.cost)}円 × {qty} ＝ <span className="text-gold">{fmt(subtotal)}円</span>
          {total !== subtotal && `（消費税込みで${fmt(total)}円）`}
          <span className="text-dim">／店での売値 1{it.unit}{fmt(it.price)}円</span>
        </span>
        <Btn variant="ghost" disabled={!!disabled} onClick={() => onOrder(item, qty, pay)}>
          {disabled ? `注文できない（${disabled}）` : "注文して記帳する"}
        </Btn>
      </div>
    </div>
  );
}
