// 消費税（税抜方式）。商品の売買の取引に、仮払消費税・仮受消費税を加える。

import { type AccountName, type Side, opposite } from "@/engine/accounts";
import { type Entry, sumOf } from "@/engine/journal";
import type { Transaction } from "@/game/types";
import { n, pct } from "./eventKit";

const SALES_TAX_RATE = 0.1;

/** 消費税をのせる代金の科目（先にあるものを優先） */
const SALE_PAY: AccountName[] = ["現金", "売掛金", "普通預金", "当座預金", "受取手形", "電子記録債権", "クレジット売掛金", "受取商品券"];
const BUY_PAY: AccountName[] = ["買掛金", "現金", "普通預金", "当座預金", "未払金", "支払手形", "電子記録債務"];

/**
 * 2026-10-30 より前に記帳した、代金を分けて受け払いする取引か。そのころの問題文には消費税をどちらに含めるかがなく、
 * 科目の並びの先頭（現金など、金額の書かれた側）に含めていたので、答えが問題文と合わない
 */
export function isLegacyTaxSplit(exam: string, entry: Entry): boolean {
  if (!exam.endsWith("税抜方式で処理する。") || exam.includes("なお、消費税は")) return false;
  const taxSide = (["debit", "credit"] as Side[]).find((s) => entry[s].some((l) => l.account === "仮受消費税" || l.account === "仮払消費税"));
  if (!taxSide) return false;
  const pays = entry[opposite(taxSide)].filter((l) => [...SALE_PAY, ...BUY_PAY].includes(l.account));
  return pays.length > 1;
}

/**
 * 問題文に消費税を書き込む。本番と同じく「代金は消費税〇円とともに〜」「消費税〇円を含めた代金のうち〜円は…、残額は…」の形にする。
 * こうすると、金額の書かれた代金はそのまま、消費税は残額の側に入ることが問題文から読み取れる。
 * 「代金」の出てこない問題文（返品・クレジット販売など）は、文末に消費税の金額を書き足す
 */
function taxedExam(exam: string, tax: number, base: number, taxBase: boolean): string {
  const t = `消費税${n(tax)}円`;
  if (exam.includes("代金のうち")) return `${exam.replace("代金のうち", `${t}を含めた代金のうち`)}なお、消費税は税抜方式で処理する。`;
  if (exam.includes("代金は")) {
    // 「代金は引取運賃〇円とともに」なら「代金は消費税〇円および引取運賃〇円とともに」
    const withFreight = exam.replace(/代金は(引取運賃[\d,]+円)とともに/, `代金は${t}および$1とともに`);
    const body = withFreight !== exam ? withFreight : exam.replace("代金は", `代金は${t}とともに`);
    return `${body}なお、${taxBase ? `消費税は商品代金${n(base)}円に対してかかり、` : "消費税は"}税抜方式で処理する。`;
  }
  return `${exam}消費税（税率${pct(SALES_TAX_RATE)}、${n(tax)}円）は税抜方式で処理する。`;
}

/**
 * 税抜の売上・仕入の10%を消費税として加え、代金の行とツケの残高をその分ふやす。
 * 返品（売上が借方、仕入が貸方にある取引）なら、消費税も一緒に取り消す。
 */
export function withSalesTax(tx: Transaction): Transaction {
  // 売上か仕入の行がある側に消費税を書き、反対側の代金の行をふやす
  const taxSide = (["debit", "credit"] as Side[]).find((s) => tx.answer[s].some((l) => l.account === "売上" || l.account === "仕入"));
  if (!taxSide) return tx;
  const isSale = tx.answer[taxSide].some((l) => l.account === "売上");
  const isReturn = (taxSide === "debit") === isSale;
  const paySide = opposite(taxSide);
  // 消費税は代金に含まれるので、問題文で金額の決まっていない「残額」の科目に上乗せする
  const payLine = (tx.taxTo ? [tx.taxTo] : isSale ? SALE_PAY : BUY_PAY).map((a) => tx.answer[paySide].find((l) => l.account === a)).find((l) => l !== undefined);
  if (!payLine) return tx;
  const base = tx.taxBase ?? sumOf(tx.answer[taxSide], isSale ? "売上" : "仕入");
  const tax = Math.floor(base * SALES_TAX_RATE);
  const answer = {
    ...tx.answer,
    [taxSide]: [...tx.answer[taxSide], { account: isSale ? "仮受消費税" : "仮払消費税", amount: tax }],
    [paySide]: tx.answer[paySide].map((l) => (l === payLine ? { ...l, amount: l.amount + tax } : l)),
  };
  // ツケの残高も税込にそろえる（新しく発生する分には税込の印をつけ、返品では取り消す分をふやす）
  const first = tx.effect?.addCredits?.findIndex((a) => a.kind === payLine.account) ?? -1;
  const effect = tx.effect && {
    ...tx.effect,
    addCredits: tx.effect.addCredits?.map((a, i) => (i === first ? { ...a, amount: a.amount + tax, taxed: true } : a)),
    settleCredits: isReturn ? tx.effect.settleCredits?.map((s, i) => (i === 0 ? { ...s, amount: s.amount + tax } : s)) : tx.effect.settleCredits,
  };
  return {
    ...tx,
    answer,
    effect,
    exam: taxedExam(tx.exam, tax, base, tx.taxBase !== undefined),
    idea: `${tx.idea} 消費税は、仕入なら仮払消費税、売上なら仮受消費税として別に記録するよ。`,
  };
}
