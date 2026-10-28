"use client";

import { useState } from "react";
import { sumAmounts } from "@/engine/journal";
import { type PurchasePay, lowestStockItem, orderQtys, orderStep } from "@/content/events";
import { ITEMS, itemsForLevel } from "@/content/world";
import { orderPreview } from "@/game/logic";
import type { GameState, ItemId } from "@/game/types";
import { Sprite } from "./Sprite";
import { Btn, fmt } from "./ui";

/** 一度に注文できる数の上限 */
const MAX_QTY = 999;

/** 開店前に、ガンテツへ仕入れを注文する欄 */
export function OrderPanel({ state, onOrder }: { state: GameState; onOrder: (item: ItemId, qty: number, pay: PurchasePay) => void }) {
  const items = itemsForLevel(state.level);
  // 最初は、いちばん在庫の少ない商品を選んでおく
  const [item, setItem] = useState<ItemId>(() => lowestStockItem(state));
  // 数量は自由に入力できる。△▽は商品ごとの刻みで増減する
  const [qtyText, setQtyText] = useState(() => String(orderQtys(lowestStockItem(state), state.level)[0]));
  const qty = Math.min(MAX_QTY, Math.max(0, parseInt(qtyText, 10) || 0));
  const step = orderStep(item, state.level);
  const setQty = (q: number) => setQtyText(String(Math.min(MAX_QTY, Math.max(step, q))));
  const chooseItem = (id: ItemId) => {
    setItem(id);
    setQtyText(String(orderQtys(id, state.level)[0]));
  };
  const pays: PurchasePay[] = state.lessonsDone.includes("credit") ? ["現金", "普通預金", "買掛金"] : ["現金", "普通預金"];
  const [pay, setPay] = useState<PurchasePay>(pays[0]);
  const { tx, disabled: short } = orderPreview(state, item, Math.max(1, qty), pay);
  const disabled = qty <= 0 ? "数量を入れてください" : short;
  const it = ITEMS[item];
  const subtotal = it.cost * qty;
  const total = sumAmounts(tx.answer.debit);

  return (
    <div className="mb-3 rounded-lg border border-white/30 p-2 text-sm">
      <div className="mb-1 text-gold">開店前の仕入れ（ドワーフ商会に注文）</div>
      <p className="mb-1 text-xs text-dim">いつもの仕入値で注文できる。ガンテツが店に来たときは、特価で仕入れられることもあるぞ。</p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {items.map((id) => (
          <Btn key={id} variant="chip" active={item === id} className="flex items-center gap-1" onClick={() => chooseItem(id)}>
            <Sprite name={ITEMS[id].sprite} palette={ITEMS[id].palette} size={12} />
            {ITEMS[id].name}
            <span className="text-dim">（在庫{state.stock[id]}）</span>
          </Btn>
        ))}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-dim">数量</span>
        <span className="inline-flex items-center gap-1">
          <Btn variant="chip" onClick={() => setQty(qty - step)} disabled={qty <= step}>
            <span aria-label={`${step}${it.unit}へらす`}>▽</span>
          </Btn>
          <input
            inputMode="numeric"
            value={qtyText}
            onChange={(e) => setQtyText(e.target.value.replace(/\D/g, "").slice(0, 3))}
            onKeyDown={(e) => {
              // ↑↓キーでも増減できる
              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                setQty(qty + (e.key === "ArrowUp" ? step : -step));
              }
            }}
            aria-label="仕入れる数量"
            className="w-14 rounded border border-white/40 bg-black/30 px-1 py-0.5 text-right tabular-nums"
          />
          <Btn variant="chip" onClick={() => setQty(qty + step)} disabled={qty >= MAX_QTY}>
            <span aria-label={`${step}${it.unit}ふやす`}>△</span>
          </Btn>
          <span className="text-xs">{it.unit}</span>
        </span>
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
