"use client";

import { useMemo, useState } from "react";
import { type AccountName, categoryOf } from "@/engine/accounts";
import { sumAmounts } from "@/engine/journal";
import { statements, worksheet } from "@/engine/ledger";
import { fiscalYear } from "@/content/world";
import { entriesOf } from "@/game/logic";
import { seededRand, shuffle } from "@/game/random";
import type { GameState } from "@/game/types";
import { Btn, Portrait, Win, fmt } from "./ui";

const cell = (n: number) => (n ? fmt(n) : "");

/** 財務諸表での表示名（3級の表示ルール） */
const DISPLAY: Partial<Record<AccountName, string>> = { 仕入: "売上原価", 売上: "売上高", 繰越商品: "商品", 貯蔵品: "貯蔵品", 前払保険料: "前払費用", 未払利息: "未払費用", 未収利息: "未収収益" };
const label = (a: AccountName) => DISPLAY[a] ?? a;

/** 資産から差し引く科目と、差し引かれる側の資産 */
const CONTRA_OF: Partial<Record<AccountName, AccountName[]>> = {
  貸倒引当金: ["売掛金", "受取手形", "電子記録債権"],
  備品減価償却累計額: ["備品"],
  車両運搬具減価償却累計額: ["車両運搬具"],
};

function options(answer: number, seed: number, distractors: number[]): number[] {
  const opts = [answer];
  for (const d of [...distractors, answer + 7000, answer - 4000]) if (opts.length < 3 && d >= 0 && !opts.includes(d)) opts.push(d);
  return shuffle(opts, seededRand(seed));
}

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
  const from = state.closingFrom ?? state.journal.length;
  const { rows, netIncome } = useMemo(() => {
    const entries = entriesOf(state);
    return worksheet(entries.slice(0, from), entries.slice(from));
  }, [state, from]);
  const total = (k: "trial" | "adjust" | "income" | "balance", s: "debit" | "credit") => sumAmounts(rows.map((r) => ({ amount: r[k][s] })));
  const cogs = rows.find((r) => r.account === "仕入")?.income.debit ?? 0;
  const purchases = rows.find((r) => r.account === "仕入")?.trial.debit ?? 0;
  const quizzes = [
    { q: "損益計算書の欄の「仕入」（＝売上原価）はいくら？", answer: cogs, options: options(cogs, state.day, [purchases]) },
    { q: "当期純利益（損失のときはマイナス）はいくら？", answer: netIncome, options: options(netIncome, state.day + 1, [netIncome + cogs - purchases, -netIncome]) },
  ];
  const [picked, setPicked] = useState<(number | null)[]>([null, null]);
  const ni = (side: "income" | "balance") => (netIncome >= 0 ? (side === "income" ? "debit" : "credit") : side === "income" ? "credit" : "debit");

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
              {Array.from({ length: 4 }, (_, i) => [
                <th key={`${i}d`} className="border border-white/20 font-normal">
                  借方
                </th>,
                <th key={`${i}c`} className="border border-white/20 font-normal">
                  貸方
                </th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.account} className={r.adjust.debit || r.adjust.credit ? "bg-gold/10" : ""}>
                <td className="border border-white/20 px-1 whitespace-nowrap">{r.account}</td>
                {(["trial", "adjust", "income", "balance"] as const).flatMap((k) =>
                  (["debit", "credit"] as const).map((s) => (
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
                (["debit", "credit"] as const).map((s) => (
                  <td key={k + s} className="border border-white/20 px-1 text-right">
                    {ni(k) === s ? fmt(Math.abs(netIncome)) : ""}
                  </td>
                )),
              )}
            </tr>
            <tr className="text-dim">
              <td className="border border-white/20 px-1">合計</td>
              {(["trial", "adjust", "income", "balance"] as const).flatMap((k) =>
                (["debit", "credit"] as const).map((s) => (
                  <td key={k + s} className="border border-white/20 px-1 text-right">
                    {fmt(total(k, s) + ((k === "income" || k === "balance") && ni(k) === s ? Math.abs(netIncome) : 0))}
                  </td>
                )),
              )}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mb-3 text-xs text-dim">金色の行は、決算整理仕訳で修正した科目。左右の合計がそれぞれ一致していることを確かめよう。</p>
      {quizzes.map((qz, i) => (
        <div key={i} className="mb-3 rounded-lg border border-white/30 p-2 text-sm">
          <p className="mb-1">
            Q{i + 1}. {qz.q}
          </p>
          <div className="flex flex-wrap gap-2">
            {qz.options.map((o) => (
              <Btn
                key={o}
                variant="ghost"
                disabled={answered[i] !== null}
                className={answered[i] !== null && o === qz.answer ? "border-ok! text-ok" : picked[i] === o ? "border-ng! text-ng" : ""}
                onClick={() => {
                  setPicked((p) => p.map((v, j) => (j === i ? o : v)));
                  onAnswer(i, o === qz.answer);
                }}
              >
                {fmt(o)}円
              </Btn>
            ))}
          </div>
          {answered[i] !== null && (
            <p className="rise mt-1">{answered[i] ? <span className="text-ok">正解！ 信用 +3</span> : <span className="text-ng">おしい！ 正解は {fmt(qz.answer)}円</span>}</p>
          )}
        </div>
      ))}
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
  const s = useMemo(() => statements(entriesOf(state)), [state]);
  const sales = s.revenues.find((r) => r.account === "売上")?.amount ?? 0;
  const cogs = s.expenses.find((r) => r.account === "仕入")?.amount ?? 0;
  const tax = s.expenses.find((r) => r.account === "法人税、住民税及び事業税")?.amount ?? 0;
  const otherExpenses = s.expenses.filter((r) => r.account !== "仕入" && r.account !== "法人税、住民税及び事業税");
  const otherRevenues = s.revenues.filter((r) => r.account !== "売上");
  const pretax = s.netIncome + tax;
  // 引当金・累計額は、差し引く対象のうち最初に出てくる資産の下に「△」で書く
  const contraOf = (asset: AccountName) =>
    s.contras.filter((c) => (CONTRA_OF[c.account] ?? []).find((t) => s.assets.some((x) => x.account === t)) === asset);
  const retained = (s.equity.find((e) => e.account === "繰越利益剰余金")?.amount ?? 0) + s.netIncome;
  const assetTotal = sumAmounts(s.assets) - sumAmounts(s.contras);

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
                {contraOf(a.account).map((c) => (
                  <Line key={c.account} name={`${c.account}`} amount={c.amount} indent minus />
                ))}
              </div>
            ))}
          <Line name="資産合計" amount={assetTotal} strong />
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
        <Portrait id="hoho" size={44} className="shrink-0" />
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
