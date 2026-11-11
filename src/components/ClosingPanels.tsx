"use client";

import { useMemo } from "react";
import { categoryOf, statementLabel as label } from "@/engine/accounts";
import { type Entry, sumAmounts } from "@/engine/journal";
import { contrasUnder, retainedEarnings, statements, worksheet } from "@/engine/ledger";
import { fiscalYear } from "@/content/world";
import type { GameState } from "@/game/types";
import { type Quiz, QuizList, quizOptions } from "./Quiz";
import { Btn, Portrait, Win, fmt } from "./ui";

const cell = (n: number) => (n ? fmt(n) : "");


const COLUMNS = ["trial", "adjust", "income", "balance"] as const;
const SIDES = ["debit", "credit"] as const;

/** 仕訳が増えたときだけ集計し直す（クイズに答えただけでは計算しない） */
const useEntries = (state: GameState): Entry[] => useMemo(() => state.journal.map((r) => r.entry), [state.journal]);

export function WorksheetPanel({
  state,
  answered,
  onAnswer,
  onNext,
}: {
  state: GameState;
  answered: (boolean | null)[];
  onAnswer: (i: number, correct: boolean) => void;
  onNext: () => void;
}) {
  const entries = useEntries(state);
  const from = state.closingFrom ?? entries.length;
  const sheet = useMemo(() => worksheet(entries.slice(0, from), entries.slice(from)), [entries, from]);
  const { rows, netIncome, netIncomeRow, totals } = sheet;
  const purchaseRow = rows.find((r) => r.account === "仕入");
  const cogs = purchaseRow?.income.debit ?? 0;
  const purchases = purchaseRow?.trial.debit ?? 0;
  const quizzes: Quiz[] = [
    {
      q: "損益計算書の欄の「仕入」（＝売上原価）はいくら？",
      answer: cogs,
      options: quizOptions(cogs, [purchases], state.day),
      explain: "試算表の仕入に、期首商品を足して期末商品を引いた金額じゃ。これが売れた商品の仕入値になる。",
    },
    {
      q: "当期純利益（損失のときはマイナス）はいくら？",
      answer: netIncome,
      options: quizOptions(netIncome, [netIncome + cogs - purchases, -netIncome], state.day + 1),
      explain: "損益計算書の欄の、貸方（収益）の合計 − 借方（費用）の合計じゃ。",
    },
  ];

  return (
    <Win title={`${fiscalYear(state.day)}年目の精算表`}>
      <p className="mb-2 text-sm">
        決算整理前の試算表に、さっき書いた決算整理仕訳（修正記入）を足す。収益・費用は損益計算書の欄へ、それ以外は貸借対照表の欄へ。両方の差額が当期純利益じゃ。
      </p>
      <div className="mb-3 overflow-x-auto rounded-lg border border-white/30">
        <table className="w-full min-w-[720px] border-collapse text-xs tabular-nums">
          <thead>
            <tr className="text-dim">
              <th rowSpan={2} className="border border-white/20 px-1 py-1 text-left font-normal">
                勘定科目
              </th>
              {["試算表", "修正記入", "損益計算書", "貸借対照表"].map((h) => (
                <th key={h} colSpan={2} className="border border-white/20 py-1 font-normal">
                  {h}
                </th>
              ))}
            </tr>
            <tr className="text-dim">
              {COLUMNS.flatMap((k) =>
                SIDES.map((s) => (
                  <th key={k + s} className="border border-white/20 font-normal">
                    {s === "debit" ? "借方" : "貸方"}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.account} className={r.adjust.debit || r.adjust.credit ? "bg-gold/10" : ""}>
                <td className="border border-white/20 px-1 whitespace-nowrap">{r.account}</td>
                {COLUMNS.flatMap((k) =>
                  SIDES.map((s) => (
                    <td key={k + s} className="border border-white/20 px-1 text-right">
                      {cell(r[k][s])}
                    </td>
                  )),
                )}
              </tr>
            ))}
            <tr className="text-gold">
              <td className="border border-white/20 px-1">{netIncome >= 0 ? "当期純利益" : "当期純損失"}</td>
              <td className="border border-white/20" colSpan={4} />
              {(["income", "balance"] as const).flatMap((k) =>
                SIDES.map((s) => (
                  <td key={k + s} className="border border-white/20 px-1 text-right">
                    {cell(netIncomeRow[k][s])}
                  </td>
                )),
              )}
            </tr>
            <tr className="text-dim">
              <td className="border border-white/20 px-1">合計</td>
              {COLUMNS.flatMap((k) =>
                SIDES.map((s) => (
                  <td key={k + s} className="border border-white/20 px-1 text-right">
                    {fmt(totals[k][s])}
                  </td>
                )),
              )}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mb-3 text-xs text-dim">金色の行は、決算整理仕訳で修正した科目。どの欄も左右の合計が一致していることを確かめよう。</p>
      <QuizList quizzes={quizzes} answered={answered} onAnswer={onAnswer} />
      <Btn onClick={onNext} disabled={answered.some((a) => a === null)}>
        財務諸表を見る
      </Btn>
    </Win>
  );
}

function Line({ name, amount, indent = false, strong = false, minus = false }: { name: string; amount: number; indent?: boolean; strong?: boolean; minus?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 py-0.5 ${strong ? "border-t border-white/40 text-gold" : ""}`}>
      <span className={indent ? "pl-4" : ""}>{name}</span>
      <span className="tabular-nums">{minus ? `△${fmt(amount)}` : fmt(amount)}</span>
    </div>
  );
}

export function ReportPanel({ state, onFinish }: { state: GameState; onFinish: () => void }) {
  const entries = useEntries(state);
  const s = useMemo(() => statements(entries), [entries]);
  const sales = s.revenues.find((r) => r.account === "売上")?.amount ?? 0;
  const cogs = s.expenses.find((r) => r.account === "仕入")?.amount ?? 0;
  const tax = s.expenses.find((r) => r.account === "法人税、住民税及び事業税")?.amount ?? 0;
  const otherExpenses = s.expenses.filter((r) => r.account !== "仕入" && r.account !== "法人税、住民税及び事業税");
  const otherRevenues = s.revenues.filter((r) => r.account !== "売上");
  const pretax = s.netIncome + tax;
  // 引当金・累計額は、差し引く対象のうち最初に出てくる資産の下に「△」で書く
  const contraUnder = useMemo(() => contrasUnder(s), [s]);
  const retained = retainedEarnings(s);

  return (
    <Win title={`${fiscalYear(state.day)}年目の財務諸表`}>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-white/30 p-3 text-sm">
          <h3 className="mb-1 text-gold">損益計算書</h3>
          <Line name="売上高" amount={sales} />
          <Line name="売上原価" amount={cogs} />
          <Line name="売上総利益" amount={sales - cogs} strong />
          {otherExpenses.map((e) => (
            <Line key={e.account} name={label(e.account)} amount={e.amount} indent />
          ))}
          {otherRevenues.map((r) => (
            <Line key={r.account} name={`${label(r.account)}（収益）`} amount={r.amount} indent />
          ))}
          <Line name={pretax >= 0 ? "税引前当期純利益" : "税引前当期純損失"} amount={Math.abs(pretax)} strong />
          {tax > 0 && <Line name="法人税、住民税及び事業税" amount={tax} indent />}
          <Line name={s.netIncome >= 0 ? "当期純利益" : "当期純損失"} amount={Math.abs(s.netIncome)} strong />
        </section>
        <section className="rounded-lg border border-white/30 p-3 text-sm">
          <h3 className="mb-1 text-gold">貸借対照表</h3>
          <p className="text-xs text-dim">資産</p>
          {s.assets
            .filter((a) => categoryOf(a.account) === "asset")
            .map((a) => (
              <div key={a.account}>
                <Line name={label(a.account)} amount={a.amount} indent />
                {(contraUnder.get(a.account) ?? []).map((c) => (
                  <Line key={c.account} name={label(c.account)} amount={c.amount} indent minus />
                ))}
              </div>
            ))}
          <Line name="資産合計" amount={sumAmounts(s.assets) - sumAmounts(s.contras)} strong />
          <p className="mt-2 text-xs text-dim">負債・純資産</p>
          {s.liabilities.map((l) => (
            <Line key={l.account} name={label(l.account)} amount={l.amount} indent />
          ))}
          {s.equity
            .filter((e) => e.account !== "繰越利益剰余金")
            .map((e) => (
              <Line key={e.account} name={e.account} amount={e.amount} indent />
            ))}
          <Line name="繰越利益剰余金（当期の利益を含む）" amount={retained} indent />
          <Line name="負債・純資産合計" amount={sumAmounts(s.liabilities) + sumAmounts(s.equity) + s.netIncome} strong />
        </section>
      </div>
      <div className="mt-3 flex gap-3 text-sm">
        <Portrait id="hoho" size={48} className="shrink-0" />
        <p>
          これが1年間の成績表じゃ。最後に、収益と費用の残高を「損益」勘定に集めて、当期純利益を繰越利益剰余金へ振り替える。これで収益・費用はゼロに戻り、新しい年度が始まる。
        </p>
      </div>
      <div className="mt-3">
        <Btn onClick={onFinish}>損益を振り替えて、新しい年度へ</Btn>
      </div>
    </Win>
  );
}
