// 消費税（税抜方式）。商品の売買の取引に、仮払消費税・仮受消費税を加える。

import type { AccountName } from "@/engine/accounts";
import { type Line, sumAmounts } from "@/engine/journal";
import type { Transaction } from "@/game/types";
import { n } from "./eventKit";

export const SALES_TAX_RATE = 0.1;

/** 消費税をのせる代金の科目（先にあるものを優先） */
const SALE_PAY: AccountName[] = ["現金", "売掛金", "普通預金", "当座預金", "受取手形", "電子記録債権", "クレジット売掛金", "受取商品券"];
const BUY_PAY: AccountName[] = ["買掛金", "現金", "普通預金", "当座預金", "未払金", "支払手形", "電子記録債務"];

const total = (lines: Line[], account: AccountName) => sumAmounts(lines.filter((l) => l.account === account));

/**
 * 税抜の売上・仕入の10%を消費税として加え、代金の行とツケの残高をその分ふやす。
 * 返品（売上・仕入が逆の側にある取引）なら、消費税も一緒に取り消す。
 */
export function withSalesTax(tx: Transaction): Transaction {
  const { debit, credit } = tx.answer;
  const cases = [
    { base: total(debit, "仕入"), tax: "仮払消費税", taxSide: "debit", paySide: "credit", pay: BUY_PAY, isReturn: false },
    { base: total(credit, "仕入"), tax: "仮払消費税", taxSide: "credit", paySide: "debit", pay: BUY_PAY, isReturn: true },
    { base: total(credit, "売上"), tax: "仮受消費税", taxSide: "credit", paySide: "debit", pay: SALE_PAY, isReturn: false },
    { base: total(debit, "売上"), tax: "仮受消費税", taxSide: "debit", paySide: "credit", pay: SALE_PAY, isReturn: true },
  ] as const;
  const c = cases.find((x) => x.base > 0);
  if (!c) return tx;
  const payLine = c.pay.map((a) => tx.answer[c.paySide].find((l) => l.account === a)).find((l) => l !== undefined);
  if (!payLine) return tx;
  const tax = Math.floor(c.base * SALES_TAX_RATE);
  const answer = {
    ...tx.answer,
    [c.taxSide]: [...tx.answer[c.taxSide], { account: c.tax, amount: tax }],
    [c.paySide]: tx.answer[c.paySide].map((l) => (l === payLine ? { ...l, amount: l.amount + tax } : l)),
  };
  // ツケの残高も税込にそろえる（新しく発生する分は税込の印をつける）
  const effect = tx.effect && {
    ...tx.effect,
    addCredits: tx.effect.addCredits?.map((a, i, all) =>
      a.kind === payLine.account && all.findIndex((x) => x.kind === payLine.account) === i ? { ...a, amount: a.amount + tax, taxed: true } : a,
    ),
    // 返品では、取り消すツケも消費税の分だけふやす
    settleCredits: c.isReturn ? tx.effect.settleCredits?.map((s, i) => (i === 0 ? { ...s, amount: s.amount + tax } : s)) : tx.effect.settleCredits,
  };
  return {
    ...tx,
    answer,
    effect,
    exam: `${tx.exam}なお、消費税（税率10%、${n(tax)}円）は税抜方式で処理する。`,
    idea: `${tx.idea} 消費税は、仕入なら仮払消費税、売上なら仮受消費税として別に記録するよ。`,
  };
}
