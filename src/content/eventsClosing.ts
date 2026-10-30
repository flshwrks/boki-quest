// 決算日の決算整理仕訳と、新年度の再振替仕訳・貸倒れ・保険料。
// 金額はすべて店の実データ（在庫、設備、借入金、仕訳帳）から計算する。

import { CONTRA_TARGETS, type AccountName, categoryOf } from "@/engine/accounts";
import { statements } from "@/engine/ledger";
import { sumAmounts } from "@/engine/journal";
import type { GameState, LessonId, QueueItem } from "@/game/types";
import { type EventTemplate, adjustment, creditsOf, interestOf, je, lastRecord, n, need, payBalance, pct, pick, viaPhrase } from "./eventKit";
import { DAYS_PER_MONTH, DAYS_PER_YEAR, ITEMS, ITEM_IDS, calendarMonth, monthOfYear, yearStartDay } from "./world";

/** その会計年度の仕訳 */
const thisYear = (state: GameState) => state.journal.filter((r) => r.day >= yearStartDay(state.day));


// ───────── 売上原価 ─────────

const ALLOWANCE_RATE = 0.02;

const cogsOpen: EventTemplate = {
  lesson: "kessan",
  build: (ctx) => {
    const opening = ctx.balance("繰越商品");
    if (opening <= 0) return null;
    return adjustment("hoho", ["まずは去年の売れ残り（期首商品）じゃ。今年売ったのじゃから、今年の仕入に加える。", `繰越商品の残高は${n(opening)}円じゃな。`], {
      story: `期首商品${n(opening)}円を仕入に振り替えた。`,
      exam: `決算にあたり、期首商品棚卸高${n(opening)}円を仕入勘定に振り替える（売上原価は仕入の行で計算する）。`,
      answer: je([["仕入", opening]], [["繰越商品", opening]]),
      idea: "「しいくり」。去年の在庫を、今年の仕入（費用）に加えるよ。",
    });
  },
};

const cogsEnd: EventTemplate = {
  lesson: "kessan",
  build: (ctx) => {
    const { stock, stockValue } = ctx.state;
    const counted = ITEM_IDS.filter((i) => stock[i] > 0);
    const closingStock = counted.reduce((a, i) => a + stockValue[i], 0);
    if (closingStock <= 0) return null;
    const detail = counted.map((i) => `${ITEMS[i].name}${stock[i]}${ITEMS[i].unit}（${n(stockValue[i])}円）`).join("、");
    return adjustment("hoho", ["次は棚卸しじゃ。棚に残っている商品を数えて、仕入値で金額にする。特価で安く仕入れた分もあるから、平均の仕入値で数えておいたぞ。", `${detail}。合計${n(closingStock)}円じゃ。`], {
      story: `棚卸しをして、期末商品${n(closingStock)}円を繰越商品にした。`,
      exam: `期末商品棚卸高は${n(closingStock)}円である（売上原価は仕入の行で計算する）。`,
      answer: je([["繰越商品", closingStock]], [["仕入", closingStock]]),
      idea: "「くりしい」。売れ残りは来年売るので、今年の仕入（費用）から除いて資産にするよ。",
      note: "これで仕入の残高が「売れた商品の仕入値」＝売上原価になった。序盤の赤字の正体はこれじゃ！",
    });
  },
};

// ───────── 貸倒引当金・貸倒れ ─────────

const RECEIVABLES = CONTRA_TARGETS.貸倒引当金!;

const allowance: EventTemplate = {
  lesson: "allowance",
  build: (ctx) => {
    const parts = RECEIVABLES.map((a) => ({ account: a, amount: ctx.balance(a) })).filter((x) => x.amount > 0);
    const base = sumAmounts(parts);
    const target = Math.floor((base * ALLOWANCE_RATE) / 100) * 100;
    const current = ctx.balance("貸倒引当金");
    const diff = target - current;
    if (base === 0 || diff === 0) return null;
    const list = parts.map((x) => `${x.account}${n(x.amount)}円`).join("・");
    const exam = `${list}の期末残高に対して${pct(ALLOWANCE_RATE)}の貸倒引当金を差額補充法により設定する（貸倒引当金の残高は${n(current)}円、100円未満は切り捨てる）。`;
    return adjustment("hoho", [`ツケや手形の残りは${list}。この${pct(ALLOWANCE_RATE)}（100円未満切り捨て）の${n(target)}円が貸倒れの見込みじゃ。`, `引当金の残高は${n(current)}円じゃから…？`], {
      story: `貸倒引当金を見積額${n(target)}円に合わせた。`,
      exam,
      answer: diff > 0 ? je([["貸倒引当金繰入", diff]], [["貸倒引当金", diff]]) : je([["貸倒引当金", -diff]], [["貸倒引当金戻入", -diff]]),
      idea: diff > 0 ? "見積額と今の残高の差額だけを繰り入れるよ（差額補充法）。" : "今の残高が見積額より多い。多すぎる分を戻すよ。",
      note: `見積額 ${n(target)} − 残高 ${n(current)} = ${n(diff)}円じゃ。`,
    });
  },
};

const badDebt: EventTemplate = {
  lesson: "allowance",
  review: 0.06,
  // 本当にツケを失うのは年に1度まで（それ以外の復習はギルドの帳簿相談になる）
  once: "year",
  build: (ctx) => {
    const { state, rand } = ctx;
    const ar = creditsOf(state, "売掛金").filter((c) => c.amount >= 2000);
    if (ar.length === 0) return null;
    const c = pick(rand, ar);
    const prior = c.day < yearStartDay(state.day);
    const reserve = prior ? Math.min(ctx.balance("貸倒引当金"), c.amount) : 0;
    const loss = c.amount - reserve;
    const debit: [AccountName, number][] = [];
    if (reserve > 0) debit.push(["貸倒引当金", reserve]);
    if (loss > 0) debit.push(["貸倒損失", loss]);
    const who = c.who === "allen" ? "アレン" : c.who === "gord" ? "ゴルド" : "お客さん";
    return {
      speaker: "cecil",
      lines: [
        `残念なお知らせです…${who}さんの冒険者パーティが解散して、ツケ${n(c.amount)}円は回収できそうにありません。`,
        prior ? `このツケは去年の分ですね。貸倒引当金の残高は${n(ctx.balance("貸倒引当金"))}円です。` : "このツケは今年に入ってからの分です。",
      ],
      choices: [
        {
          label: "貸倒れとして処理する",
          tx: {
            story: `${who}へのツケ${n(c.amount)}円が回収できなくなった。`,
            exam: prior
              ? `前期に生じた売掛金${n(c.amount)}円が回収不能となった（貸倒引当金の残高は${n(ctx.balance("貸倒引当金"))}円）。`
              : `当期に生じた売掛金${n(c.amount)}円が回収不能となった。`,
            answer: je(debit, [["売掛金", c.amount]]),
            idea: prior ? "前期の債権なら、まず貸倒引当金を取り崩す。足りない分は費用だよ。" : "当期の債権は、引当金の対象外。全額を費用にするよ。",
            effect: { settleCredits: [{ id: c.id, amount: c.amount }], reputation: -2 },
          },
        },
      ],
    };
  },
};

// ───────── 減価償却 ─────────

const LIFE: Record<"備品" | "車両運搬具", number> = { 備品: 5, 車両運搬具: 6 };
const ACCUMULATED = { 備品: "備品減価償却累計額", 車両運搬具: "車両運搬具減価償却累計額" } as const;

/** 仕訳帳から、その科目の固定資産を買った記録（取得原価と取得日）を拾う */
function assetsOf(state: GameState, account: "備品" | "車両運搬具") {
  return state.journal.flatMap((r) => r.entry.debit.filter((l) => l.account === account).map((l) => ({ cost: l.amount, day: r.day })));
}

function depreciation(account: "備品" | "車両運搬具"): EventTemplate {
  return {
    lesson: "depreciation",
    build: (ctx) => {
        const life = LIFE[account];
      const start = yearStartDay(ctx.state.day);
      const items = assetsOf(ctx.state, account).map((a) => {
        // 今年買った物は、買った月から決算月（3月）までの月割
        const months = a.day >= start ? 12 - monthOfYear(a.day) + 1 : 12;
        return { ...a, months, amount: Math.floor((a.cost / life) * (months / 12)) };
      });
      // 取得原価を超えて償却しない
      const room = sumAmounts(items.map((a) => ({ amount: a.cost }))) - ctx.balance(ACCUMULATED[account]);
      const amount = Math.min(sumAmounts(items), room);
      if (amount <= 0) return null;
      const detail = items
        .map((a) =>
          a.months < 12
            ? `取得原価${n(a.cost)}円（当期の${calendarMonth(monthOfYear(a.day))}月に取得、${a.months}か月分）`
            : `取得原価${n(a.cost)}円（前期以前に取得）`,
        )
        .join("、");
      return adjustment(
        "hoho",
        [`${account}の減価償却じゃ。耐用年数${life}年、残存価額ゼロの定額法、間接法で記帳する。`, `${detail}。`],
        {
          story: `${account}の減価償却費${n(amount)}円を計上した。`,
          exam: `${account}（${detail}）について、定額法（耐用年数${life}年、残存価額ゼロ、間接法）により減価償却を行う。期中取得分は月割計算により、円未満は切り捨てる。`,
          answer: je([["減価償却費", amount]], [[ACCUMULATED[account], amount]]),
          idea: "1年分は 取得原価 ÷ 耐用年数。今年買った物は、使った月数 ÷ 12 をかけるよ。",
          note: items.map((a) => `${n(a.cost)} ÷ ${life} × ${a.months}/12 = ${n(a.amount)}円`).join("、") + "。",
        },
      );
    },
  };
}

// ───────── 経過勘定・貯蔵品・現金過不足 ─────────

const INSURANCE = 12000;

const insurance: EventTemplate = {
  lesson: "fixedassets",
  schedule: "daily",
  build: (ctx) => {
    const { state } = ctx;
    if (ctx.balance("車両運搬具") <= 0) return null;
    // 1年ごとに更新する
    const last = lastRecord(state, "insurance");
    if (last && state.day - last.day < DAYS_PER_YEAR) return null;
    return {
      speaker: "cecil",
      lines: ["荷馬車の保険の更新時期です。", `これから1年分の保険料${n(INSURANCE)}円をお支払いください。`],
      choices: [
        {
          label: "普通預金から支払う",
          disabled: need(ctx, "普通預金", INSURANCE),
          tx: {
            story: `荷馬車の保険料1年分${n(INSURANCE)}円を払った。`,
            exam: `${calendarMonth(monthOfYear(state.day))}月1日に、向こう1年分の保険料${n(INSURANCE)}円を普通預金口座から支払った。`,
            answer: je([["支払保険料", INSURANCE]], [["普通預金", INSURANCE]]),
            idea: "保険料を払った。費用の科目は何だったかな？",
            note: "決算日に、来年の分は前払保険料に直すことになる。覚えておくのじゃ。",
          },
        },
      ],
    };
  },
};

const prepaid: EventTemplate = {
  lesson: "accruals",
  build: (ctx) => {
    const paid = thisYear(ctx.state).filter((r) => r.templateId === "insurance");
    const items = paid.map((r) => {
      const elapsed = 12 - monthOfYear(r.day) + 1;
      return { day: r.day, ahead: 12 - elapsed, amount: (INSURANCE * (12 - elapsed)) / 12 };
    });
    const amount = sumAmounts(items);
    if (amount <= 0) return null;
    const a = items[0];
    return adjustment("hoho", [`保険料は1年分払っておるが、決算日のあとの${a.ahead}か月分は来年の費用じゃ。`], {
      story: `保険料のうち来年分${n(amount)}円を前払保険料にした。`,
      exam: `保険料は、当期の${calendarMonth(monthOfYear(a.day))}月1日に向こう1年分${n(INSURANCE)}円を支払ったものである。前払分を月割で計上する。`,
      answer: je([["前払保険料", amount]], [["支払保険料", amount]]),
      idea: "来年の分まで払った費用は、来年分を資産に移すよ。",
      note: `${n(INSURANCE)} × ${a.ahead}/12 = ${n(amount)}円じゃ。`,
    });
  },
};

/** 決算日までに経過した月数（借りた月を1か月目と数える） */
const elapsedMonths = (from: number, to: number) => Math.floor((to - 1) / DAYS_PER_MONTH) - Math.floor((from - 1) / DAYS_PER_MONTH) + 1;

function accruedInterest(kind: "借入金" | "貸付金"): EventTemplate {
  const payable = kind === "借入金";
  return {
    lesson: "accruals",
    build: (ctx) => {
        const loans = creditsOf(ctx.state, kind).map((c) => {
        const months = Math.min(elapsedMonths(c.day, ctx.state.day), c.months ?? 12);
        return { c, months, amount: interestOf({ ...c, months }) };
      });
      const amount = sumAmounts(loans);
      if (amount <= 0) return null;
      const { c, months } = loans[0];
      const rate = pct(c.rate ?? 0);
      return adjustment(
        "hoho",
        [
          payable ? `借入金${n(c.amount)}円の利息は返すときにまとめて払う約束じゃが、決算日までの${months}か月分は今年の費用じゃ。` : `アレンに貸した${n(c.amount)}円の利息も、決算日までの${months}か月分は今年の収益じゃ。`,
        ],
        {
          story: payable ? `借入金の利息のうち今年分${n(amount)}円を未払計上した。` : `貸付金の利息のうち今年分${n(amount)}円を未収計上した。`,
          exam: payable
            ? `借入金${n(c.amount)}円（年利率${rate}、利息は元本返済時に支払う）について、決算日までの${months}か月分の利息を未払計上する。`
            : `貸付金${n(c.amount)}円（年利率${rate}、利息は元本回収時に受け取る）について、決算日までの${months}か月分の利息を未収計上する。`,
          answer: payable ? je([["支払利息", amount]], [["未払利息", amount]]) : je([["未収利息", amount]], [["受取利息", amount]]),
          idea: payable ? "今年分の費用なのに、まだ払っていない。費用を足して、払う義務（負債）を立てるよ。" : "今年分の収益なのに、まだ受け取っていない。収益を足して、受け取る権利（資産）を立てるよ。",
          note: `${n(c.amount)} × ${rate} × ${months}/12 = ${n(amount)}円じゃ。`,
        },
      );
    },
  };
}

const supplies: EventTemplate = {
  lesson: "accruals",
  build: (ctx) => {
    const bought = sumAmounts(thisYear(ctx.state).filter((r) => r.templateId === "letter").flatMap((r) => r.entry.debit));
    const unused = Math.floor((bought * 0.3) / 100) * 100;
    if (unused <= 0) return null;
    return adjustment("hoho", [`伝書フクロウ便の切手が、まだ${n(unused)}円分残っておる。使っていない分は今年の費用ではないぞ。`], {
      story: `使い残しの切手${n(unused)}円を貯蔵品にした。`,
      exam: `郵便切手の未使用分が${n(unused)}円ある（購入時に通信費で処理している）。`,
      answer: je([["貯蔵品", unused]], [["通信費", unused]]),
      idea: "使っていない切手は資産として持ち越すよ。費用から除こう。",
    });
  },
};

const cashdiffClose: EventTemplate = {
  lesson: "accruals",
  build: (ctx) => {
    const d = ctx.state.cashDiff;
    if (!d) return null;
    const amt = Math.abs(d.amount);
    const short = d.amount > 0;
    return adjustment("pipi", [short ? "結局、あのとき足りなかったお金の理由はわからなかったよ…" : "あのとき多かったお金、結局なんだったんだろうね？"], {
      story: `原因のわからなかった現金過不足${n(amt)}円を整理した。`,
      exam: short
        ? `現金過不足勘定の借方残高${n(amt)}円は、決算日まで原因が判明しなかった。`
        : `現金過不足勘定の貸方残高${n(amt)}円は、決算日まで原因が判明しなかった。`,
      answer: short ? je([["雑損", amt]], [["現金過不足", amt]]) : je([["現金過不足", amt]], [["雑益", amt]]),
      idea: short ? "原因不明の不足は、損失として片づけるよ。" : "原因不明の過剰は、利益として片づけるよ。",
      effect: { cashDiff: null },
    });
  },
};

// ───────── 法人税等 ─────────

const TAX_RATE = 0.3;

const corporateTax: EventTemplate = {
  lesson: "closing",
  build: (ctx) => {
    // 前の年度の収益・費用は損益振替でゼロになっているので、今の損益計算書がそのまま今年の損益
    const pretax = statements(ctx.state.journal.map((r) => r.entry)).netIncome;
    const tax = Math.max(0, Math.floor((pretax * TAX_RATE) / 100) * 100);
    // 中間納付した分（仮払法人税等）を差し引き、残りを未払に、払いすぎなら還付にする
    const prepaid = ctx.balance("仮払法人税等");
    if (tax <= 0 && prepaid <= 0) return null;
    const debit: [AccountName, number][] = tax > 0 ? [["法人税、住民税及び事業税", tax]] : [];
    const credit: [AccountName, number][] = prepaid > 0 ? [["仮払法人税等", prepaid]] : [];
    if (tax > prepaid) credit.push(["未払法人税等", tax - prepaid]);
    if (tax < prepaid) debit.push(["未収還付法人税等", prepaid - tax]);
    const prepaidText = prepaid > 0 ? `なお、中間納付額${n(prepaid)}円を仮払法人税等で処理している。` : "";
    return adjustment(
      "hoho",
      [`最後に税金じゃ。今年の利益（税引前当期純利益）の${pct(TAX_RATE)}を法人税等として計上する。`, `利益は${n(pretax)}円じゃから…${prepaid > 0 ? `中間納付した${n(prepaid)}円を差し引くのを忘れずにな。` : ""}`],
      {
        story: `今年の法人税等${n(tax)}円を計上した。`,
        exam: `当期の法人税、住民税及び事業税が${n(tax)}円と計算された（税引前当期純利益${n(pretax)}円の${pct(TAX_RATE)}、100円未満切り捨て）。${prepaidText}`,
        answer: je(debit, credit),
        idea: prepaid > 0 ? "税金も費用。前払いした分（仮払法人税等）を取り崩し、残りをまだ納めていない分にするよ。" : "税金も費用。まだ納めていないので、納める義務（負債）を立てるよ。",
      },
    );
  },
};

const payCorporateTax = payBalance("未払法人税等", {
  lesson: "closing",
  speaker: "hoho",
  // 5月（年度の2か月目）以降に納める
  when: (ctx) => monthOfYear(ctx.state.day) >= 2,
  lines: (amt) => [`去年の決算で計上した法人税等${n(amt)}円を、王国の税務所に納める時期じゃ。`],
  story: (amt) => `法人税等${n(amt)}円を納めた。`,
  exam: (amt, via) => `未払法人税等${n(amt)}円を${viaPhrase(via)}納付した。`,
  idea: "去年立てておいた、納める義務（負債）を取り崩すよ。",
  verb: "納付する",
});

// ───────── 新年度の再振替仕訳 ─────────

export function reversal(lesson: LessonId, account: AccountName, to: AccountName, line: string): EventTemplate {
  return {
    lesson,
    build: (ctx) => {
      const amt = ctx.balance(account);
      if (amt <= 0) return null;
      const asset = categoryOf(account) === "asset";
      return {
        speaker: "hoho",
        lines: [`新しい年度の初めじゃ。${line}`, `${account}${n(amt)}円を元の科目に戻す「再振替仕訳」をしよう。`],
        choices: [
          {
            label: "再振替仕訳を書く",
            tx: {
              story: `${account}${n(amt)}円を${to}に戻した。`,
              exam: `期首にあたり、前期末に計上した${account}${n(amt)}円について再振替仕訳を行う。`,
              answer: asset ? je([[to, amt]], [[account, amt]]) : je([[account, amt]], [[to, amt]]),
              idea: "決算日にした仕訳の、ちょうど逆を書けばよいよ。",
            },
          },
        ],
      };
    },
  };
}

export const CLOSING_TEMPLATES: Record<string, EventTemplate> = {
  "close-cogs-open": cogsOpen,
  "close-cogs-end": cogsEnd,
  "close-allowance": allowance,
  "close-dep-fixture": depreciation("備品"),
  "close-dep-vehicle": depreciation("車両運搬具"),
  "close-prepaid": prepaid,
  "close-unpaid-interest": accruedInterest("借入金"),
  "close-accrued-interest": accruedInterest("貸付金"),
  "close-supplies": supplies,
  "close-cashdiff": cashdiffClose,
  "close-tax": corporateTax,
  "bad-debt": badDebt,
  insurance,
  "pay-corp-tax": payCorporateTax,
  "reverse-prepaid": reversal("accruals", "前払保険料", "支払保険料", "去年の決算で来年分にした保険料は、今年の費用じゃ。"),
  "reverse-unpaid-interest": reversal("accruals", "未払利息", "支払利息", "未払にした利息は、返すときにまとめて払う。"),
  "reverse-accrued-interest": reversal("accruals", "未収利息", "受取利息", "未収にした利息は、回収するときにまとめて受け取る。"),
  "reverse-supplies": reversal("accruals", "貯蔵品", "通信費", "残っていた切手は、今年使う分じゃ。"),
};

const lesson = (id: LessonId): QueueItem => ({ kind: "lesson", id });
const ev = (id: string): QueueItem => ({ kind: "event", id });

/** 決算日の予定：講義 → 決算整理仕訳 → 精算表 → 財務諸表 */
export const CLOSING_PLAN: QueueItem[] = [
  lesson("kessan"),
  ev("close-cogs-open"),
  ev("close-cogs-end"),
  lesson("allowance"),
  ev("close-allowance"),
  lesson("depreciation"),
  ev("close-dep-fixture"),
  ev("close-dep-vehicle"),
  lesson("accruals"),
  ev("close-prepaid"),
  ev("close-unpaid-interest"),
  ev("close-accrued-interest"),
  ev("close-unearned-rent"),
  ev("close-supplies"),
  ev("close-cashdiff"),
  ev("close-salestax"),
  lesson("closing"),
  ev("close-tax"),
  { kind: "worksheet" },
  { kind: "report" },
];

/** 新しい年度の初日に、いちばん初めに行う再振替仕訳 */
export const OPENING_PLAN: QueueItem[] = [
  ev("reverse-prepaid"),
  ev("reverse-unpaid-interest"),
  ev("reverse-accrued-interest"),
  ev("reverse-unearned-rent"),
  ev("reverse-supplies"),
];
