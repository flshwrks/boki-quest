// 消費税（税抜方式）。商品の売買の取引に、仮払消費税・仮受消費税を加える。

import { type AccountName, type Side, opposite } from "@/engine/accounts";
import { sumOf } from "@/engine/journal";
import type { Transaction } from "@/game/types";
import { n, pct } from "./eventKit";

const SALES_TAX_RATE = 0.1;

/** 消費税をのせる代金の科目（先にあるものを優先） */
const SALE_PAY: AccountName[] = ["現金", "売掛金", "普通預金", "当座預金", "受取手形", "電子記録債権", "クレジット売掛金", "受取商品券"];
const BUY_PAY: AccountName[] = ["買掛金", "現金", "普通預金", "当座預金", "未払金", "支払手形", "電子記録債務"];

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
  const payLine = (isSale ? SALE_PAY : BUY_PAY).map((a) => tx.answer[paySide].find((l) => l.account === a)).find((l) => l !== undefined);
  if (!payLine) return tx;
  const tax = Math.floor(sumOf(tx.answer[taxSide], isSale ? "売上" : "仕入") * SALES_TAX_RATE);
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
    exam: `${tx.exam}消費税（税率${pct(SALES_TAX_RATE)}、${n(tax)}円）は税抜方式で処理する。`,
    idea: `${tx.idea} 消費税は、仕入なら仮払消費税、売上なら仮受消費税として別に記録するよ。`,
  };
}
