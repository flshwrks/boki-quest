// Lv5「王都の名店」の取引イベント：消費税、法人税等の中間納付、株主総会と配当

import type { AccountName } from "@/engine/accounts";
import { sumOf } from "@/engine/journal";
import { PAY_SOURCES, type EventTemplate, adjustment, je, n, payBalance, payFrom, viaPhrase } from "./eventKit";
import { DAYS_PER_YEAR, monthOfYear, yearStartDay } from "./world";

/** 決算日：仮受消費税と仮払消費税を相殺し、差額を納める（戻ってくる）額にする */
const closeSalesTax: EventTemplate = {
  lesson: "salestax",
  build: (ctx) => {
    const received = ctx.balance("仮受消費税");
    const paid = ctx.balance("仮払消費税");
    if (received === 0 && paid === 0) return null;
    const diff = received - paid;
    const debit: [AccountName, number][] = [["仮受消費税", received]];
    const credit: [AccountName, number][] = [["仮払消費税", paid]];
    if (diff > 0) credit.push(["未払消費税", diff]);
    if (diff < 0) debit.push(["未収還付消費税", -diff]);
    return adjustment(
      "hoho",
      [`消費税の整理じゃ。お客さんから預かった分（仮受消費税）は${n(received)}円、仕入れで払った分（仮払消費税）は${n(paid)}円。`, "相殺して、差額を国に納めるのじゃ。"],
      {
        story: `仮受消費税${n(received)}円と仮払消費税${n(paid)}円を相殺した。`,
        exam: `決算にあたり、仮受消費税${n(received)}円と仮払消費税${n(paid)}円を相殺し、差額を${diff >= 0 ? "未払消費税" : "未収還付消費税"}として計上する。`,
        answer: je(debit, credit),
        idea: diff >= 0 ? "預かった分のほうが多い。差額は国に納める義務（負債）になるよ。" : "払った分のほうが多い。差額は戻ってくる権利（資産）になるよ。",
      },
    );
  },
};

const paySalesTax = payBalance("未払消費税", {
  lesson: "salestax",
  speaker: "hoho",
  when: (ctx) => monthOfYear(ctx.state.day) >= 2,
  lines: (amt) => [`去年の決算で計上した消費税${n(amt)}円を納める時期じゃ。`],
  story: (amt) => `消費税${n(amt)}円を納めた。`,
  exam: (amt, via) => `未払消費税${n(amt)}円を${viaPhrase(via)}納付した。`,
  idea: "去年立てておいた、納める義務（負債）を取り崩すよ。",
  verb: "納付する",
});

/** 中間納付は、前年度の法人税等の半分（100円未満切り捨て）を11月（年度の8か月目）に払う */
const interimTax: EventTemplate = {
  lesson: "interimtax",
  schedule: "daily",
  once: "year",
  build: (ctx) => {
    const { state } = ctx;
    if (!ctx.guided && monthOfYear(state.day) !== 8) return null;
    const start = yearStartDay(state.day);
    const lastTax = state.journal
      .filter((r) => r.templateId === "close-tax" && r.day < start && r.day >= start - DAYS_PER_YEAR)
      .reduce((sum, r) => sum + sumOf(r.entry.debit, "法人税、住民税及び事業税"), 0);
    const amt = Math.floor(lastTax / 2 / 100) * 100;
    if (amt <= 0) return null;
    return {
      speaker: "hoho",
      lines: [`去年の法人税等は${n(lastTax)}円じゃった。その半分の${n(amt)}円を、今年分の前払いとして納める時期じゃ。`],
      choices: payFrom(
        ctx,
        amt,
        PAY_SOURCES,
        (via) => ({
          story: `法人税等の中間納付${n(amt)}円を納めた。`,
          exam: `法人税等の中間申告を行い、${n(amt)}円を${viaPhrase(via)}納付した。`,
          answer: je([["仮払法人税等", amt]], [[via, amt]]),
          idea: "今年の税額はまだ決まっていない。前払いした分は、とりあえず資産にしておくよ。",
        }),
        "納付する",
      ),
    };
  },
};

const DIVIDEND_RATE = 0.3;

/** 6月（年度の3か月目）の株主総会で、繰越利益剰余金の一部を配当する */
const dividendDecide: EventTemplate = {
  lesson: "dividends",
  schedule: "daily",
  once: "year",
  build: (ctx) => {
    if (!ctx.guided && monthOfYear(ctx.state.day) !== 3) return null;
    const retained = ctx.balance("繰越利益剰余金");
    const dividend = Math.floor((retained * DIVIDEND_RATE) / 1000) * 1000;
    if (dividend <= 0) return null;
    const reserve = dividend / 10;
    return {
      speaker: "cecil",
      lines: ["株主総会が開かれました！", `これまでの利益（繰越利益剰余金${n(retained)}円）から、配当金${n(dividend)}円を出すことに決まりました。利益準備金も積み立ててくださいね。`],
      choices: [
        {
          label: "配当の決議を記帳する",
          tx: {
            story: `株主総会で配当金${n(dividend)}円と、利益準備金${n(reserve)}円の積立てが決まった。`,
            exam: `株主総会において、繰越利益剰余金を財源として配当金${n(dividend)}円を支払うことが決議された。また、配当額の10分の1を利益準備金として積み立てる。`,
            answer: je(
              [["繰越利益剰余金", dividend + reserve]],
              [
                ["未払配当金", dividend],
                ["利益準備金", reserve],
              ],
            ),
            idea: "たまった利益から配当する。まだ払っていない配当金は負債、積み立てる準備金は純資産だよ。",
            note: `利益準備金は配当額の10分の1で ${n(reserve)}円。繰越利益剰余金は、配当と積立ての合計 ${n(dividend + reserve)}円を減らすのじゃ。`,
            effect: { reputation: 5 },
          },
        },
      ],
    };
  },
};

const dividendPay = payBalance("未払配当金", {
  lesson: "dividends",
  speaker: "cecil",
  lines: (amt) => [`株主の皆さまへの配当金${n(amt)}円をお支払いする日です。`],
  story: (amt) => `配当金${n(amt)}円を株主に払った。`,
  exam: (amt, via) => `株主総会で決議された配当金${n(amt)}円を${viaPhrase(via)}支払った。`,
  idea: "決議のときに立てた、払う義務（負債）を取り崩すよ。",
});

export const LV5_TEMPLATES: Record<string, EventTemplate> = {
  "close-salestax": closeSalesTax,
  "pay-sales-tax": paySalesTax,
  "interim-tax": interimTax,
  "dividend-decide": dividendDecide,
  "dividend-pay": dividendPay,
};
