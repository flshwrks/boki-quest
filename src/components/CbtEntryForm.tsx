"use client";

import { useState } from "react";
import { type AccountName, type Side, SIDE_LABEL, inMasterOrder, isAccountName } from "@/engine/accounts";
import { parseAmount } from "@/engine/format";
import type { Entry } from "@/engine/journal";
import { arrowSide, fmt } from "./ui";

const ROWS = 4;
/** 1行の欄の数（借方科目・借方金額・貸方科目・貸方金額） */
const COLUMNS = 4;

interface Cell {
  account: AccountName | "";
  amount: string;
}

const blank = (): Cell => ({ account: "", amount: "" });

function fromEntry(entry: Entry | null, side: Side): Cell[] {
  const cells = (entry?.[side] ?? []).map((l) => ({ account: l.account, amount: fmt(l.amount) }));
  return [...cells, ...Array.from({ length: Math.max(0, ROWS - cells.length) }, blank)];
}

function toEntry(debit: Cell[], credit: Cell[]): Entry {
  const lines = (cells: Cell[]) =>
    cells
      .filter((c) => c.account !== "")
      .map((c) => ({ account: c.account as AccountName, amount: parseAmount(c.amount) }));
  return { debit: lines(debit), credit: lines(credit) };
}

/**
 * 本番CBTと同じ形の仕訳入力。勘定科目はプルダウンで選び、金額は数字で入れる。
 * 行は左右4行ずつ。使わない行は空のままでよい。
 */
export function CbtEntryForm({
  accounts,
  initial,
  onChange,
  chips = [],
}: {
  accounts: AccountName[];
  initial?: Entry | null;
  onChange: (entry: Entry) => void;
  /** 電卓の計算結果。押すと、最後に入力した金額欄（なければ金額の空いている行）に入る */
  chips?: number[];
}) {
  const [debit, setDebit] = useState(() => fromEntry(initial ?? null, "debit"));
  const [credit, setCredit] = useState(() => fromEntry(initial ?? null, "credit"));
  const [lastAmount, setLastAmount] = useState<{ side: Side; i: number } | null>(null);
  const options = inMasterOrder(accounts);

  const edit = (side: Side, i: number, patch: Partial<Cell>) => {
    const d = side === "debit" ? debit.map((c, j) => (j === i ? { ...c, ...patch } : c)) : debit;
    const c = side === "credit" ? credit.map((x, j) => (j === i ? { ...x, ...patch } : x)) : credit;
    setDebit(d);
    setCredit(c);
    onChange(toEntry(d, c));
  };

  const cells = { debit, credit };

  const insert = (v: number) => {
    const empty = (["debit", "credit"] as const).flatMap((side) => cells[side].map((c, i) => ({ side, i, c }))).find(({ c }) => c.account && !c.amount);
    const target = lastAmount ?? empty ?? { side: "debit" as const, i: 0 };
    edit(target.side, target.i, { amount: fmt(v) });
  };

  /** ←→キーで、同じ行の左右の欄（借方科目・借方金額・貸方科目・貸方金額）へ移る。プルダウンでは←→で選択肢が変わらないようにする */
  const onKeyDown = (e: React.KeyboardEvent<HTMLTableElement>) => {
    const dir = arrowSide(e.nativeEvent);
    const { row, col } = (e.target as HTMLElement).dataset;
    if (!dir || row === undefined || col === undefined) return;
    const next = Number(col) + (dir === "credit" ? 1 : -1);
    if (next < 0 || next >= COLUMNS) return;
    e.preventDefault();
    e.currentTarget.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${next}"]`)?.focus();
  };

  return (
    <div className="overflow-x-auto rounded-lg bg-[#f5f6fa] p-2 text-[#1d1d2b]">
      <table className="w-full min-w-[520px] border-collapse text-sm" onKeyDown={onKeyDown}>
        <thead>
          <tr className="bg-[#dfe3ef] text-xs">
            <th className="border border-[#b8bfd3] py-1 font-normal">借方科目</th>
            <th className="border border-[#b8bfd3] py-1 font-normal">金額</th>
            <th className="border border-[#b8bfd3] py-1 font-normal">貸方科目</th>
            <th className="border border-[#b8bfd3] py-1 font-normal">金額</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: ROWS }, (_, i) => (
            <tr key={i}>
              {(["debit", "credit"] as const).map((side, s) => {
                const cell = cells[side][i];
                return [
                  <td key={`${side}-a`} className="border border-[#b8bfd3] p-1">
                    <select
                      data-row={i}
                      data-col={s * 2}
                      value={cell.account}
                      onChange={(e) => edit(side, i, { account: isAccountName(e.target.value) ? e.target.value : "" })}
                      aria-label={`${SIDE_LABEL[side]}科目 ${i + 1}行目`}
                      className="w-full rounded border border-[#b8bfd3] bg-white px-1 py-1"
                    >
                      <option value="">選択してください</option>
                      {options.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </td>,
                  <td key={`${side}-n`} className="border border-[#b8bfd3] p-1">
                    <input
                      inputMode="numeric"
                      data-row={i}
                      data-col={s * 2 + 1}
                      value={cell.amount}
                      onFocus={() => setLastAmount({ side, i })}
                      onChange={(e) => edit(side, i, { amount: e.target.value.replace(/[^\d,]/g, "") })}
                      aria-label={`${SIDE_LABEL[side]}金額 ${i + 1}行目`}
                      className="w-full rounded border border-[#b8bfd3] bg-white px-2 py-1 text-right tabular-nums"
                    />
                  </td>,
                ];
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {chips.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-[#55607a]">電卓の答えを入れる（最後に入力した金額欄へ）：</span>
          {chips.map((v) => (
            <button key={v} type="button" onClick={() => insert(v)} className="rounded-full border border-[#8a93ad] bg-white px-2.5 py-0.5 tabular-nums hover:bg-[#dfe3ef]">
              {fmt(v)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
