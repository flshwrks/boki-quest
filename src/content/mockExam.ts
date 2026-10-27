// 模擬試験の第2問・第3問。数字は毎回変わり、答えは仕訳エンジンで計算する（手で答えを書かない）

import {
  type AccountName,
  CONTRA_TARGETS,
  categoryOf,
  inMasterOrder,
  statementLabel,
} from "@/engine/accounts";
import { type Entry, entry } from "@/engine/journal";
import { netBalances, statements } from "@/engine/ledger";
import { fmt } from "@/engine/format";
import { type Rand, shuffle } from "@/game/random";
import type { FillBlank, FillCell, FillProblem, FillTable } from "@/game/types";
import { pick } from "./eventKit";

/** lo 以上 hi 以下の整数 */
const ri = (rand: Rand, lo: number, hi: number) =>
  lo + Math.floor(rand() * (hi - lo + 1));

/** 空欄を作りながら答案用紙を組み立てる。配点は最後に合計点から割り振る */
function blanks() {
  const list: FillBlank[] = [];
  const add = (b: Omit<FillBlank, "points">, prefix?: string): FillCell => {
    list.push({ ...b, points: 0 });
    return { blank: list.length - 1, prefix };
  };
  return {
    list,
    amount: (answer: number, prefix?: string) =>
      add({ kind: "amount", answer }, prefix),
    select: (answer: string, options: string[]) =>
      add({ kind: "select", answer, options }),
    multi: (answer: string[], options: string[]) =>
      add({ kind: "multi", answer, options }),
    /** total 点をなるべく均等に割り振る（端数は前の空欄から1点ずつ） */
    score(total: number): FillBlank[] {
      const base = Math.floor(total / list.length);
      const extra = total - base * list.length;
      return list.map((b, i) => ({ ...b, points: base + (i < extra ? 1 : 0) }));
    },
  };
}

const LEDGER_HEAD = ["日付", "摘要", "金額", "日付", "摘要", "金額"];
const FISCAL = "当社（会計期間は4月1日から3月31日までの1年間）";

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
  const opts = [
    "前期繰越",
    "次期繰越",
    "損益",
    "支払保険料",
    "前払保険料",
    "普通預金",
  ];
  const sheet: FillTable[] = [
    {
      title: "支払保険料",
      head: LEDGER_HEAD,
      rows: [
        [
          "4/1",
          b.select("前払保険料", opts),
          fmt(x0),
          "3/31",
          "前払保険料",
          b.amount(x1),
        ],
        [
          `${m}/1`,
          "普通預金",
          fmt(now),
          "3/31",
          "損益",
          b.amount(x0 + now - x1),
        ],
        ["", "", fmt(x0 + now), "", "", fmt(x0 + now)],
      ],
    },
    {
      title: "前払保険料",
      head: LEDGER_HEAD,
      rows: [
        [
          "4/1",
          b.select("前期繰越", opts),
          fmt(x0),
          "4/1",
          "支払保険料",
          fmt(x0),
        ],
        [
          "3/31",
          "支払保険料",
          b.amount(x1),
          "3/31",
          b.select("次期繰越", opts),
          fmt(x1),
        ],
        ["", "", fmt(x0 + x1), "", "", fmt(x0 + x1)],
      ],
    },
  ];
  return {
    title: "第2問(1) 勘定記入",
    lead: [
      `${FISCAL}は、毎年${m}月1日に向こう1年分の保険料を普通預金口座から支払っている。前期の支払額は${fmt(prev)}円、当期の支払額は${fmt(now)}円である。`,
      "決算では前払分を月割で前払保険料勘定に振り替え、翌期首に再振替仕訳を行っている。",
      "次の各勘定の空欄に、適切な摘要または金額を記入しなさい。",
    ],
    sheet,
    blanks: b.score(10),
  };
}

const MONTH_END: Record<number, number> = {
  6: 30,
  7: 31,
  8: 31,
  9: 30,
  10: 31,
  11: 30,
};

/** 利息の未払い：支払利息勘定と未払利息勘定 */
function accruedLedger(rand: Rand): FillProblem {
  const loan = pick(rand, [1200000, 2400000, 3600000]);
  const rate = pick(rand, [2, 3]);
  const m = ri(rand, 6, 11);
  const paid = (loan * rate) / 100;
  // 支払月の翌月から3月までが、まだ払っていない分
  const x = (paid * (15 - m)) / 12;
  const b = blanks();
  const opts = [
    "前期繰越",
    "次期繰越",
    "損益",
    "支払利息",
    "未払利息",
    "普通預金",
  ];
  const sheet: FillTable[] = [
    {
      title: "支払利息",
      head: LEDGER_HEAD,
      rows: [
        [
          `${m}/${MONTH_END[m]}`,
          "普通預金",
          fmt(paid),
          "4/1",
          "未払利息",
          fmt(x),
        ],
        [
          "3/31",
          b.select("未払利息", opts),
          fmt(x),
          "3/31",
          "損益",
          b.amount(paid),
        ],
        ["", "", fmt(paid + x), "", "", fmt(paid + x)],
      ],
    },
    {
      title: "未払利息",
      head: LEDGER_HEAD,
      rows: [
        [
          "4/1",
          b.select("支払利息", opts),
          fmt(x),
          "4/1",
          b.select("前期繰越", opts),
          fmt(x),
        ],
        ["3/31", "次期繰越", fmt(x), "3/31", "支払利息", b.amount(x)],
        ["", "", fmt(x * 2), "", "", fmt(x * 2)],
      ],
    },
  ];
  return {
    title: "第2問(1) 勘定記入",
    lead: [
      `${FISCAL}は、前期から借入金${fmt(loan)}円（年利${rate}％）があり、毎年${m}月末日に過去1年分の利息を普通預金口座から支払っている。`,
      "決算では未払分を月割で未払利息勘定に計上し、翌期首に再振替仕訳を行っている。借入金の額と利率は前期から変わっていない。",
      "次の各勘定の空欄に、適切な摘要または金額を記入しなさい。",
    ],
    sheet,
    blanks: b.score(10),
  };
}

export const ledgerProblem = (rand: Rand) =>
  rand() < 0.5 ? prepaidLedger(rand) : accruedLedger(rand);

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

/** 取引と、記入する補助簿（答え）。仕訳に出る科目から決まる */
export const SUB_BOOK_CASES: [string, string[]][] = [
  [
    "商品80,000円を仕入れ、代金のうち半額は約束手形を振り出して支払い、残額は掛けとした。",
    ["仕入帳", "商品有高帳", "支払手形記入帳", "買掛金元帳"],
  ],
  [
    "商品120,000円を売り上げ、代金は得意先振出しの約束手形で受け取った。",
    ["売上帳", "商品有高帳", "受取手形記入帳"],
  ],
  [
    "売掛金60,000円が当座預金口座に振り込まれた。",
    ["当座預金出納帳", "売掛金元帳"],
  ],
  ["備品250,000円を購入し、代金は月末に支払うこととした。", ["固定資産台帳"]],
  [
    "掛けで仕入れた商品のうち5,000円を品違いのため返品した。",
    ["仕入帳", "商品有高帳", "買掛金元帳"],
  ],
  [
    "商品90,000円を売り上げ、代金のうち30,000円は現金で受け取り、残額は掛けとした。",
    ["現金出納帳", "売上帳", "商品有高帳", "売掛金元帳"],
  ],
  [
    "買掛金45,000円を小切手を振り出して支払った。",
    ["当座預金出納帳", "買掛金元帳"],
  ],
  [
    "かねて受け取っていた約束手形70,000円が満期となり、当座預金口座に入金された。",
    ["当座預金出納帳", "受取手形記入帳"],
  ],
  [
    "商品50,000円を掛けで仕入れ、引取運賃2,000円は現金で支払った。",
    ["現金出納帳", "仕入帳", "商品有高帳", "買掛金元帳"],
  ],
  [
    "備品（取得原価300,000円、減価償却累計額180,000円）を100,000円で売却し、代金は現金で受け取った。",
    ["現金出納帳", "固定資産台帳"],
  ],
  [
    "かねて振り出していた約束手形40,000円が満期となり、当座預金口座から支払われた。",
    ["当座預金出納帳", "支払手形記入帳"],
  ],
  [
    "掛けで売り上げた商品のうち8,000円が品違いのため返品された。",
    ["売上帳", "商品有高帳", "売掛金元帳"],
  ],
  ["商品の注文にあたり、手付金20,000円を現金で支払った。", ["現金出納帳"]],
];

export function subBookProblem(rand: Rand): FillProblem {
  const b = blanks();
  const rows: FillCell[][] = shuffle(SUB_BOOK_CASES, rand)
    .slice(0, 5)
    .map(([text, books], i) => [`(${i + 1})`, text, b.multi(books, SUB_BOOKS)]);
  return {
    title: "第2問(2) 補助簿の選択",
    lead: [
      "次の各取引は、どの補助簿に記入されるか。記入される補助簿をすべて選びなさい（各問すべて正しく選んで正解）。",
    ],
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
  /** 答え合わせで空欄にする科目（決算整理で金額が変わるもの） */
  focus: Set<AccountName>;
}

/** 決算整理前残高試算表と決算整理事項を作る。利益と繰越利益剰余金がほどよい額になるよう、最後に売上と当座預金で調整する */
function closingCase(rand: Rand): ClosingCase {
  const d: Partial<Record<AccountName, number>> = {};
  const c: Partial<Record<AccountName, number>> = {};
  const items: string[] = [];
  const adj: Entry[] = [];
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
    "繰越利益剰余金",
  ]);

  d.現金 = 10000 * ri(rand, 15, 40);
  const receivable = 10000 * ri(rand, 40, 90);
  d.売掛金 = receivable;
  d.繰越商品 = 10000 * ri(rand, 15, 35);
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
  const premium = 12000 * ri(rand, 3, 8);
  const pm = ri(rand, 6, 12);
  // 期首の再振替（前期の前払分）＋当期に払った1年分
  d.支払保険料 = (premium * (12 + pm - 4)) / 12;

  // 1. 現金過不足
  if (rand() < 0.6) {
    const diff = 1000 * ri(rand, 3, 8);
    const found = 1000 * ri(rand, 1, diff / 1000 - 1);
    d.現金過不足 = diff;
    items.push(
      `現金過不足${fmt(diff)}円（借方残高）のうち${fmt(found)}円は、通信費の記入漏れと判明した。残額は原因が不明のため、雑損として処理する。`,
    );
    adj.push(
      entry(
        [
          ["通信費", found],
          ["雑損", diff - found],
        ],
        [["現金過不足", diff]],
      ),
    );
    focus.add("通信費").add("雑損");
  }
  // 2. 仮受金
  let collected = 0;
  if (rand() < 0.6) {
    collected = 10000 * ri(rand, 2, 8);
    c.仮受金 = collected;
    items.push(
      `仮受金${fmt(collected)}円は、得意先からの売掛金の回収であることが判明した。`,
    );
    adj.push(entry([["仮受金", collected]], [["売掛金", collected]]));
    focus.add("売掛金");
  }
  // 3. 売上原価（期末商品の棚卸）
  const ending = 10000 * ri(rand, 15, 35);
  items.push(
    `期末商品の棚卸高は${fmt(ending)}円である。売上原価は「仕入」の行で計算すること。`,
  );
  adj.push(
    entry([["仕入", d.繰越商品]], [["繰越商品", d.繰越商品]]),
    entry([["繰越商品", ending]], [["仕入", ending]]),
  );
  // 4. 貸倒引当金（差額補充法）
  const rate = pick(rand, [2, 3]);
  const allowance = ((receivable - collected) * rate) / 100;
  items.push(
    `売掛金の期末残高に対して${rate}％の貸倒引当金を、差額補充法により設定する。`,
  );
  const gap = allowance - c.貸倒引当金;
  if (gap > 0)
    adj.push(entry([["貸倒引当金繰入", gap]], [["貸倒引当金", gap]]));
  if (gap < 0)
    adj.push(entry([["貸倒引当金", -gap]], [["貸倒引当金戻入", -gap]]));
  focus.add(gap >= 0 ? "貸倒引当金繰入" : "貸倒引当金戻入");
  // 5. 減価償却
  items.push(
    `備品について、定額法（残存価額ゼロ、耐用年数${life}年）により減価償却を行う。`,
  );
  adj.push(entry([["減価償却費", dep]], [["備品減価償却累計額", dep]]));
  // 6. 郵便切手の未使用分
  if (rand() < 0.6) {
    const stamps = 1000 * ri(rand, 2, 8);
    items.push(
      `購入時に通信費として処理した郵便切手のうち、${fmt(stamps)}円分が未使用である。`,
    );
    adj.push(entry([["貯蔵品", stamps]], [["通信費", stamps]]));
    focus.add("通信費").add("貯蔵品");
  }
  // 7. 保険料の前払い
  const prepaid = (premium * (pm - 4)) / 12;
  items.push(
    `支払保険料は、毎年${pm}月1日に向こう1年分（毎年同額）を支払っているものである。前払分を月割で計上する。`,
  );
  adj.push(entry([["前払保険料", prepaid]], [["支払保険料", prepaid]]));
  // 8. 利息の未払い（当期に借り入れ、利息は返済時に支払う）
  const lm = pick(rand, [10, 11, 12, 1, 2]);
  const months = lm >= 4 ? 16 - lm : 4 - lm;
  const loanRate = pick(rand, [2, 3]);
  const accrued = (((loan * loanRate) / 100) * months) / 12;
  items.push(
    `借入金は${lm}月1日に借入期間1年、年利${loanRate}％で借り入れたもので、利息は返済時に元金とともに支払う。利息の未払分を月割で計上する。`,
  );
  adj.push(entry([["支払利息", accrued]], [["未払利息", accrued]]));

  // 税引前当期純利益がほどよい額になるよう、売上を決める
  const pretaxWithoutSales = statements([
    entry(linesOf(d), linesOf({ ...c, 売上: 0 })),
    ...adj,
  ]).netIncome;
  const target = 10000 * ri(rand, 30, 120);
  c.売上 = target - pretaxWithoutSales;
  // 9. 法人税等（中間納付は仮払法人税等）
  const tax = (target * 30) / 100;
  d.仮払法人税等 = 1000 * Math.floor((tax * ri(rand, 30, 60)) / 100 / 1000);
  items.push(
    "法人税、住民税及び事業税として、税引前当期純利益の30％を計上する。なお、中間納付額は仮払法人税等で処理している。",
  );
  adj.push(
    entry(
      [["法人税、住民税及び事業税", tax]],
      [
        ["仮払法人税等", d.仮払法人税等],
        ["未払法人税等", tax - d.仮払法人税等],
      ],
    ),
  );

  // 貸借の差を当座預金と繰越利益剰余金で埋める
  c.繰越利益剰余金 = 10000 * ri(rand, 10, 60);
  const sum = (x: typeof d) =>
    Object.values(x).reduce((a, v) => a + (v ?? 0), 0);
  d.当座預金 = sum(c) - sum(d);
  // 当座預金が少なすぎるときは、資本金を増やした会社にする
  while (d.当座預金 < 300000) {
    d.当座預金 += 1000000;
    c.資本金 += 1000000;
  }
  return {
    trial: entry(linesOf(d), linesOf(c)),
    items,
    adjustments: adj,
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
  const { trial, items, adjustments, focus } = closingCase(rand);
  const s = statements([trial, ...adjustments]);
  const b = blanks();
  const cell = (
    account: AccountName,
    amount: number,
    prefix?: string,
  ): FillCell =>
    focus.has(account)
      ? b.amount(amount, prefix)
      : `${prefix ?? ""}${fmt(amount)}`;

  // 損益計算書（勘定式）：左に費用と当期純利益、右に収益。問題は必ず黒字になるように作ってある
  const left: FillCell[][] = s.expenses.map((r) => [
    statementLabel(r.account),
    cell(r.account, r.amount),
  ]);
  left.push(["当期純利益", b.amount(s.netIncome)]);
  const right: FillCell[][] = s.revenues.map((r) => [
    statementLabel(r.account),
    cell(r.account, r.amount),
  ]);
  const plTotal = sumOf(s.revenues);

  // 貸借対照表（勘定式）：控除科目は、差し引く資産のすぐ下に「△」で書く
  const assets: FillCell[][] = [];
  for (const a of s.assets) {
    if (categoryOf(a.account) !== "asset") continue;
    assets.push([statementLabel(a.account), cell(a.account, a.amount)]);
    const under = s.contras.filter(
      (k) =>
        CONTRA_TARGETS[k.account]?.find((t) =>
          s.assets.some((y) => y.account === t),
        ) === a.account,
    );
    for (const k of under) {
      assets.push([
        `　${statementLabel(k.account)}`,
        cell(k.account, k.amount, "△"),
      ]);
    }
  }
  const retained =
    (s.equity.find((e) => e.account === "繰越利益剰余金")?.amount ?? 0) +
    s.netIncome;
  const claims: FillCell[][] = [
    ...s.liabilities.map((l): FillCell[] => [
      statementLabel(l.account),
      cell(l.account, l.amount),
    ]),
    ...s.equity.map((e): FillCell[] =>
      e.account === "繰越利益剰余金"
        ? [e.account, cell(e.account, retained)]
        : [e.account, fmt(e.amount)],
    ),
  ];
  const bsTotal = sumOf(s.assets) - sumOf(s.contras);

  const net = netBalances([trial]);
  const tbRows: FillCell[][] = inMasterOrder([...net.keys()]).map((a) => {
    const n = net.get(a) ?? 0;
    return [n > 0 ? fmt(n) : "", a, n < 0 ? fmt(-n) : ""];
  });
  const tbTotal = sumOf(trial.debit);

  return {
    title: "第3問 決算整理後の財務諸表",
    lead: [
      `次の決算整理前残高試算表と決算整理事項にもとづいて、${FISCAL}の損益計算書と貸借対照表の空欄を埋めなさい。`,
    ],
    given: [
      {
        title: "決算整理前残高試算表",
        head: ["借方", "勘定科目", "貸方"],
        rows: [...tbRows, [fmt(tbTotal), "合計", fmt(tbTotal)]],
      },
    ],
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
  };
}

const sumOf = (rows: { amount: number }[]) =>
  rows.reduce((a, r) => a + r.amount, 0);

/** 左右の表を1行ずつ横に並べる（短いほうは空欄で埋める） */
function zip(left: FillCell[][], right: FillCell[][]): FillCell[][] {
  return Array.from({ length: Math.max(left.length, right.length) }, (_, i) => [
    ...(left[i] ?? ["", ""]),
    ...(right[i] ?? ["", ""]),
  ]);
}
