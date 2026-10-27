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
  /** 資産から差し引く科目（貸倒引当金・減価償却累計額） */
  contras: Row[];
  liabilities: Row[];
  equity: Row[];
  revenues: Row[];
  expenses: Row[];
  netIncome: number;
}

const BUCKET = {
  asset: "assets",
  contra: "contras",
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
  const s: Statements = { assets: [], contras: [], liabilities: [], equity: [], revenues: [], expenses: [], netIncome: 0 };
  const net = netBalances(entries);
  // 勘定科目マスタの並び（資産→負債→…）で並べる
  for (const account of Object.keys(ACCOUNTS) as AccountName[]) {
    const n = net.get(account) ?? 0;
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

type Pair = { debit: number; credit: number };

export interface WorksheetRow {
  account: AccountName;
  trial: Pair;
  adjust: Pair;
  income: Pair;
  balance: Pair;
}

export interface Worksheet {
  rows: WorksheetRow[];
  netIncome: number;
  /** 当期純利益の行。利益なら損益計算書の借方・貸借対照表の貸方に入る（損失なら逆） */
  netIncomeRow: { income: Pair; balance: Pair };
  /** 各欄の合計（当期純利益の行を含む）。どの欄も左右が一致する */
  totals: { trial: Pair; adjust: Pair; income: Pair; balance: Pair };
}

const split = (n: number): Pair => ({ debit: n > 0 ? n : 0, credit: n < 0 ? -n : 0 });

/**
 * 精算表。試算表（決算整理前）に修正記入（決算整理仕訳）を加え、
 * 収益・費用は損益計算書の欄へ、それ以外は貸借対照表の欄へ移す。
 */
export function worksheet(before: Entry[], adjustments: Entry[]): Worksheet {
  const trial = netBalances(before);
  const adj = { debit: new Map<AccountName, number>(), credit: new Map<AccountName, number>() };
  for (const e of adjustments) {
    for (const side of ["debit", "credit"] as const) for (const l of e[side]) adj[side].set(l.account, (adj[side].get(l.account) ?? 0) + l.amount);
  }
  const rows: WorksheetRow[] = [];
  let netIncome = 0;
  for (const account of Object.keys(ACCOUNTS) as AccountName[]) {
    const t = trial.get(account) ?? 0;
    const ad = adj.debit.get(account) ?? 0;
    const ac = adj.credit.get(account) ?? 0;
    if (t === 0 && ad === 0 && ac === 0) continue;
    const after = t + ad - ac;
    const cat = categoryOf(account);
    const toIncome = cat === "revenue" || cat === "expense";
    if (toIncome) netIncome -= after;
    const none = { debit: 0, credit: 0 };
    rows.push({ account, trial: split(t), adjust: { debit: ad, credit: ac }, income: toIncome ? split(after) : none, balance: toIncome ? none : split(after) });
  }
  // 利益は損益計算書の借方と貸借対照表の貸方に書いて、左右をそろえる
  const netIncomeRow = { income: split(netIncome), balance: split(-netIncome) };
  const total = (k: keyof Omit<WorksheetRow, "account">, extra: Pair = { debit: 0, credit: 0 }): Pair => ({
    debit: rows.reduce((a, r) => a + r[k].debit, extra.debit),
    credit: rows.reduce((a, r) => a + r[k].credit, extra.credit),
  });
  return {
    rows,
    netIncome,
    netIncomeRow,
    totals: { trial: total("trial"), adjust: total("adjust"), income: total("income", netIncomeRow.income), balance: total("balance", netIncomeRow.balance) },
  };
}
