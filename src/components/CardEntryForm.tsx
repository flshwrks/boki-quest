"use client";

import { useEffect, useState } from "react";
import { type AccountName, type Category, type Side, CATEGORY_LABEL, SIDE_LABEL, categoryOf, inMasterOrder, isAccountName, sideWithPos } from "@/engine/accounts";
import { parseAmount } from "@/engine/format";
import type { Entry } from "@/engine/journal";
import { AccountChip, CATEGORY_BG, arrowSide, fmt } from "./ui";
import { play } from "./sfx";

interface Row {
  id: number;
  side: Side;
  account: AccountName | null;
  amount: string;
}

const SIDES: Side[] = ["debit", "credit"];

// 凡例に出す5つの区分（仮勘定は除く）
const LEGEND = (Object.keys(CATEGORY_LABEL) as Category[]).filter((c) => c !== "suspense");

/** 試験文に出てくる金額を拾い、タップで入力できるようにする */
function amountsIn(text: string): number[] {
  const nums = [...text.matchAll(/([\d,]+)円/g)].map((m) => parseAmount(m[1]));
  return [...new Set(nums)].filter((v) => v > 0);
}

function toEntry(rows: Row[]): Entry {
  const lines = (side: Side) =>
    rows.filter((r) => r.side === side && r.account).map((r) => ({ account: r.account!, amount: parseAmount(r.amount) }));
  return { debit: lines("debit"), credit: lines("credit") };
}

/**
 * カードを借方・貸方の枠に置く入力（序盤向け）。
 * 枠をタップして置き場所を切り替え、カードをタップ（PCはドラッグでも可）して置く。
 */
export function CardEntryForm({ accounts, examText, onChange }: { accounts: AccountName[]; examText: string; onChange: (entry: Entry) => void }) {
  const [rows, setRowsState] = useState<Row[]>([
    { id: 0, side: "debit", account: null, amount: "" },
    { id: 1, side: "credit", account: null, amount: "" },
  ]);
  const [nextId, setNextId] = useState(2);
  // カードの置き場所と、金額チップの入力先になる行。入力先はいつも置き場所の側にある
  const [focusId, setFocusId] = useState(0);
  const [activeSide, setActiveSide] = useState<Side>("debit");

  const setRows = (next: Row[]) => {
    setRowsState(next);
    onChange(toEntry(next));
  };

  /** 側を切り替えると、金額の入力先もその側の行へ移す。keepTyping なら、その行の金額欄に入力の位置ごと移る */
  const selectSide = (side: Side, keepTyping = false) => {
    if (side === activeSide) return;
    play("select");
    setActiveSide(side);
    const sideRows = rows.filter((r) => r.side === side);
    const target = sideRows.find((r) => r.account === null) ?? sideRows.find((r) => r.amount === "") ?? sideRows[0];
    if (target) setFocusId(target.id);
    if (keepTyping && target) document.querySelector<HTMLInputElement>(`[data-amount-row="${target.id}"]`)?.focus();
    // 反対側の金額欄にカーソルが残らないようにする
    else if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
  };

  // ←→キーでも、借方・貸方の枠を切り替えられる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const side = arrowSide(e);
      if (!side || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      selectSide(side, e.target instanceof HTMLInputElement);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const focusRow = (r: Row) => {
    setFocusId(r.id);
    setActiveSide(r.side);
  };

  const placeCard = (account: AccountName, side: Side) => {
    play("card");
    const focused = rows.find((r) => r.id === focusId && r.side === side && r.account === null);
    const target = focused ?? rows.find((r) => r.side === side && r.account === null);
    let next: Row[];
    let placedId: number;
    if (target) {
      next = rows.map((r) => (r.id === target.id ? { ...r, account } : r));
      placedId = target.id;
    } else {
      placedId = nextId;
      next = [...rows, { id: nextId, side, account, amount: "" }];
      setNextId(nextId + 1);
    }
    setRows(next);
    // 置いた行をそのまま金額の入力先にする（金額を入れてから、自分で反対側の枠に移る）
    setFocusId(placedId);
    setActiveSide(side);
  };

  const update = (id: number, patch: Partial<Row>) => setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = (side: Side) => {
    setRows([...rows, { id: nextId, side, account: null, amount: "" }]);
    setFocusId(nextId);
    setNextId(nextId + 1);
    setActiveSide(side);
  };

  const chips = amountsIn(examText);

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {SIDES.map((side) => {
          const active = activeSide === side;
          const sideRows = rows.filter((r) => r.side === side);
          return (
            <div
              key={side}
              onClick={() => selectSide(side)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const acc = e.dataTransfer.getData("text/plain");
                if (isAccountName(acc)) placeCard(acc, side);
              }}
              className={`min-h-28 cursor-pointer rounded-lg border-2 p-1.5 transition-colors ${
                active ? "border-gold bg-gold/10 shadow-[0_0_12px_rgb(240_200_80/0.35)]" : "border-white/30 hover:border-white/60"
              }`}
            >
              <div className={`mb-1 flex items-center justify-between text-sm ${active ? "text-gold" : "text-dim"}`}>
                <span>{sideWithPos(side)}</span>
                {active && <span className="rounded bg-gold px-1.5 text-[10px] text-ink">ここに置く</span>}
              </div>
              <ul className="flex flex-col gap-1.5">
                {sideRows.map((r) => (
                  <li
                    key={r.id}
                    className={`rounded p-1 ${focusId === r.id ? "outline-2 outline-gold/70" : ""}`}
                    onClick={(e) => {
                      // 枠全体のクリック（最初の空き行へ移る）より、押した行を優先する
                      e.stopPropagation();
                      focusRow(r);
                    }}
                  >
                    <div className="flex items-center gap-1">
                      {r.account ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            update(r.id, { account: null });
                            focusRow(r);
                          }}
                          aria-label={`${r.account}を外す`}
                        >
                          <AccountChip account={r.account} className="text-sm" />
                        </button>
                      ) : (
                        <span className="rounded border border-dashed border-white/50 px-2 py-0.5 text-xs text-dim">科目をえらぶ</span>
                      )}
                      {sideRows.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRows(rows.filter((x) => x.id !== r.id));
                          }}
                          className="ml-auto px-1 text-dim"
                          aria-label="この行を消す"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <input
                      inputMode="numeric"
                      data-amount-row={r.id}
                      value={r.amount}
                      onFocus={() => focusRow(r)}
                      onChange={(e) => update(r.id, { amount: e.target.value.replace(/[^\d,]/g, "") })}
                      placeholder="金額"
                      aria-label={`${SIDE_LABEL[side]}の金額`}
                      className="mt-1 w-full rounded border border-white/40 bg-black/30 px-2 py-1 text-right tabular-nums"
                    />
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  addRow(side);
                }}
                className="mt-1 w-full rounded border border-dashed border-white/30 text-xs text-dim hover:bg-white/5"
              >
                ＋ 行を追加
              </button>
            </div>
          );
        })}
      </div>

      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-dim">金額をタップで入力（枠で囲まれた行へ）：</span>
          {chips.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => update(focusId, { amount: fmt(v) })}
              className="rounded-full border border-white/50 px-2.5 py-0.5 tabular-nums hover:bg-white/10"
            >
              {fmt(v)}
            </button>
          ))}
        </div>
      )}

      {/* 勘定科目カード */}
      <div className="mt-3 border-t border-white/20 pt-3">
        <p className="mb-1.5 text-xs text-dim">
          カードをタップすると、<span className="text-gold">金色の枠</span>（{sideWithPos(activeSide)}）に置かれる。左右の枠はタップか ←→キーで切り替え
        </p>
        <div className="flex flex-wrap gap-1.5">
          {inMasterOrder(accounts).map((acc) => (
            <button
              key={acc}
              type="button"
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/plain", acc)}
              onClick={() => placeCard(acc, activeSide)}
              className={`${CATEGORY_BG[categoryOf(acc)]} rounded-md border-2 border-white/25 px-2 py-1 text-sm shadow-[0_2px_0_rgb(0_0_0/0.4)] transition-transform hover:-translate-y-0.5 hover:border-white active:translate-y-0 active:scale-95`}
              title={CATEGORY_LABEL[categoryOf(acc)]}
            >
              {acc}
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-dim">
          {LEGEND.map((c) => (
            <span key={c} className="flex items-center gap-1">
              <span className={`${CATEGORY_BG[c]} inline-block h-2.5 w-2.5 rounded-sm`} />
              {CATEGORY_LABEL[c]}
            </span>
          ))}
          <span className="ml-auto">PCはドラッグでも置ける</span>
        </div>
      </div>
    </>
  );
}
