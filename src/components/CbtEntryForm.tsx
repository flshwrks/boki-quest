"use client";

import { useState } from "react";
import { type AccountName, type Side, SIDE_LABEL, inMasterOrder, isAccountName } from "@/engine/accounts";
import { parseAmount } from "@/engine/format";
import type { Entry } from "@/engine/journal";
import { fmt } from "./ui";

const ROWS = 4;

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
}: {
  accounts: AccountName[];
  initial?: Entry | null;
  onChange: (entry: Entry) => void;
}) {
  const [debit, setDebit] = useState(() => fromEntry(initial ?? null, "debit"));
  const [credit, setCredit] = useState(() => fromEntry(initial ?? null, "credit"));
  const options = inMasterOrder(accounts);

  const edit = (side: Side, i: number, patch: Partial<Cell>) => {
    const d = side === "debit" ? debit.map((c, j) => (j === i ? { ...c, ...patch } : c)) : debit;
    const c = side === "credit" ? credit.map((x, j) => (j === i ? { ...x, ...patch } : x)) : credit;
    setDebit(d);
    setCredit(c);
    onChange(toEntry(d, c));
  };

  const cells = { debit, credit };
  return (
    <div className="overflow-x-auto rounded-lg bg-[#f5f6fa] p-2 text-[#1d1d2b]">
      <table className="w-full min-w-[520px] border-collapse text-sm">
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
              {(["debit", "credit"] as const).map((side) => {
                const cell = cells[side][i];
                return [
                  <td key={`${side}-a`} className="border border-[#b8bfd3] p-1">
                    <select
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
                      value={cell.amount}
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
    </div>
  );
}
