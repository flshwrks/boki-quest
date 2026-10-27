import {
  type AccountName,
  type Side,
  CATEGORY_LABEL,
  SIDE_LABEL,
  categoryOf,
  homeSide,
} from "./accounts";
import { fmt } from "./format";

export interface Line {
  account: AccountName;
  amount: number;
}

export interface Entry {
  debit: Line[];
  credit: Line[];
}

export function sumAmounts(xs: { amount: number }[]): number {
  return xs.reduce((sum, x) => sum + x.amount, 0);
}

/** 行のうち、その科目の金額の合計 */
export const sumOf = (lines: Line[], account: AccountName) => sumAmounts(lines.filter((l) => l.account === account));

/** [科目, 金額] の組から仕訳を組み立てる */
export function entry(debit: [AccountName, number][], credit: [AccountName, number][]): Entry {
  return {
    debit: debit.map(([account, amount]) => ({ account, amount })),
    credit: credit.map(([account, amount]) => ({ account, amount })),
  };
}

/** 1行も記入されていない仕訳か */
export const isEmptyEntry = (e: Entry) => e.debit.length === 0 && e.credit.length === 0;

export function isBalanced(entry: Entry): boolean {
  const d = sumAmounts(entry.debit);
  return d > 0 && d === sumAmounts(entry.credit);
}

/** 同じ科目の行を合算し、科目→金額の対応にする（行の順序や分け方の違いを吸収する） */
function aggregate(lines: Line[]): Map<AccountName, number> {
  const map = new Map<AccountName, number>();
  for (const l of lines) map.set(l.account, (map.get(l.account) ?? 0) + l.amount);
  return map;
}

function sameSide(a: Line[], b: Line[]): boolean {
  const ma = aggregate(a);
  const mb = aggregate(b);
  if (ma.size !== mb.size) return false;
  for (const [k, v] of ma) if (mb.get(k) !== v) return false;
  return true;
}

export function sameEntry(a: Entry, b: Entry): boolean {
  return sameSide(a.debit, b.debit) && sameSide(a.credit, b.credit);
}

export type MistakeKind = "incomplete" | "unbalanced" | "reversed" | "account" | "amount";

export type Diagnosis = { ok: true } | { ok: false; kind: MistakeKind; messages: string[] };

/** 入力を正解と比べ、どこが違うかを初心者にわかる言葉で返す */
export function diagnose(input: Entry, answer: Entry): Diagnosis {
  if (input.debit.length === 0 || input.credit.length === 0) {
    return { ok: false, kind: "incomplete", messages: ["借方と貸方の両方に記入しよう。仕訳は必ず左右セットだよ。"] };
  }
  if (input.debit.some((l) => !(l.amount > 0)) || input.credit.some((l) => !(l.amount > 0))) {
    return { ok: false, kind: "incomplete", messages: ["金額が入っていない行があるよ。"] };
  }
  if (sameEntry(input, answer)) return { ok: true };

  if (sameEntry({ debit: input.credit, credit: input.debit }, answer)) {
    return {
      ok: false,
      kind: "reversed",
      messages: ["科目と金額は合っているけど、借方と貸方が逆になっているよ。増えたのか減ったのかを考え直してみよう。"],
    };
  }

  if (!isBalanced(input)) {
    return {
      ok: false,
      kind: "unbalanced",
      messages: [
        `借方合計 ${fmt(sumAmounts(input.debit))} と貸方合計 ${fmt(sumAmounts(input.credit))} が一致していないよ。仕訳の左右は必ず同じ金額になるんだ。`,
      ],
    };
  }

  const messages: string[] = [];
  let accountWrong = false;
  for (const side of ["debit", "credit"] as const) {
    const got = aggregate(input[side]);
    const want = aggregate(answer[side]);
    for (const [acc] of got) {
      if (!want.has(acc)) {
        accountWrong = true;
        messages.push(`${SIDE_LABEL[side]}の「${acc}」は、この取引では使わないよ。`);
      }
    }
    for (const [acc, amt] of want) {
      if (!got.has(acc)) {
        accountWrong = true;
        messages.push(`${SIDE_LABEL[side]}に足りない科目がある。${CATEGORY_LABEL[categoryOf(acc)]}の科目を見直そう。`);
      } else if (got.get(acc) !== amt) {
        messages.push(`${SIDE_LABEL[side]}の「${acc}」の金額が違うよ。`);
      }
    }
  }
  return { ok: false, kind: accountWrong ? "account" : "amount", messages };
}

/** 1行ごとの「なぜその側に書くか」を説明する */
export function explainLine(line: Line, side: Side): string {
  const cat = categoryOf(line.account);
  const label = CATEGORY_LABEL[cat];
  const home = homeSide(cat);
  if (home === null) {
    return `${line.account}は原因がわかるまでの仮の科目。今回は${SIDE_LABEL[side]}に記入する。`;
  }
  const change = home === side ? "増えた" : "減った";
  return `${line.account}（${label}）が${change} → ${SIDE_LABEL[side]}`;
}

/** 科目名を伏せて「どの区分が左右に何個あるか」だけを伝えるヒント */
export function categoryHint(answer: Entry): string {
  const describe = (lines: Line[]) => {
    const counts = new Map<string, number>();
    for (const l of lines) {
      const label = CATEGORY_LABEL[categoryOf(l.account)];
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts].map(([label, n]) => `${label}${n > 1 ? `×${n}` : ""}`).join("・");
  };
  return `借方には「${describe(answer.debit)}」、貸方には「${describe(answer.credit)}」の科目が入るよ。`;
}
