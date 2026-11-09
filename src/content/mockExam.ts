// 模擬試験の第2問・第3問。数字は毎回変わり、答えは仕訳エンジンで計算する（手で答えを書かない）

import { type AccountName, type Side, categoryOf, homeSide, inMasterOrder, statementLabel } from "@/engine/accounts";
import { type Entry, entry, sumAmounts } from "@/engine/journal";
import {
  type Pair,
  type WorksheetRow,
  contrasUnder,
  retainedEarnings,
  statements,
  totalsOf,
  trialBalance,
  trialBalanceTotals,
  worksheet,
} from "@/engine/ledger";
import { fmt } from "@/engine/format";
import { type Rand, shuffle } from "@/game/random";
import type { FillBlank, FillCell, FillProblem, FillTable, PracticeStep } from "@/game/types";
import { pick } from "./eventKit";

/** lo 以上 hi 以下の整数 */
const ri = (rand: Rand, lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

/** unit 円単位の金額（lo〜hi 倍） */
const amt = (rand: Rand, unit: number) => (lo: number, hi: number) => unit * ri(rand, lo, hi);

/** 借方・貸方が1行ずつの仕訳 */
const flow = (debit: AccountName, credit: AccountName, amount: number) => entry([[debit, amount]], [[credit, amount]]);

/** 空欄を作りながら答案用紙を組み立てる。配点は最後に合計点から割り振る */
function blanks() {
  const list: FillBlank[] = [];
  const add = (b: Omit<FillBlank, "points">, prefix?: string): FillCell => {
    list.push({ ...b, points: 0 });
    return { blank: list.length - 1, prefix };
  };
  return {
    list,
    amount: (answer: number, prefix?: string, why?: string) => add({ kind: "amount", answer, why }, prefix),
    select: (answer: string, options: string[], why?: string) => add({ kind: "select", answer, options, why }),
    multi: (answer: string[], options: string[], why?: string) => add({ kind: "multi", answer, options, why }),
    /** total 点をなるべく均等に割り振る（端数は前の空欄から1点ずつ）。空欄が total より多いと0点の空欄ができるので、作る側の誤り */
    score(total: number): FillBlank[] {
      if (list.length > total) throw new Error(`空欄が${list.length}個あり、${total}点では1点ずつ配れない`);
      const base = Math.floor(total / list.length);
      const extra = total - base * list.length;
      return list.map((b, i) => ({ ...b, points: base + (i < extra ? 1 : 0) }));
    },
  };
}

/** focus の科目なら金額を空欄に、そうでなければ金額を書いたセル。why はその欄の求め方 */
const focusCell =
  (b: ReturnType<typeof blanks>, focus: Set<AccountName>, why?: (account: AccountName) => string) =>
  (account: AccountName, amount: number): FillCell =>
    focus.has(account) ? b.amount(amount, undefined, why?.(account)) : fmt(amount);

const sideName = (side: Side) => (side === "debit" ? "借方" : "貸方");

/**
 * 決算整理後の金額の求め方：「決算整理前の〇〇は X円。決算整理事項3で＋Y円 → Z円」。
 * 増える側（資産・費用は借方、負債・純資産・収益・控除科目は貸方）に書かれたら足し、反対側なら引く
 */
function adjustedWhy(trial: Entry, steps: PracticeStep[]) {
  const before = new Map(trialBalance([trial]).map((r) => [r.account, r]));
  return (account: AccountName): string => {
    const r = before.get(account);
    const home = homeSide(categoryOf(account)) ?? (r && r.credit > r.debit ? "credit" : "debit");
    const start = r ? (home === "debit" ? r.debit - r.credit : r.credit - r.debit) : 0;
    const moves = steps.flatMap((s) =>
      (["debit", "credit"] as const).flatMap((side) =>
        s.answer[side].filter((l) => l.account === account).map((l) => ({ label: s.label ?? "決算整理", amount: side === home ? l.amount : -l.amount })),
      ),
    );
    const end = start + moves.reduce((a, m) => a + m.amount, 0);
    const head = r ? `決算整理前の${account}は${fmt(start)}円。` : `${account}は決算整理前の試算表にない科目。`;
    if (moves.length === 0) return `${head}決算整理で変わらないので、そのまま${fmt(end)}円。`;
    const list = moves.map((m) => `${m.label}で${m.amount > 0 ? "＋" : "−"}${fmt(Math.abs(m.amount))}円`).join("、");
    return `${head}${list} → ${fmt(end)}円。`;
  };
}

const FISCAL = "当社（会計期間は4月1日から3月31日までの1年間）";

/** 勘定（T字）の表。最後に左右の合計の行をつける */
const ledgerTable = (title: string, rows: FillCell[][], total: number): FillTable => ({
  title,
  head: ["日付", "摘要", "金額", "日付", "摘要", "金額"],
  rows: [...rows, ["", "", fmt(total), "", "", fmt(total)]],
});

/** 摘要の選択肢：締め切りの言葉、費用の勘定、経過勘定、支払った口座 */
const ledgerOptions = (expense: AccountName, accrual: AccountName) => ["前期繰越", "次期繰越", "損益", expense, accrual, "普通預金"];

/** 第2問(1)の問題文の形。どちらの勘定記入も、最後の1文は共通 */
const ledgerProblemOf = (lead: string[], sheet: FillTable[], b: ReturnType<typeof blanks>, steps: PracticeStep[]): FillProblem => ({
  title: "第2問(1) 勘定記入",
  short: "第2問(1)",
  lesson: "ledgerclose",
  lead: [...lead, "次の各勘定の空欄に、適切な摘要または金額を記入しなさい。"],
  sheet,
  blanks: b.score(10),
  steps,
});

// ───────── 第2問(1) 勘定記入 ─────────

/** 保険料の前払い：支払保険料勘定と前払保険料勘定 */
function prepaidLedger(rand: Rand): FillProblem {
  const m = ri(rand, 6, 12);
  const prev = 12000 * ri(rand, 3, 6);
  const now = prev + 12000 * ri(rand, 0, 2);
  // 4月から支払月の前月までが、翌期の分（前払い）
  const months = m - 4;
  const x0 = (prev * months) / 12;
  const x1 = (now * months) / 12;
  const b = blanks();
  const opts = ledgerOptions("支払保険料", "前払保険料");
  const sheet = [
    ledgerTable(
      "支払保険料",
      [
        [
          "4/1",
          b.select("前払保険料", opts, "期首の再振替仕訳は（借）支払保険料／（貸）前払保険料。支払保険料の借方に書くので、摘要は相手の科目「前払保険料」。"),
          fmt(x0),
          "3/31",
          "前払保険料",
          b.amount(x1, undefined, `決算の仕訳（借）前払保険料／（貸）支払保険料の金額。翌期の${months}か月分：${fmt(now)} × ${months}/12 = ${fmt(x1)}円。`),
        ],
        [
          `${m}/1`,
          "普通預金",
          fmt(now),
          "3/31",
          "損益",
          b.amount(
            x0 + now - x1,
            undefined,
            `当期の費用（勘定の残高）を「損益」に振り替える。借方の${fmt(x0)} + ${fmt(now)}から、貸方の前払分${fmt(x1)}を引いて${fmt(x0 + now - x1)}円。これで左右の合計がそろう。`,
          ),
        ],
      ],
      x0 + now,
    ),
    ledgerTable(
      "前払保険料",
      [
        ["4/1", b.select("前期繰越", opts, "前期末に繰り越した残高は、期首に「前期繰越」として借方（資産の増える側）に書く。"), fmt(x0), "4/1", "支払保険料", fmt(x0)],
        [
          "3/31",
          "支払保険料",
          b.amount(x1, undefined, `決算の仕訳（借）前払保険料 ${fmt(x1)}円を借方に書く。摘要は相手の科目「支払保険料」。`),
          "3/31",
          b.select("次期繰越", opts, "期末に残った前払保険料は、「次期繰越」として貸方に書いて締め切る（翌期首に前期繰越になる）。"),
          fmt(x1),
        ],
      ],
      x0 + x1,
    ),
  ];
  return ledgerProblemOf(
    [
      `${FISCAL}は、毎年${m}月1日に向こう1年分の保険料を普通預金口座から支払っている。前期の支払額は${fmt(prev)}円、当期の支払額は${fmt(now)}円である。`,
      "決算では前払分を月割で前払保険料勘定に振り替え、翌期首に再振替仕訳を行っている。",
    ],
    sheet,
    b,
    [
      {
        text: "4月1日（期首）：前期末に計上した前払保険料を、支払保険料勘定に戻す（再振替仕訳）。",
        answer: flow("支払保険料", "前払保険料", x0),
        note: `前期に払った${fmt(prev)}円のうち、当期の4月〜${m - 1}月の${months}か月分が前払いだった。${fmt(prev)} × ${months}/12 = ${fmt(x0)}円。`,
      },
      { text: `${m}月1日：向こう1年分の保険料${fmt(now)}円を普通預金口座から支払った。`, answer: flow("支払保険料", "普通預金", now) },
      {
        text: "3月31日（決算）：当期に支払った保険料のうち、翌期の分を前払保険料勘定に振り替える。",
        answer: flow("前払保険料", "支払保険料", x1),
        note: `翌期の4月〜${m - 1}月の${months}か月分。${fmt(now)} × ${months}/12 = ${fmt(x1)}円。支払保険料勘定の残り${fmt(x0 + now - x1)}円は「損益」に振り替えて締め切り、前払保険料勘定は「次期繰越」で締め切る。`,
      },
    ],
  );
}

const MONTH_END: Record<number, number> = { 6: 30, 7: 31, 8: 31, 9: 30, 10: 31, 11: 30 };

/** 利息の未払い：支払利息勘定と未払利息勘定 */
function accruedLedger(rand: Rand): FillProblem {
  const loan = pick(rand, [1200000, 2400000, 3600000]);
  const rate = pick(rand, [2, 3]);
  const m = ri(rand, 6, 11);
  const paid = (loan * rate) / 100;
  // 支払月の翌月から3月までが、まだ払っていない分
  const x = (paid * (15 - m)) / 12;
  const b = blanks();
  const opts = ledgerOptions("支払利息", "未払利息");
  const sheet = [
    ledgerTable(
      "支払利息",
      [
        [`${m}/${MONTH_END[m]}`, "普通預金", fmt(paid), "4/1", "未払利息", fmt(x)],
        [
          "3/31",
          b.select("未払利息", opts, "決算の仕訳は（借）支払利息／（貸）未払利息。支払利息の借方に書くので、摘要は相手の科目「未払利息」。"),
          fmt(x),
          "3/31",
          "損益",
          b.amount(paid, undefined, `当期の費用（勘定の残高）を「損益」に振り替える。借方の${fmt(paid)} + ${fmt(x)}から、貸方の再振替${fmt(x)}を引いて${fmt(paid)}円。`),
        ],
      ],
      paid + x,
    ),
    ledgerTable(
      "未払利息",
      [
        [
          "4/1",
          b.select("支払利息", opts, "期首の再振替仕訳は（借）未払利息／（貸）支払利息。未払利息の借方に書くので、摘要は相手の科目「支払利息」。"),
          fmt(x),
          "4/1",
          b.select("前期繰越", opts, "前期末に繰り越した未払利息（負債）は、期首に「前期繰越」として貸方（負債の増える側）に書く。"),
          fmt(x),
        ],
        [
          "3/31",
          "次期繰越",
          fmt(x),
          "3/31",
          "支払利息",
          b.amount(x, undefined, `決算の仕訳（貸）未払利息の金額。${m + 1}月〜3月の${15 - m}か月分：${fmt(loan)} × ${rate}% × ${15 - m}/12 = ${fmt(x)}円。`),
        ],
      ],
      x * 2,
    ),
  ];
  return ledgerProblemOf(
    [
      `${FISCAL}は、前期から借入金${fmt(loan)}円（年利${rate}％）があり、毎年${m}月末日に過去1年分の利息を普通預金口座から支払っている。`,
      "決算では未払分を月割で未払利息勘定に計上し、翌期首に再振替仕訳を行っている。借入金の額と利率は前期から変わっていない。",
    ],
    sheet,
    b,
    [
      {
        text: "4月1日（期首）：前期末に計上した未払利息を、支払利息勘定に戻す（再振替仕訳）。",
        answer: flow("未払利息", "支払利息", x),
        note: `前期末の未払分は、${m + 1}月〜3月の${15 - m}か月分。${fmt(loan)} × ${rate}% × ${15 - m}/12 = ${fmt(x)}円。`,
      },
      { text: `${m}月${MONTH_END[m]}日：過去1年分の利息${fmt(paid)}円を普通預金口座から支払った。`, answer: flow("支払利息", "普通預金", paid) },
      {
        text: "3月31日（決算）：利息の未払分を月割で計上する。",
        answer: flow("支払利息", "未払利息", x),
        note: `当期も${m + 1}月〜3月の${15 - m}か月分が未払いで${fmt(x)}円。支払利息勘定の残高は ${fmt(paid)} + ${fmt(x)} − ${fmt(x)} = ${fmt(paid)}円で、「損益」に振り替えて締め切る。`,
      },
    ],
  );
}

/** 家賃の前受け：受取家賃勘定と前受家賃勘定（収益の側の経過勘定） */
function unearnedLedger(rand: Rand): FillProblem {
  const m = ri(rand, 6, 12);
  const monthly = 1000 * ri(rand, 8, 20);
  const raise = 1000 * ri(rand, 0, 3);
  // 4月から受取月の前月までが、翌期の分（前受け）
  const months = m - 4;
  const x0 = monthly * months;
  const now = (monthly + raise) * 12;
  const x1 = (monthly + raise) * months;
  const b = blanks();
  const opts = ledgerOptions("受取家賃", "前受家賃");
  const sheet = [
    ledgerTable(
      "受取家賃",
      [
        [
          "3/31",
          b.select("前受家賃", opts, "決算の仕訳は（借）受取家賃／（貸）前受家賃。受取家賃の借方に書くので、摘要は相手の科目「前受家賃」。"),
          b.amount(x1, undefined, `翌期の${months}か月分は当期の収益ではないので、前受家賃に振り替える：月額${fmt(monthly + raise)} × ${months}か月 = ${fmt(x1)}円。`),
          "4/1",
          "前受家賃",
          fmt(x0),
        ],
        [
          "3/31",
          "損益",
          b.amount(
            x0 + now - x1,
            undefined,
            `当期の収益（勘定の残高）を「損益」に振り替える。貸方の${fmt(x0)} + ${fmt(now)}から、借方の前受分${fmt(x1)}を引いて${fmt(x0 + now - x1)}円。`,
          ),
          `${m}/1`,
          "普通預金",
          fmt(now),
        ],
      ],
      x0 + now,
    ),
    ledgerTable(
      "前受家賃",
      [
        [
          "4/1",
          b.select("受取家賃", opts, "期首の再振替仕訳は（借）前受家賃／（貸）受取家賃。前受家賃の借方に書くので、摘要は相手の科目「受取家賃」。"),
          fmt(x0),
          "4/1",
          b.select("前期繰越", opts, "前期末に繰り越した前受家賃（負債）は、期首に「前期繰越」として貸方（負債の増える側）に書く。"),
          fmt(x0),
        ],
        [
          "3/31",
          b.select("次期繰越", opts, "期末に残った前受家賃は、「次期繰越」として借方に書いて締め切る。"),
          fmt(x1),
          "3/31",
          "受取家賃",
          b.amount(x1, undefined, `決算の仕訳（貸）前受家賃 ${fmt(x1)}円を貸方に書く。摘要は相手の科目「受取家賃」。`),
        ],
      ],
      x0 + x1,
    ),
  ];
  return ledgerProblemOf(
    [
      `${FISCAL}は、所有する建物の一部を賃貸しており、毎年${m}月1日に向こう1年分の家賃を普通預金口座で受け取っている。前期の家賃は月額${fmt(monthly)}円、当期は月額${fmt(monthly + raise)}円である。`,
      "決算では前受分を月割で前受家賃勘定に振り替え、翌期首に再振替仕訳を行っている。",
    ],
    sheet,
    b,
    [
      {
        text: "4月1日（期首）：前期末に計上した前受家賃を、受取家賃勘定に戻す（再振替仕訳）。",
        answer: flow("前受家賃", "受取家賃", x0),
        note: `前期に受け取った1年分のうち、当期の4月〜${m - 1}月の${months}か月分が前受けだった。${fmt(monthly)} × ${months}か月 = ${fmt(x0)}円。`,
      },
      { text: `${m}月1日：向こう1年分の家賃${fmt(now)}円を普通預金口座で受け取った。`, answer: flow("普通預金", "受取家賃", now) },
      {
        text: "3月31日（決算）：当期に受け取った家賃のうち、翌期の分を前受家賃勘定に振り替える。",
        answer: flow("受取家賃", "前受家賃", x1),
        note: `翌期の4月〜${m - 1}月の${months}か月分。${fmt(monthly + raise)} × ${months}か月 = ${fmt(x1)}円。受取家賃勘定の残り${fmt(x0 + now - x1)}円は「損益」に振り替えて締め切る。`,
      },
    ],
  );
}

export const ledgerProblem = (rand: Rand) => pick(rand, [prepaidLedger, accruedLedger, unearnedLedger])(rand);

// ───────── 第2問(2) 補助簿の選択 ─────────

export const SUB_BOOKS = [
  "現金出納帳",
  "当座預金出納帳",
  "仕入帳",
  "売上帳",
  "商品有高帳",
  "売掛金元帳",
  "買掛金元帳",
  "受取手形記入帳",
  "支払手形記入帳",
  "固定資産台帳",
];

/** 取引と、記入する補助簿（答え）と、その仕訳。補助簿は仕訳に出る科目から決まる */
export const SUB_BOOK_CASES: [string, string[], string][] = [
  ["商品80,000円を仕入れ、代金のうち半額は約束手形を振り出して支払い、残額は掛けとした。", ["仕入帳", "商品有高帳", "支払手形記入帳", "買掛金元帳"], "（借）仕入 80,000／（貸）支払手形 40,000・買掛金 40,000"],
  ["商品120,000円を売り上げ、代金は得意先振出しの約束手形で受け取った。", ["売上帳", "商品有高帳", "受取手形記入帳"], "（借）受取手形 120,000／（貸）売上 120,000"],
  ["売掛金60,000円が当座預金口座に振り込まれた。", ["当座預金出納帳", "売掛金元帳"], "（借）当座預金 60,000／（貸）売掛金 60,000"],
  ["備品250,000円を購入し、代金は月末に支払うこととした。", ["固定資産台帳"], "（借）備品 250,000／（貸）未払金 250,000（未払金を記入する補助簿はない）"],
  ["掛けで仕入れた商品のうち5,000円を品違いのため返品した。", ["仕入帳", "商品有高帳", "買掛金元帳"], "（借）買掛金 5,000／（貸）仕入 5,000"],
  ["商品90,000円を売り上げ、代金のうち30,000円は現金で受け取り、残額は掛けとした。", ["現金出納帳", "売上帳", "商品有高帳", "売掛金元帳"], "（借）現金 30,000・売掛金 60,000／（貸）売上 90,000"],
  ["買掛金45,000円を小切手を振り出して支払った。", ["当座預金出納帳", "買掛金元帳"], "（借）買掛金 45,000／（貸）当座預金 45,000"],
  ["かねて受け取っていた約束手形70,000円が満期となり、当座預金口座に入金された。", ["当座預金出納帳", "受取手形記入帳"], "（借）当座預金 70,000／（貸）受取手形 70,000"],
  ["商品50,000円を掛けで仕入れ、引取運賃2,000円は現金で支払った。", ["現金出納帳", "仕入帳", "商品有高帳", "買掛金元帳"], "（借）仕入 52,000／（貸）買掛金 50,000・現金 2,000"],
  ["備品（取得原価300,000円、減価償却累計額180,000円）を100,000円で売却し、代金は現金で受け取った。", ["現金出納帳", "固定資産台帳"], "（借）備品減価償却累計額 180,000・現金 100,000・固定資産売却損 20,000／（貸）備品 300,000"],
  ["かねて振り出していた約束手形40,000円が満期となり、当座預金口座から支払われた。", ["当座預金出納帳", "支払手形記入帳"], "（借）支払手形 40,000／（貸）当座預金 40,000"],
  ["掛けで売り上げた商品のうち8,000円が品違いのため返品された。", ["売上帳", "商品有高帳", "売掛金元帳"], "（借）売上 8,000／（貸）売掛金 8,000"],
  ["商品の注文にあたり、手付金20,000円を現金で支払った。", ["現金出納帳"], "（借）前払金 20,000／（貸）現金 20,000（商品はまだ受け取っていないので仕入ではない。前払金の補助簿はない）"],
];

export function subBookProblem(rand: Rand): FillProblem {
  const b = blanks();
  const rows: FillCell[][] = shuffle(SUB_BOOK_CASES, rand)
    .slice(0, 5)
    .map(([text, books, journal], i) => [
      `(${i + 1})`,
      text,
      b.multi(books, SUB_BOOKS, `仕訳は ${journal}。仕訳に出てくる科目から選ぶと「${books.join("・")}」。${books.includes("商品有高帳") ? "商品が出入りするので商品有高帳にも書く。" : ""}`),
    ]);
  return {
    title: "第2問(2) 補助簿の選択",
    short: "第2問(2)",
    lesson: "subbooks",
    lead: ["次の各取引は、どの補助簿に記入されるか。記入される補助簿をすべて選びなさい（各問すべて正しく選んで正解）。"],
    sheet: [{ head: ["", "取引", "記入する補助簿"], rows }],
    blanks: b.score(10),
  };
}

// ───────── 第3問 決算整理後の財務諸表 ─────────

type Lines = [AccountName, number][];

interface ClosingCase {
  trial: Entry;
  items: string[];
  adjustments: Entry[];
  /** 決算整理事項ごとの決算整理仕訳（売上原価は2つ） */
  steps: PracticeStep[];
  /** 答え合わせで空欄にする科目（決算整理で金額が変わるもの） */
  focus: Set<AccountName>;
}

/**
 * 決算整理前残高試算表と決算整理事項を作る（本番と同じく、未処理事項・当座借越・消費税・期中取得の月割償却なども出る）。
 * 利益がほどよい額になるよう売上を決め、最後に貸借の差を普通預金で埋める
 */
function closingCase(rand: Rand): ClosingCase {
  const d: Partial<Record<AccountName, number>> = {};
  const c: Partial<Record<AccountName, number>> = {};
  const items: string[] = [];
  // 決算整理仕訳は steps だけに持ち、adjustments はそこから作る（2つの配列がずれないように）
  const steps: PracticeStep[] = [];
  const adj = () => steps.map((s) => s.answer);
  /** 直前に items へ足した決算整理事項の仕訳。売上原価のように2つあるときは mark（①②）で分ける */
  const post = (e: Entry, note: string, suffix = "", mark = "") =>
    steps.push({ label: `決算整理事項${items.length}${mark}`, text: `${items.at(-1)}${suffix}`, answer: e, note });
  const focus = new Set<AccountName>([
    "仕入",
    "繰越商品",
    "貸倒引当金",
    "減価償却費",
    "備品減価償却累計額",
    "支払保険料",
    "前払保険料",
    "支払利息",
    "未払利息",
    "法人税、住民税及び事業税",
    "未払法人税等",
  ]);

  d.現金 = 10000 * ri(rand, 15, 40);
  const receivable = 10000 * ri(rand, 40, 90);
  d.売掛金 = receivable;
  d.繰越商品 = 10000 * ri(rand, 15, 35);
  // 建物と備品（本番では2つ以上の固定資産を償却することが多い）
  const buildingLife = pick(rand, [20, 25, 30]);
  const buildingDep = 10000 * ri(rand, 4, 12);
  d.建物 = buildingDep * buildingLife;
  c.建物減価償却累計額 = buildingDep * ri(rand, 2, buildingLife - 5);
  const life = pick(rand, [4, 5, 6, 8]);
  const dep = 10000 * ri(rand, 8, 20);
  d.備品 = dep * life;
  c.備品減価償却累計額 = dep * ri(rand, 1, life - 2);
  c.買掛金 = 10000 * ri(rand, 30, 70);
  const loan = pick(rand, [600000, 1200000, 2400000]);
  c.借入金 = loan;
  c.資本金 = 1000000;
  c.貸倒引当金 = 1000 * ri(rand, 2, 6);
  c.受取手数料 = 1000 * ri(rand, 20, 80);
  d.仕入 = 10000 * ri(rand, 250, 450);
  d.給料 = 10000 * ri(rand, 120, 240);
  d.支払家賃 = 10000 * ri(rand, 24, 60);
  d.水道光熱費 = 1000 * ri(rand, 80, 200);
  d.通信費 = 1000 * ri(rand, 20, 60);
  d.旅費交通費 = 1000 * ri(rand, 20, 60);
  const premium = 12000 * ri(rand, 3, 8);
  const pm = ri(rand, 6, 12);
  // 期首の再振替（前期の前払分）＋当期に払った1年分
  d.支払保険料 = (premium * (12 + pm - 4)) / 12;
  // 売掛金の期末残高（未処理の回収・仮受金の判明で減る。貸倒引当金のもと）
  let receivableEnd = receivable;

  // 1. 未処理事項（本番では決算整理事項の前に出ることが多い）
  const pending = rand();
  if (pending < 0.35) {
    const paid = 10000 * ri(rand, 3, 9);
    receivableEnd -= paid;
    items.push(`得意先から売掛金${fmt(paid)}円が普通預金口座に振り込まれていたが、未処理であった。`);
    post(
      entry([["普通預金", paid]], [["売掛金", paid]]),
      "記帳していなかった取引は、決算でまず正しく記帳する（未処理事項）。普通預金が増え、売掛金が減る。売掛金の期末残高が減るので、貸倒引当金の計算のもとも変わる。",
    );
    focus.add("普通預金").add("売掛金");
  } else if (pending < 0.7) {
    const advance = 10000 * ri(rand, 3, 6);
    const spent = advance - 1000 * ri(rand, 2, 9);
    d.仮払金 = advance;
    items.push(
      `仮払金${fmt(advance)}円は、従業員の出張にあたり旅費の概算額を渡したものである。出張から戻った従業員から旅費${fmt(spent)}円の報告を受け、残額を現金で受け取っていたが、未処理であった。`,
    );
    post(
      entry(
        [
          ["旅費交通費", spent],
          ["現金", advance - spent],
        ],
        [["仮払金", advance]],
      ),
      `概算で渡した仮払金${fmt(advance)}円を取り崩す。使った${fmt(spent)}円は旅費交通費、戻ってきた${fmt(advance - spent)}円は現金。`,
    );
    focus.add("旅費交通費").add("現金");
  }
  // 2. 現金過不足
  if (rand() < 0.5) {
    const diff = 1000 * ri(rand, 3, 8);
    const found = 1000 * ri(rand, 1, diff / 1000 - 1);
    d.現金過不足 = diff;
    items.push(
      `現金過不足${fmt(diff)}円（借方残高）のうち${fmt(found)}円は、通信費の記入漏れと判明した。残額は原因が不明のため、雑損として処理する。`,
    );
    post(
      entry(
        [
          ["通信費", found],
          ["雑損", diff - found],
        ],
        [["現金過不足", diff]],
      ),
      `借方残高の現金過不足は、実際の現金が帳簿より少なかった分。判明した通信費${fmt(found)}円を計上し、原因不明の${fmt(diff - found)}円は雑損にする。現金過不足は貸方に書いてゼロにする。`,
    );
    focus.add("通信費").add("雑損");
  }
  // 3. 仮受金
  if (rand() < 0.5) {
    const collected = 10000 * ri(rand, 2, 8);
    receivableEnd -= collected;
    c.仮受金 = collected;
    items.push(`仮受金${fmt(collected)}円は、得意先からの売掛金の回収であることが判明した。`);
    post(entry([["仮受金", collected]], [["売掛金", collected]]), "内容が分かったので仮受金を減らし、売掛金を減らす。この回収で、売掛金の期末残高（貸倒引当金の計算のもと）も減る。");
    focus.add("売掛金");
  }
  // 4. 当座借越（当座預金が貸方残高になっている）
  if (rand() < 0.4) {
    const overdraft = 10000 * ri(rand, 5, 20);
    c.当座預金 = overdraft;
    items.push(`当座預金勘定の貸方残高${fmt(overdraft)}円を、当座借越勘定に振り替える。`);
    post(
      entry([["当座預金", overdraft]], [["当座借越", overdraft]]),
      `当座預金の貸方残高は、預金を超えて引き出した分（銀行からの借入れ）。決算では負債の「当座借越」に振り替え、当座預金はゼロにする。`,
    );
    focus.add("当座借越");
  } else {
    d.当座預金 = 10000 * ri(rand, 20, 60);
  }
  // 5. 売上原価（期末商品の棚卸）
  const ending = 10000 * ri(rand, 15, 35);
  items.push(`期末商品の棚卸高は${fmt(ending)}円である。売上原価は「仕入」の行で計算すること。`);
  post(
    entry([["仕入", d.繰越商品]], [["繰越商品", d.繰越商品]]),
    `試算表の繰越商品${fmt(d.繰越商品)}円は期首の在庫。売れた分の原価に含めるため、仕入に足す（しーくり）。`,
    "（①期首の商品）",
    "①",
  );
  post(
    entry([["繰越商品", ending]], [["仕入", ending]]),
    `売れ残った期末の在庫${fmt(ending)}円を仕入から引き、繰越商品にする（くりしー）。売上原価 = ${fmt(d.仕入)} + ${fmt(d.繰越商品)} − ${fmt(ending)} = ${fmt(d.仕入 + d.繰越商品 - ending)}円。`,
    "（②期末の商品）",
    "②",
  );
  // 6. 貸倒引当金（差額補充法）
  const rate = pick(rand, [2, 3]);
  const allowance = (receivableEnd * rate) / 100;
  items.push(`売掛金の期末残高に対して${rate}％の貸倒引当金を、差額補充法により設定する。`);
  const gap = allowance - c.貸倒引当金;
  const allowanceNote = `売掛金の期末残高${fmt(receivableEnd)}円 × ${rate}% = ${fmt(allowance)}円。試算表の貸倒引当金${fmt(c.貸倒引当金)}円との差額だけを`;
  if (gap > 0) post(entry([["貸倒引当金繰入", gap]], [["貸倒引当金", gap]]), `${allowanceNote}繰り入れる（${fmt(gap)}円）。`);
  if (gap < 0) post(entry([["貸倒引当金", -gap]], [["貸倒引当金戻入", -gap]]), `${allowanceNote}戻し入れる（${fmt(-gap)}円）。`);
  focus.add(gap >= 0 ? "貸倒引当金繰入" : "貸倒引当金戻入");
  // 7. 減価償却（建物と備品。備品の一部は期中に買ったもので月割）
  let equipmentDep = dep;
  let newNote = "";
  let newText = "";
  if (rand() < 0.5) {
    const bm = pick(rand, [10, 11, 12, 1, 2]);
    const used = bm >= 4 ? 16 - bm : 4 - bm;
    const newCost = life * 12 * 1000 * ri(rand, 2, 6);
    const newDep = (newCost / life) * (used / 12);
    d.備品 += newCost;
    equipmentDep += newDep;
    newText = `なお、備品のうち${fmt(newCost)}円は当期の${bm}月1日に購入したもので、減価償却費は月割で計算する。`;
    newNote = `期中に買った備品は使った月数分だけ：${fmt(newCost)} ÷ ${life}年 × ${used}/12 = ${fmt(newDep)}円。`;
  }
  items.push(
    `建物について定額法（残存価額ゼロ、耐用年数${buildingLife}年）、備品について定額法（残存価額ゼロ、耐用年数${life}年）により減価償却を行う。${newText}`,
  );
  post(
    entry(
      [["減価償却費", buildingDep + equipmentDep]],
      [
        ["建物減価償却累計額", buildingDep],
        ["備品減価償却累計額", equipmentDep],
      ],
    ),
    `建物：${fmt(d.建物)} ÷ ${buildingLife}年 = ${fmt(buildingDep)}円。備品：${newNote ? `前期からある${fmt(dep * life)}円は ÷ ${life}年 = ${fmt(dep)}円。${newNote}合計${fmt(equipmentDep)}円。` : `${fmt(d.備品)} ÷ ${life}年 = ${fmt(dep)}円。`}間接法なので、建物・備品は減らさず、それぞれの減価償却累計額を増やす。`,
  );
  focus.add("建物減価償却累計額");
  // 8. 郵便切手の未使用分
  if (rand() < 0.5) {
    const stamps = 1000 * ri(rand, 2, 8);
    items.push(`購入時に通信費として処理した郵便切手のうち、${fmt(stamps)}円分が未使用である。`);
    post(entry([["貯蔵品", stamps]], [["通信費", stamps]]), "未使用の切手はまだ使える資産なので、通信費から差し引いて貯蔵品にする。");
    focus.add("通信費").add("貯蔵品");
  }
  // 9. 消費税（税抜方式）
  if (rand() < 0.6) {
    d.仮払消費税 = 10000 * ri(rand, 20, 40);
    c.仮受消費税 = 10000 * ri(rand, 45, 80);
    const due = c.仮受消費税 - d.仮払消費税;
    items.push("消費税の処理（税抜方式）を行う。");
    post(
      entry(
        [["仮受消費税", c.仮受消費税]],
        [
          ["仮払消費税", d.仮払消費税],
          ["未払消費税", due],
        ],
      ),
      `受け取った消費税（仮受消費税${fmt(c.仮受消費税)}円）から払った消費税（仮払消費税${fmt(d.仮払消費税)}円）を差し引いた${fmt(due)}円が、これから国に納める未払消費税。仮受・仮払はどちらもゼロにする。`,
    );
    focus.add("未払消費税");
  }
  // 10. 保険料の前払い
  const prepaid = (premium * (pm - 4)) / 12;
  items.push(`支払保険料は、毎年${pm}月1日に向こう1年分（毎年同額）を支払っているものである。前払分を月割で計上する。`);
  post(
    entry([["前払保険料", prepaid]], [["支払保険料", prepaid]]),
    `${pm}月1日に払った1年分のうち、翌期の4月〜${pm - 1}月の${pm - 4}か月分が前払い。${fmt(premium)} × ${pm - 4}/12 = ${fmt(prepaid)}円。`,
  );
  // 11. 利息の未払い（当期に借り入れ、利息は返済時に支払う）
  const lm = pick(rand, [10, 11, 12, 1, 2]);
  const months = lm >= 4 ? 16 - lm : 4 - lm;
  const loanRate = pick(rand, [2, 3]);
  const accrued = (((loan * loanRate) / 100) * months) / 12;
  items.push(
    `借入金は${lm}月1日に借入期間1年、年利${loanRate}％で借り入れたもので、利息は返済時に元金とともに支払う。利息の未払分を月割で計上する。`,
  );
  post(
    entry([["支払利息", accrued]], [["未払利息", accrued]]),
    `${lm}月1日から3月31日までの${months}か月分の利息がまだ払われていない。${fmt(loan)} × ${loanRate}% × ${months}/12 = ${fmt(accrued)}円。`,
  );

  // 12. 家賃の経過勘定（前受か未収のどちらか）
  const monthlyRent = 1000 * ri(rand, 5, 12);
  if (rand() < 0.5) {
    // 毎年 rm 月1日に向こう1年分を受け取る。試算表には期首の再振替分（rm−4か月）と当期の1年分が入っている
    const rm = ri(rand, 6, 12);
    const ahead = monthlyRent * (rm - 4);
    c.受取家賃 = monthlyRent * 12 + ahead;
    items.push(`受取家賃は、毎年${rm}月1日に向こう1年分（毎年同額）を受け取っているものである。前受分を月割で計上する。`);
    post(
      entry([["受取家賃", ahead]], [["前受家賃", ahead]]),
      `${rm}月1日に受け取った1年分のうち、翌期の4月〜${rm - 1}月の${rm - 4}か月分は前受け。${fmt(monthlyRent)} × ${rm - 4}か月 = ${fmt(ahead)}円。`,
    );
    focus.add("受取家賃").add("前受家賃");
  } else {
    const unpaid = ri(rand, 1, 3);
    c.受取家賃 = monthlyRent * (12 - unpaid);
    items.push(`受取家賃は月額${fmt(monthlyRent)}円であり、${unpaid}か月分が未収である。`);
    post(
      entry([["未収家賃", monthlyRent * unpaid]], [["受取家賃", monthlyRent * unpaid]]),
      `まだ受け取っていない当期分も収益に含める。${fmt(monthlyRent)} × ${unpaid}か月 = ${fmt(monthlyRent * unpaid)}円を未収家賃（資産）にする。`,
    );
    focus.add("受取家賃").add("未収家賃");
  }

  // 税引前当期純利益がほどよい額になるよう、売上を決める
  const pretaxWithoutSales = statements([entry(linesOf(d), linesOf({ ...c, 売上: 0 })), ...adj()]).netIncome;
  const target = 10000 * ri(rand, 30, 120);
  c.売上 = target - pretaxWithoutSales;
  // 13. 法人税等（中間納付は仮払法人税等）
  const tax = (target * 30) / 100;
  d.仮払法人税等 = 1000 * Math.floor((tax * ri(rand, 30, 60)) / 100 / 1000);
  items.push("法人税、住民税及び事業税として、税引前当期純利益の30％を計上する。なお、中間納付額は仮払法人税等で処理している。");
  post(
    entry(
      [["法人税、住民税及び事業税", tax]],
      [
        ["仮払法人税等", d.仮払法人税等],
        ["未払法人税等", tax - d.仮払法人税等],
      ],
    ),
    `ほかの決算整理をすべて済ませると、税引前当期純利益は${fmt(target)}円（収益 − 費用）。× 30% = ${fmt(tax)}円。中間納付の${fmt(d.仮払法人税等)}円を差し引いた${fmt(tax - d.仮払法人税等)}円が未払法人税等。`,
  );

  // 貸借の差を普通預金で埋める（少なすぎるときは、資本金を増やした会社にする）
  c.繰越利益剰余金 = 10000 * ri(rand, 10, 60);
  const sum = (x: typeof d) => linesOf(x).reduce((a, [, v]) => a + v, 0);
  d.普通預金 = 0;
  d.普通預金 = sum(c) - sum(d);
  while (d.普通預金 < 300000) {
    d.普通預金 += 1000000;
    c.資本金 += 1000000;
  }
  return {
    trial: entry(linesOf(d), linesOf(c)),
    items,
    adjustments: adj(),
    steps,
    focus,
  };
}

/** 勘定科目マスタの並びで、0でない科目だけを仕訳の行にする */
function linesOf(x: Partial<Record<AccountName, number>>): Lines {
  return inMasterOrder(Object.keys(x) as AccountName[])
    .filter((a) => x[a])
    .map((a) => [a, x[a] as number]);
}

export function closingProblem(rand: Rand): FillProblem {
  const { trial, items, adjustments, steps, focus } = closingCase(rand);
  const s = statements([trial, ...adjustments]);
  const b = blanks();
  const adjusted = adjustedWhy(trial, steps);
  const shown = (account: AccountName) => {
    const label = statementLabel(account);
    const contra = categoryOf(account) === "contra" ? "資産から差し引く形（△）で書く。" : "";
    return `${label !== account ? `表では「${label}」と表示する。` : ""}${contra}${adjusted(account)}`;
  };
  const cell = (account: AccountName, amount: number, prefix?: string): FillCell =>
    focus.has(account) ? b.amount(amount, prefix, shown(account)) : `${prefix ?? ""}${fmt(amount)}`;
  const revenue = sumAmounts(s.revenues);
  const expense = sumAmounts(s.expenses);

  // 損益計算書（勘定式）：左に費用と当期純利益、右に収益。問題は必ず黒字になるように作ってある
  const left: FillCell[][] = s.expenses.map((r) => [statementLabel(r.account), cell(r.account, r.amount)]);
  left.push([
    "当期純利益",
    b.amount(s.netIncome, undefined, `収益の合計${fmt(revenue)}円 − 費用の合計${fmt(expense)}円 = ${fmt(s.netIncome)}円。左右の合計をそろえるため、費用の側（左）に書く。`),
  ]);
  const right: FillCell[][] = s.revenues.map((r) => [statementLabel(r.account), cell(r.account, r.amount)]);
  const plTotal = sumAmounts(s.revenues);

  // 貸借対照表（勘定式）：控除科目は、差し引く資産のすぐ下に「△」で書く
  const under = contrasUnder(s);
  const assets: FillCell[][] = s.assets
    .filter((a) => categoryOf(a.account) === "asset")
    .flatMap((a) => [
      [statementLabel(a.account), cell(a.account, a.amount)],
      ...(under.get(a.account) ?? []).map((k) => [`　${statementLabel(k.account)}`, cell(k.account, k.amount, "△")]),
    ]);
  const claims: FillCell[][] = [
    ...s.liabilities.map((l): FillCell[] => [statementLabel(l.account), cell(l.account, l.amount)]),
    ...s.equity.map((e): FillCell[] =>
      e.account === "繰越利益剰余金"
        ? [
            e.account,
            b.amount(
              retainedEarnings(s),
              undefined,
              `試算表の繰越利益剰余金${fmt(e.amount)}円 ＋ 当期純利益${fmt(s.netIncome)}円 = ${fmt(retainedEarnings(s))}円（当期のもうけが純資産に加わる）。`,
            ),
          ]
        : [e.account, fmt(e.amount)],
    ),
  ];
  const bsTotal = sumAmounts(s.assets) - sumAmounts(s.contras);

  return {
    title: "第3問 決算整理後の財務諸表",
    short: "第3問",
    lesson: "closing",
    lead: [`次の決算整理前残高試算表と決算整理事項にもとづいて、${FISCAL}の損益計算書と貸借対照表の空欄を埋めなさい。`],
    given: [trialTable("決算整理前残高試算表", [trial])],
    items,
    sheet: [
      {
        title: "損益計算書",
        head: ["費用", "金額", "収益", "金額"],
        rows: [...zip(left, right), ["", fmt(plTotal), "", fmt(plTotal)]],
      },
      {
        title: "貸借対照表",
        head: ["資産", "金額", "負債及び純資産", "金額"],
        rows: [...zip(assets, claims), ["", fmt(bsTotal), "", fmt(bsTotal)]],
      },
    ],
    blanks: b.score(35),
    steps,
  };
}

/** 左右の表を1行ずつ横に並べる（短いほうは空欄で埋める） */
function zip(left: FillCell[][], right: FillCell[][]): FillCell[][] {
  return Array.from({ length: Math.max(left.length, right.length) }, (_, i) => [...(left[i] ?? ["", ""]), ...(right[i] ?? ["", ""])]);
}

/** 残高試算表の表（借方・勘定科目・貸方）。cell を渡すと、金額を空欄にできる */
function trialTable(title: string, entries: Entry[], cell?: (account: AccountName, amount: number) => FillCell): FillTable {
  const tb = trialBalance(entries);
  const show = (a: AccountName, x: number): FillCell => (x ? (cell ? cell(a, x) : fmt(x)) : "");
  const total = trialBalanceTotals(tb).debit;
  return {
    title,
    head: ["借方", "勘定科目", "貸方"],
    rows: [...tb.map((r) => [show(r.account, r.debit), r.account, show(r.account, r.credit)]), [fmt(total), "合計", fmt(total)]],
  };
}

/** 第3問（別形式）：決算整理後残高試算表を作る */
export function trialAfterProblem(rand: Rand): FillProblem {
  const { trial, items, adjustments, steps, focus } = closingCase(rand);
  const b = blanks();
  const sheet = trialTable("決算整理後残高試算表", [trial, ...adjustments], focusCell(b, focus, adjustedWhy(trial, steps)));
  const st = statements([trial, ...adjustments]);
  const net = st.netIncome;
  return {
    title: "第3問 決算整理後残高試算表",
    short: "第3問",
    lesson: "closing",
    lead: [`次の決算整理前残高試算表と決算整理事項にもとづいて、${FISCAL}の決算整理後残高試算表の空欄を埋め、当期純利益を答えなさい。`],
    given: [trialTable("決算整理前残高試算表", [trial])],
    items,
    sheet: [sheet, { title: "当期純利益", head: ["", "金額"], rows: [["当期純利益", b.amount(net, undefined, `収益の合計${fmt(sumAmounts(st.revenues))}円 − 費用の合計${fmt(sumAmounts(st.expenses))}円 = ${fmt(net)}円。`)]] }],
    blanks: b.score(35),
    steps,
  };
}

// ───────── 第2問(1) 商品有高帳 ─────────

interface Lot {
  qty: number;
  price: number;
}

const lotCells = (l: Lot | undefined): string[] => (l ? [`${l.qty}`, fmt(l.price), fmt(l.qty * l.price)] : ["", "", ""]);

/** 先入先出法か移動平均法で、1か月分の商品有高帳を作る。移動平均の単価が割り切れる数字だけを選ぶ */
export function inventoryProblem(rand: Rand): FillProblem {
  const fifo = rand() < 0.5;
  for (;;) {
    const q0 = 10 * ri(rand, 1, 3);
    const c0 = 10 * ri(rand, 10, 15);
    const q1 = 10 * ri(rand, 2, 4);
    const c1 = c0 + 10 * ri(rand, 1, 4);
    const s1 = q0 + 10 * ri(rand, 1, q1 / 10 - 1);
    const q2 = 10 * ri(rand, 2, 4);
    const c2 = c1 + 10 * ri(rand, -2, 3);
    const s2 = 10 * ri(rand, 1, (q0 + q1 - s1 + q2) / 10 - 1);
    const price = Math.max(c0, c1, c2) + 10 * ri(rand, 5, 10);
    const d = { q0, c0, q1, c1, s1, q2, c2, s2, price };
    if (fifo) return inventorySheet(true, d);
    // 移動平均法は、仕入のたびの平均単価が割り切れる数字だけを使う
    const avg1 = (q0 * c0 + q1 * c1) / (q0 + q1);
    const r1 = q0 + q1 - s1;
    if (Number.isInteger(avg1) && Number.isInteger((r1 * avg1 + q2 * c2) / (r1 + q2))) return inventorySheet(false, d);
  }
}

/** 移動平均法：単価のちがう商品をまとめて、平均単価の1つの塊にする */
const merge = (lots: Lot[]): Lot[] => {
  const qty = lots.reduce((a, l) => a + l.qty, 0);
  return [{ qty, price: lots.reduce((a, l) => a + l.qty * l.price, 0) / qty }];
};

function inventorySheet(
  fifo: boolean,
  d: { q0: number; c0: number; q1: number; c1: number; s1: number; q2: number; c2: number; s2: number; price: number },
): FillProblem {
  const b = blanks();
  const rows: FillCell[][] = [];
  // 残高。先入先出法なら単価ごとの塊、移動平均法なら1つの塊
  let lots: Lot[] = [{ qty: d.q0, price: d.c0 }];
  let cogs = 0;
  const cell = (x: number, blank: boolean, why: string): FillCell => (blank ? b.amount(x, undefined, why) : fmt(x));
  const outAmounts: number[] = [];
  /**
   * 1つの取引を、受入・払出・残高の行にする（塊が複数なら行を分ける）。
   * 売上の行は払出の金額を空欄にし、hideBalance のときは残高も空欄にする。
   * 移動平均法では単価を見せると平均単価がわかってしまうので、売上の行と仕入後の残高は単価を空欄にする
   */
  const push = (date: string, memo: string, t: { in?: Lot; out?: Lot[]; hideBalance?: boolean }) => {
    const out = t.out ?? [];
    const sale = out.length > 0;
    const hide = !!t.hideBalance || (sale && !fifo);
    for (let i = 0; i < Math.max(out.length, lots.length); i++) {
      const o = out[i];
      const l = lots[i];
      const outWhy = fifo
        ? `先入先出法なので、古い単価のものから払い出す${out.length > 1 ? "（足りない分は次に古い単価で払い出し、行を分けて書く）" : ""}。`
        : "金額は売価ではなく原価（平均単価）で書く。";
      const outCells: FillCell[] = o
        ? [
            `${o.qty}`,
            cell(o.price, sale && !fifo, `移動平均法では、払い出す直前の残高の単価${fmt(o.price)}円で払い出す。`),
            cell(o.qty * o.price, true, `${o.qty}個 × ${fmt(o.price)}円 = ${fmt(o.qty * o.price)}円。${outWhy}`),
          ]
        : ["", "", ""];
      // 移動平均法の仕入のあとの単価は、受け入れる前の残高と受け入れた分を合わせて平均する
      const before = l && t.in ? { qty: l.qty - t.in.qty, amount: l.qty * l.price - t.in.qty * t.in.price } : null;
      const priceWhy = before
        ? `移動平均の単価：（受け入れる前の残高${fmt(before.amount)}円 ＋ 受入${fmt(t.in!.qty * t.in!.price)}円）÷（${before.qty}個 ＋ ${t.in!.qty}個）= ${fmt(l!.price)}円。`
        : `払い出しても平均単価は変わらない。${l ? fmt(l.price) : ""}円のまま。`;
      const balCells: FillCell[] = l
        ? [
            `${l.qty}`,
            cell(l.price, hide && !fifo, priceWhy),
            cell(l.qty * l.price, hide && fifo, `${l.qty}個 × ${fmt(l.price)}円 = ${fmt(l.qty * l.price)}円。${lots.length > 1 ? "先入先出法では、単価のちがう残高は行を分けて書く。" : ""}`),
          ]
        : ["", "", ""];
      rows.push([i === 0 ? date : "", i === 0 ? memo : "", ...lotCells(i === 0 ? t.in : undefined), ...outCells, ...balCells]);
    }
  };
  const receive = (lot: Lot) => {
    lots = fifo ? [...lots, lot] : merge([...lots, lot]);
  };
  const sell = (qty: number): Lot[] => {
    const out: Lot[] = [];
    const next: Lot[] = [];
    let rest = qty;
    for (const l of lots) {
      const take = Math.min(rest, l.qty);
      if (take > 0) out.push({ qty: take, price: l.price });
      if (l.qty > take) next.push({ qty: l.qty - take, price: l.price });
      rest -= take;
    }
    lots = next;
    cogs += out.reduce((a, l) => a + l.qty * l.price, 0);
    outAmounts.push(...out.map((l) => l.qty * l.price));
    return out;
  };

  push("6/1", "前月繰越", { in: { qty: d.q0, price: d.c0 } });
  receive({ qty: d.q1, price: d.c1 });
  push("6/8", "仕入", { in: { qty: d.q1, price: d.c1 }, hideBalance: !fifo });
  push("6/15", "売上", { out: sell(d.s1) });
  receive({ qty: d.q2, price: d.c2 });
  push("6/22", "仕入", { in: { qty: d.q2, price: d.c2 }, hideBalance: !fifo });
  push("6/27", "売上", { out: sell(d.s2), hideBalance: true });

  const sales = (d.s1 + d.s2) * d.price;
  const method = fifo ? "先入先出法" : "移動平均法";
  return {
    title: `第2問(1) 商品有高帳（${method}）`,
    short: "第2問(1)",
    lesson: "inventorybook",
    itemsTitle: "資料",
    lead: [
      `次の資料にもとづいて、${method}によりA商品の商品有高帳の空欄を埋め、6月の売上原価と売上総利益を答えなさい。なお、帳簿の締め切りは不要である。`,
    ],
    items: [
      `6月1日 前月繰越 ${d.q0}個 @${fmt(d.c0)}円`,
      `6月8日 仕入 ${d.q1}個 @${fmt(d.c1)}円`,
      `6月15日 売上 ${d.s1}個 @${fmt(d.price)}円（売価）`,
      `6月22日 仕入 ${d.q2}個 @${fmt(d.c2)}円`,
      `6月27日 売上 ${d.s2}個 @${fmt(d.price)}円（売価）`,
    ],
    sheet: [
      {
        title: "商品有高帳（A商品）",
        head: ["日付", "摘要", "受入数量", "受入単価", "受入金額", "払出数量", "払出単価", "払出金額", "残高数量", "残高単価", "残高金額"],
        rows,
      },
      {
        title: "6月の売上原価と売上総利益",
        head: ["", "金額"],
        rows: [
          ["売上原価", b.amount(cogs, undefined, `払出金額の合計：${outAmounts.map(fmt).join(" ＋ ")} = ${fmt(cogs)}円。`)],
          [
            "売上総利益",
            b.amount(sales - cogs, undefined, `売上高（${d.s1 + d.s2}個 × 売価${fmt(d.price)}円）${fmt(sales)}円 − 売上原価${fmt(cogs)}円 = ${fmt(sales - cogs)}円。`),
          ],
        ],
      },
    ],
    blanks: b.score(10),
  };
}

// ───────── 第2問(1) 伝票と仕訳日計表 ─────────

type Slip = { kind: "入金伝票" | "出金伝票" | "振替伝票"; debit: AccountName; credit: AccountName; amount: number };

const SLIP_FOCUS = new Set<AccountName>(["現金", "売掛金", "買掛金", "仕入", "売上"]);

export function slipsProblem(rand: Rand): FillProblem {
  const k = amt(rand, 1000);
  const slips: Slip[] = shuffle(
    [
      { kind: "入金伝票", debit: "現金", credit: "売掛金", amount: k(20, 60) },
      { kind: "入金伝票", debit: "現金", credit: "売上", amount: k(10, 40) },
      { kind: "出金伝票", debit: "仕入", credit: "現金", amount: k(10, 40) },
      { kind: "出金伝票", debit: "買掛金", credit: "現金", amount: k(20, 50) },
      { kind: "出金伝票", debit: "消耗品費", credit: "現金", amount: k(1, 5) },
      { kind: "振替伝票", debit: "仕入", credit: "買掛金", amount: k(30, 80) },
      { kind: "振替伝票", debit: "売掛金", credit: "売上", amount: k(40, 90) },
      { kind: "振替伝票", debit: "買掛金", credit: "普通預金", amount: k(10, 30) },
    ] satisfies Slip[],
    rand,
  );
  const given: FillCell[][] = slips.map((s, i) => [
    `No.${101 + i}`,
    s.kind,
    s.kind === "入金伝票" ? s.credit : s.kind === "出金伝票" ? s.debit : `（借）${s.debit} ／（貸）${s.credit}`,
    fmt(s.amount),
  ]);
  // 仕訳日計表：科目ごとに、借方と貸方それぞれの合計（残高ではない）
  const sums = totalsOf(slips.map((s) => flow(s.debit, s.credit, s.amount)));
  const b = blanks();
  return {
    title: "第2問(1) 伝票と仕訳日計表",
    short: "第2問(1)",
    lesson: "slips",
    lead: [
      "当社は、入金伝票・出金伝票・振替伝票の3伝票制を採用している。次の本日分の伝票にもとづいて、仕訳日計表の空欄を埋めなさい。",
      "入金伝票・出金伝票には、現金の相手の科目を示している。",
    ],
    given: [{ title: "本日分の伝票", head: ["番号", "伝票", "科目", "金額"], rows: given }],
    sheet: [
      totalsTable(
        "仕訳日計表",
        ["借方", "勘定科目", "貸方"],
        sums,
        (account, amount, side) =>
          SLIP_FOCUS.has(account)
            ? b.amount(
                amount,
                undefined,
                `伝票を仕訳に直すと、${account}が${sideName(side)}に出てくるのは ${slips
                  .map((sl, i) => ((side === "debit" ? sl.debit : sl.credit) === account ? `No.${101 + i}（${sl.kind}）${fmt(sl.amount)}円` : ""))
                  .filter(Boolean)
                  .join("、")}。合計${fmt(amount)}円。`,
              )
            : fmt(amount),
        b,
      ),
    ],
    blanks: b.score(10),
  };
}

// ───────── 第2問(2) 語群選択（理論） ─────────

/** 空欄（　）に入る語と、その文。どれも3級の範囲の基本的な用語 */
export const THEORY: [string, string][] = [
  ["主要簿", "仕訳帳と総勘定元帳は（　）とよばれ、それ以外の帳簿は補助簿とよばれる。"],
  ["損益", "決算において、収益と費用の各勘定の残高は（　）勘定に振り替える。"],
  ["付随費用", "土地を購入したときの仲介手数料や登記料などの（　）は、土地の取得原価に含める。"],
  ["減価償却", "建物や備品の価値の減少を、使用する各期間に費用として配分する手続きを（　）という。"],
  ["前受収益", "当期に受け取った収益のうち、次期以降に属する分は（　）として負債に計上する。"],
  ["未払費用", "当期の費用のうち、まだ支払っていない分は（　）として負債に計上する。"],
  ["先入先出法", "商品有高帳において、先に受け入れた商品から先に払い出したとみなして払出単価を決める方法を（　）という。"],
  ["利益準備金", "株式会社が繰越利益剰余金から配当をするときは、会社法の規定により一定額を（　）として積み立てる。"],
  ["振替伝票", "3伝票制では、入金伝票・出金伝票と（　）を用いる。"],
  ["売掛金元帳", "得意先ごとに売掛金の増減を記録する補助簿を（　）という。得意先元帳ともいう。"],
  ["資本的支出", "建物の価値を高めたり耐用年数を延ばしたりする支出を（　）といい、建物の取得原価に加える。"],
  ["償却債権取立益", "前期以前に貸倒れとして処理した債権を回収したときは、（　）勘定で処理する。"],
];

const THEORY_DISTRACTORS = [
  "補助簿",
  "繰越利益剰余金",
  "移動平均法",
  "前払費用",
  "未収収益",
  "修繕費",
  "合計試算表",
  "買掛金元帳",
  "入金伝票",
  "貸倒引当金戻入",
];

export function theoryProblem(rand: Rand): FillProblem {
  const words = [...THEORY.map(([w]) => w), ...THEORY_DISTRACTORS].sort();
  const b = blanks();
  const rows: FillCell[][] = shuffle(THEORY, rand)
    .slice(0, 5)
    .map(([word, text], i) => [`(${i + 1})`, text, b.select(word, words, `正しい文：${text.replace("（　）", `（${word}）`)}`)]);
  return {
    title: "第2問(2) 語群選択",
    short: "第2問(2)",
    lesson: "ledgerclose",
    lead: ["次の各文の（　）にあてはまる最も適当な語を、語群から選びなさい。"],
    sheet: [{ head: ["", "文", "語"], rows }],
    blanks: b.score(10),
  };
}

/**
 * 科目ごとの借方合計・貸方合計の表（仕訳日計表・合計試算表）。0 の欄は空ける。
 * cell を渡すと金額を空欄にでき、b を渡すと合計の借方も空欄にする
 */
function totalsTable(
  title: string,
  head: string[],
  sums: Map<AccountName, Pair>,
  cell: (a: AccountName, x: number, side: Side) => FillCell = (_, x) => fmt(x),
  b?: ReturnType<typeof blanks>,
): FillTable {
  const show = (a: AccountName, x: number, side: Side): FillCell => (x ? cell(a, x, side) : "");
  const total = [...sums.values()].reduce((a, r) => a + r.debit, 0);
  return {
    title,
    head,
    rows: [
      ...inMasterOrder([...sums.keys()]).map((a) => [show(a, sums.get(a)!.debit, "debit"), a, show(a, sums.get(a)!.credit, "credit")]),
      [b ? b.amount(total, undefined, `借方の金額をすべて足した合計${fmt(total)}円。貸方の合計と一致することを確かめる。`) : fmt(total), "合計", fmt(total)],
    ],
  };
}

// ───────── 第3問（別形式） 精算表 ─────────

const WORKSHEET_HEAD = [
  "勘定科目",
  "試算表 借方",
  "試算表 貸方",
  "修正記入 借方",
  "修正記入 貸方",
  "損益計算書 借方",
  "損益計算書 貸方",
  "貸借対照表 借方",
  "貸借対照表 貸方",
];
const WORKSHEET_POINTS = 35;

/** 精算表を完成させる。決算整理で金額が変わる科目の、修正記入と損益計算書・貸借対照表の欄を空欄にする */
export function worksheetProblem(rand: Rand): FillProblem {
  const { trial, items, adjustments, steps, focus } = closingCase(rand);
  const ws = worksheet([trial], adjustments);
  // 試算表にある科目を先に、決算整理で新しく出てくる科目をあとに並べる（精算表の書き方）
  const inTrial = (r: WorksheetRow) => !!(r.trial.debit || r.trial.credit);
  const rows = [...ws.rows.filter(inTrial), ...ws.rows.filter((r) => !inTrial(r))];
  const b = blanks();
  const nonzero = (p: Pair) => (p.debit ? 1 : 0) + (p.credit ? 1 : 0);
  // 空欄は配点の数まで。最終の欄と当期純利益（2つ）を優先し、残りを修正記入に回す
  const finals = rows.filter((r) => focus.has(r.account)).reduce((a, r) => a + nonzero(r.income) + nonzero(r.balance), 0);
  let adjRoom = WORKSHEET_POINTS - 2 - finals;
  const pair = (p: Pair, blank: boolean, why?: (side: Side) => string): FillCell[] =>
    (["debit", "credit"] as const).map((side) => (p[side] ? (blank ? b.amount(p[side], undefined, why?.(side)) : fmt(p[side])) : ""));
  const adjusted = adjustedWhy(trial, steps);
  /** 修正記入欄：決算整理仕訳でその科目がその側に出てくる金額の合計 */
  const adjustWhy = (account: AccountName) => (side: Side) => {
    const hits = steps.flatMap((s) => s.answer[side].filter((l) => l.account === account).map((l) => ({ label: s.label, amount: l.amount })));
    const list = hits.map((h) => `${h.label}の${fmt(h.amount)}円`).join("、");
    const total = hits.length > 1 ? `。合計${fmt(sumAmounts(hits))}円` : "";
    return `決算整理仕訳で${account}が${sideName(side)}に出てくるもの：${list}${total}。`;
  };
  /** 損益計算書欄・貸借対照表欄：整理後の金額を、科目の種類で決まる欄に書く */
  const finalWhy = (account: AccountName, income: boolean) => (side: Side) =>
    `${income ? "収益・費用なので損益計算書欄" : "資産・負債・純資産なので貸借対照表欄"}の${sideName(side)}に書く。${adjusted(account)}`;
  const body: FillCell[][] = rows.map((r) => {
    const f = focus.has(r.account);
    const blankAdj = f && nonzero(r.adjust) <= adjRoom;
    if (blankAdj) adjRoom -= nonzero(r.adjust);
    return [
      r.account,
      ...pair(r.trial, false),
      ...pair(r.adjust, blankAdj, adjustWhy(r.account)),
      ...pair(r.income, f, finalWhy(r.account, true)),
      ...pair(r.balance, f, finalWhy(r.account, false)),
    ];
  });
  const plCredit = ws.totals.income.credit;
  const plDebit = ws.totals.income.debit - ws.netIncomeRow.income.debit;
  const netWhy = (side: Side) =>
    side === "debit"
      ? `損益計算書欄の貸方（収益）合計${fmt(plCredit)}円 − 借方（費用）合計${fmt(plDebit)}円 = ${fmt(plCredit - plDebit)}円。利益なので、損益計算書欄の借方に書いて左右をそろえる。`
      : `損益計算書欄と同じ当期純利益を、貸借対照表欄の貸方に書く（純資産が増える）。`;
  const t = ws.totals;
  return {
    title: "第3問 精算表",
    short: "第3問",
    lesson: "closing",
    lead: [`次の決算整理事項にもとづいて、${FISCAL}の精算表の空欄を埋めなさい。`],
    items,
    sheet: [
      {
        title: "精算表",
        head: WORKSHEET_HEAD,
        rows: [
          ...body,
          ["当期純利益", "", "", "", "", ...pair(ws.netIncomeRow.income, true, netWhy), ...pair(ws.netIncomeRow.balance, true, netWhy)],
          ["合計", ...[t.trial, t.adjust, t.income, t.balance].flatMap((p) => [fmt(p.debit), fmt(p.credit)])],
        ],
      },
    ],
    blanks: b.score(WORKSHEET_POINTS),
    steps,
  };
}

// ───────── 第3問（別形式） 合計残高試算表 ─────────

type MonthTx = { text: string; e: Entry };

/** 当月の取引。金額は千円単位で、残高がマイナスにならない大きさにしてある */
function monthTransactions(rand: Rand): MonthTx[] {
  const k = amt(rand, 1000);
  const tx = (debit: AccountName, credit: AccountName, a: number, text: (yen: string) => string): MonthTx => ({
    text: text(fmt(a)),
    e: flow(debit, credit, a),
  });
  const salary = k(150, 250);
  const tax = Math.floor((salary * 0.05) / 1000) * 1000;
  const all: MonthTx[] = [
    tx("仕入", "買掛金", k(150, 300), (y) => `商品${y}円を仕入れ、代金は掛けとした。`),
    tx("売掛金", "売上", k(250, 450), (y) => `商品${y}円を売り上げ、代金は掛けとした。`),
    tx("普通預金", "売掛金", k(200, 350), (y) => `売掛金${y}円が普通預金口座に振り込まれた。`),
    tx("買掛金", "当座預金", k(150, 250), (y) => `買掛金${y}円を小切手を振り出して支払った。`),
    tx("現金", "売上", k(30, 80), (y) => `商品${y}円を売り上げ、代金は現金で受け取った。`),
    tx("消耗品費", "現金", k(3, 15), (y) => `事務用品${y}円を購入し、代金は現金で支払った。`),
    tx("備品", "未払金", k(50, 150), (y) => `備品${y}円を購入し、代金は月末に支払うこととした。`),
    tx("支払家賃", "普通預金", k(60, 120), (y) => `今月分の家賃${y}円を普通預金口座から支払った。`),
    {
      text: `従業員の給料${fmt(salary)}円から所得税の源泉徴収額${fmt(tax)}円を差し引き、残額を普通預金口座から支払った。`,
      e: entry(
        [["給料", salary]],
        [
          ["所得税預り金", tax],
          ["普通預金", salary - tax],
        ],
      ),
    },
  ];
  return shuffle(all, rand).slice(0, 8);
}

/** 前月末の合計試算表と当月の取引から、当月末の合計残高試算表を作る */
export function totalsTrialProblem(rand: Rand): FillProblem {
  const k = amt(rand, 10000);
  // 前月末までの帳簿：期首の残高と、前月までの取引のまとめ
  const opening = entry(
    [
      ["現金", k(30, 60)],
      ["当座預金", k(80, 150)],
      ["普通預金", k(80, 150)],
      ["売掛金", k(30, 60)],
      ["繰越商品", k(15, 30)],
      ["備品", k(40, 80)],
    ],
    [["買掛金", k(20, 40)]],
  );
  // 純資産は、繰越利益剰余金を決めた残りを資本金にする（資産は最低でも200万円以上あるので、資本金はプラスになる）
  const retained = k(10, 40);
  opening.credit.push(
    { account: "資本金", amount: sumAmounts(opening.debit) - sumAmounts(opening.credit) - retained },
    { account: "繰越利益剰余金", amount: retained },
  );
  const before = [
    opening,
    flow("仕入", "買掛金", k(40, 60)),
    flow("売掛金", "売上", k(60, 90)),
    flow("普通預金", "売掛金", k(30, 50)),
    flow("買掛金", "当座預金", k(20, 35)),
  ];
  const month = monthTransactions(rand);
  const after = [...before, ...month.map((m) => m.e)];

  // 空欄は、当月に動いた側の合計と、動いた科目の残高だけ（配点の35を超えない）
  const moved = totalsOf(month.map((m) => m.e));
  const now = totalsOf(after);
  const balances = new Map(trialBalance(after).map((r) => [r.account, r]));
  const b = blanks();
  const show = (x: number, blank: boolean, why?: string): FillCell => (x ? (blank ? b.amount(x, undefined, why) : fmt(x)) : "");
  const prev = totalsOf(before);
  const rows: FillCell[][] = inMasterOrder([...now.keys()]).map((a) => {
    const t = now.get(a)!;
    const m = moved.get(a);
    const p = prev.get(a) ?? { debit: 0, credit: 0 };
    const bal = balances.get(a);
    const totalWhy = (side: Side) =>
      `前月末の${sideName(side)}合計${fmt(p[side])}円 ＋ 当月の取引で${a}が${sideName(side)}に出た${fmt(m?.[side] ?? 0)}円 = ${fmt(t[side])}円。`;
    const balWhy = `借方合計${fmt(t.debit)}円と貸方合計${fmt(t.credit)}円の差額${fmt(Math.abs(t.debit - t.credit))}円を、大きいほう（${t.debit >= t.credit ? "借方" : "貸方"}）の残高欄に書く。`;
    return [show(bal?.debit ?? 0, !!m, balWhy), show(t.debit, !!m?.debit, totalWhy("debit")), a, show(t.credit, !!m?.credit, totalWhy("credit")), show(bal?.credit ?? 0, !!m, balWhy)];
  });
  const total = [...now.values()].reduce((a, r) => a + r.debit, 0);
  const balanceTotal = trialBalanceTotals([...balances.values()]).debit;
  return {
    title: "第3問 合計残高試算表",
    short: "第3問",
    lesson: "advanced",
    itemsTitle: "当月の取引",
    lead: ["次の前月末の合計試算表と当月の取引にもとづいて、当月末の合計残高試算表の空欄を埋めなさい。"],
    given: [totalsTable("前月末の合計試算表", ["借方合計", "勘定科目", "貸方合計"], totalsOf(before))],
    items: month.map((m) => m.text),
    sheet: [
      {
        title: "合計残高試算表",
        head: ["借方残高", "借方合計", "勘定科目", "貸方合計", "貸方残高"],
        rows: [...rows, [fmt(balanceTotal), fmt(total), "合計", fmt(total), fmt(balanceTotal)]],
      },
    ],
    blanks: b.score(35),
    steps: month.map((m) => ({ text: m.text, answer: m.e })),
  };
}

// ───────── 第2問(1)（別形式） 売掛金元帳 ─────────

/** 得意先A商店の売掛金元帳（得意先元帳）に記入して締め切る */
export function receivableLedgerProblem(rand: Rand): FillProblem {
  const k = amt(rand, 1000);
  const open = { A: k(50, 120), B: k(30, 90) };
  const saleA = k(80, 160);
  const returnA = k(3, 10);
  const collectA = k(60, (open.A + saleA - returnA) / 1000 - 20);
  const saleB = k(50, 120);
  const collectB = k(20, open.B / 1000);
  const b = blanks();
  const memos = ["前月繰越", "売上", "返品", "入金", "次月繰越"];
  // 借方の合計（＝締め切りの合計）は、前月繰越と売上
  const debitTotal = open.A + saleA;
  const afterReturn = debitTotal - returnA;
  const closing = afterReturn - collectA;
  const rows: FillCell[][] = [
    ["4/1", "前月繰越", fmt(open.A), "", "借", fmt(open.A)],
    [
      "4/8",
      "売上",
      b.amount(saleA, undefined, `8日の掛け売上でA商店の売掛金が増えたので、借方に${fmt(saleA)}円。`),
      "",
      "借",
      b.amount(debitTotal, undefined, `前の残高${fmt(open.A)}円 ＋ 売上${fmt(saleA)}円 = ${fmt(debitTotal)}円。`),
    ],
    [
      "4/15",
      b.select("返品", memos, "15日は品違いの返品。A商店の売掛金が減るので貸方に書き、摘要は「返品」。"),
      "",
      b.amount(returnA, undefined, `返品された${fmt(returnA)}円。`),
      "借",
      b.amount(afterReturn, undefined, `${fmt(debitTotal)}円 − 返品${fmt(returnA)}円 = ${fmt(afterReturn)}円。（12日・22日はB商店の取引なので、A商店の元帳には書かない）`),
    ],
    [
      "4/25",
      b.select("入金", memos, "25日はA商店からの振り込み（売掛金の回収）。売掛金が減るので貸方に書き、摘要は「入金」。"),
      "",
      b.amount(collectA, undefined, `振り込まれた${fmt(collectA)}円。`),
      "借",
      b.amount(closing, undefined, `${fmt(afterReturn)}円 − 入金${fmt(collectA)}円 = ${fmt(closing)}円。`),
    ],
    ["4/30", "次月繰越", "", b.amount(closing, undefined, `月末の残高${fmt(closing)}円を「次月繰越」として貸方に書く。これで借方と貸方の合計が${fmt(debitTotal)}円でそろう。`), "", ""],
    ["", "", fmt(debitTotal), fmt(debitTotal), "", ""],
  ];
  return {
    title: "第2問(1) 売掛金元帳",
    short: "第2問(1)",
    lesson: "subbooks",
    itemsTitle: "4月の取引",
    lead: [
      `当社は、得意先ごとの売掛金を売掛金元帳（得意先元帳）で管理している。4月1日の売掛金の残高は、A商店${fmt(open.A)}円、B商店${fmt(open.B)}円であった。`,
      "次の4月の取引にもとづいて、A商店の売掛金元帳の空欄を埋めて締め切りなさい。摘要は「前月繰越・売上・返品・入金・次月繰越」から選ぶこと。",
    ],
    items: [
      `4月8日 A商店に商品${fmt(saleA)}円を掛けで売り上げた。`,
      `4月12日 B商店に商品${fmt(saleB)}円を掛けで売り上げた。`,
      `4月15日 8日にA商店に売り上げた商品のうち${fmt(returnA)}円が、品違いのため返品された。`,
      `4月22日 B商店から売掛金${fmt(collectB)}円が普通預金口座に振り込まれた。`,
      `4月25日 A商店から売掛金${fmt(collectA)}円が普通預金口座に振り込まれた。`,
    ],
    sheet: [{ title: "売掛金元帳（A商店）", head: ["日付", "摘要", "借方", "貸方", "借または貸", "残高"], rows }],
    blanks: b.score(10),
    steps: [
      { text: `4月8日 A商店に商品${fmt(saleA)}円を掛けで売り上げた。`, answer: flow("売掛金", "売上", saleA), note: "A商店の売掛金が増えたので、A商店の元帳の借方に「売上」と書く。" },
      { text: `4月12日 B商店に商品${fmt(saleB)}円を掛けで売り上げた。`, answer: flow("売掛金", "売上", saleB), note: "B商店の取引なので、A商店の元帳には書かない。" },
      {
        text: `4月15日 8日にA商店に売り上げた商品のうち${fmt(returnA)}円が、品違いのため返品された。`,
        answer: flow("売上", "売掛金", returnA),
        note: "返品の分だけA商店の売掛金が減るので、貸方に「返品」と書く。",
      },
      { text: `4月22日 B商店から売掛金${fmt(collectB)}円が普通預金口座に振り込まれた。`, answer: flow("普通預金", "売掛金", collectB), note: "B商店の取引なので、A商店の元帳には書かない。" },
      {
        text: `4月25日 A商店から売掛金${fmt(collectA)}円が普通預金口座に振り込まれた。`,
        answer: flow("普通預金", "売掛金", collectA),
        note: `貸方に「入金」と書く。残高は ${fmt(debitTotal)} − ${fmt(returnA)} − ${fmt(collectA)} = ${fmt(closing)}円で、これを「次月繰越」として貸方に書いて締め切る。`,
      },
    ],
  };
}
