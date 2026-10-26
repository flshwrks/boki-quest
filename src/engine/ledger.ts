import { ACCOUNTS, type AccountName, categoryOf, homeSide } from "./accounts";
import { type Entry, sumAmounts } from "./journal";

/** 借方合計 − 貸方合計（借方残ならプラス、貸方残ならマイナス） */
export function netBalances(entries: Entry[]): Map<AccountName, number> {
  const map = new Map<AccountName, number>();
  for (const e of entries) {
    for (const l of e.debit) map.set(l.account, (map.get(l.account) ?? 0) + l.amount);
    for (const l of e.credit) map.set(l.account, (map.get(l.account) ?? 0) - l.amount);
  }
  return map;
}

/** 借方残高を、その科目が増える側から見た残高に直す（貸方が定位置の科目は符号を反転） */
function fromHome(account: AccountName, net: number): number {
  if (net === 0) return 0;
  return homeSide(categoryOf(account)) === "credit" ? -net : net;
}

export interface TrialBalanceRow {
  account: AccountName;
  debit: number;
  credit: number;
}

/** 残高試算表。勘定科目マスタの並び（資産→負債→純資産→収益→費用）で出力する */
export function trialBalance(entries: Entry[]): TrialBalanceRow[] {
  const net = netBalances(entries);
  const rows: TrialBalanceRow[] = [];
  for (const account of Object.keys(ACCOUNTS) as AccountName[]) {
    const n = net.get(account);
    if (!n) continue;
    rows.push({ account, debit: n > 0 ? n : 0, credit: n < 0 ? -n : 0 });
  }
  return rows;
}

export interface Row {
  account: AccountName;
  amount: number;
}

export interface Statements {
  assets: Row[];
  liabilities: Row[];
  equity: Row[];
  revenues: Row[];
  expenses: Row[];
  netIncome: number;
}

const BUCKET = {
  asset: "assets",
  liability: "liabilities",
  equity: "equity",
  revenue: "revenues",
  expense: "expenses",
} as const;

/**
 * 期中の簡易な貸借対照表・損益計算書。
 * 当期純利益は純資産側に足すことで、資産 = 負債 + 純資産 + 当期純利益 が成り立つ。
 */
export function statements(entries: Entry[]): Statements {
  const s: Statements = { assets: [], liabilities: [], equity: [], revenues: [], expenses: [], netIncome: 0 };
  for (const [account, n] of netBalances(entries)) {
    if (n === 0) continue;
    const cat = categoryOf(account);
    if (cat === "suspense") {
      // 仮勘定は、借方残なら資産側、貸方残なら負債側に仮置きして見せる
      (n > 0 ? s.assets : s.liabilities).push({ account, amount: Math.abs(n) });
    } else {
      s[BUCKET[cat]].push({ account, amount: fromHome(account, n) });
    }
  }
  s.netIncome = sumAmounts(s.revenues) - sumAmounts(s.expenses);
  return s;
}

/** 集計済みの netBalances から、科目の残高を増える側から見た値で返す */
export function balanceIn(net: Map<AccountName, number>, account: AccountName): number {
  return fromHome(account, net.get(account) ?? 0);
}

export function balanceOf(entries: Entry[], account: AccountName): number {
  return balanceIn(netBalances(entries), account);
}

export function trialBalanceTotals(rows: TrialBalanceRow[]): { debit: number; credit: number } {
  return { debit: rows.reduce((a, r) => a + r.debit, 0), credit: rows.reduce((a, r) => a + r.credit, 0) };
}
