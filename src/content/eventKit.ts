// 取引イベントを書くための共通部品

import { type AccountName, categoryOf } from "@/engine/accounts";
import { sumAmounts } from "@/engine/journal";
import type { CharacterId, Choice, Credit, CreditKind, GameEvent, GameState, ItemId, LessonId, Transaction } from "@/game/types";
import { CHARACTERS } from "./world";

export { fmt as n } from "@/engine/format";
export { entry as je } from "@/engine/journal";

export interface Ctx {
  state: GameState;
  rand: () => number;
  /** 任意の勘定の残高（増える側から見た値） */
  balance: (account: AccountName) => number;
  has: (lesson: LessonId) => boolean;
  /** 講義直後の練習。断る・半分だけなどの寄り道を出さない */
  guided: boolean;
}

export interface EventTemplate {
  lesson: LessonId;
  /** 講義を受けた後の出番。daily：毎日判定（起きるかは build が決める）／数値：その確率でときどき起きる */
  schedule?: "daily" | number;
  /** game：一度起きたら二度と起きない／day：1日に1回まで（進行側でまとめて判定する） */
  once?: "game" | "day";
  build(ctx: Ctx): Omit<GameEvent, "templateId"> | null;
}

export const pick = <T,>(rand: () => number, xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
export const name = (id: CharacterId) => CHARACTERS[id].name;
export const decline = (label: string, reply: string, reputation = 0): Choice => ({ label, reply, effect: { reputation } });

/** 店が大きくなるほど、一度に売り買いする量がふえる（Lv1〜2は1倍、Lv3〜4は2倍、Lv5は3倍） */
export const tradeScale = (level: number) => Math.ceil(level / 2);

/** 残高が足りなければ、選べない理由を返す */
export const need = (ctx: Ctx, account: AccountName, amount: number) =>
  ctx.balance(account) < amount ? `${account}が足りない` : undefined;
export const needCash = (ctx: Ctx, amount: number) => need(ctx, "現金", amount);
export const needDeposit = (ctx: Ctx, amount: number) => need(ctx, "普通預金", amount);

/** 試験文での支払い方の言い回し（「現金で」「普通預金口座から」） */
export const viaPhrase = (via: AccountName) => (via === "現金" ? "現金で" : `${via}口座から`);

/** 「○○から払う」の選択肢を支払元ごとに作る。残高が足りない支払元は選べない */
export function payFrom(ctx: Ctx, amount: number, vias: readonly AccountName[], tx: (via: AccountName) => Transaction, verb = "支払う"): Choice[] {
  return vias.map((via) => ({ label: `${via}${via === "現金" ? "で" : "から"}${verb}`, disabled: need(ctx, via, amount), tx: tx(via) }));
}

/** 利息 ＝ 元本 × 年利 × 月数 ÷ 12（円未満は四捨五入） */
export const interestOf = (c: { amount: number; rate?: number; months?: number }) => Math.round((c.amount * (c.rate ?? 0) * (c.months ?? 0)) / 12);
export const pct = (rate: number) => `${Math.round(rate * 100)}%`;

/**
 * その種類の債権・債務。ほかの債権・債務から against で指されているもの
 * （内容不明の入金の正体として確認待ちの売掛金など）は、ふだんの取引では使わないので除く
 */
export function creditsOf(state: GameState, kind: CreditKind, who?: CharacterId): Credit[] {
  const reserved = new Set(state.credits.map((c) => c.against));
  return state.credits.filter((c) => c.kind === kind && !reserved.has(c.id) && (!who || c.who === who));
}

/** その種類の債権・債務のうち、発生から days 日以上たったもの */
export function dueCredits(state: GameState, kind: CreditKind, days: number): Credit[] {
  return creditsOf(state, kind).filter((c) => c.day <= state.day - days);
}

/** 取り崩す債権・債務の一覧（全額） */
export const settleAll = (cs: Credit[]) => cs.map((c) => ({ id: c.id, amount: c.amount }));

/** 期日に決済する債権・債務：どの口座で決済し、発生から何日で期日が来るか */
const SETTLEMENT: Partial<Record<CreditKind, { via: AccountName; days: number }>> = {
  受取手形: { via: "当座預金", days: 2 },
  支払手形: { via: "当座預金", days: 3 },
  電子記録債権: { via: "当座預金", days: 2 },
  電子記録債務: { via: "当座預金", days: 3 },
  クレジット売掛金: { via: "普通預金", days: 2 },
  受取商品券: { via: "普通預金", days: 2 },
  未払金: { via: "普通預金", days: 2 },
  所得税預り金: { via: "普通預金", days: 2 },
};

/** 当座預金で決済を待っている債務を差し引いた、新しい支払いに使える当座預金 */
export function checkingRoom(ctx: Ctx): number {
  const pending = (Object.keys(SETTLEMENT) as CreditKind[])
    .filter((k) => SETTLEMENT[k]!.via === "当座預金" && categoryOf(k) === "liability")
    .flatMap((k) => creditsOf(ctx.state, k));
  return ctx.balance("当座預金") - sumAmounts(pending);
}

/**
 * 期日が来た債権・債務をまとめて決済するイベント。
 * 資産（受け取る権利）なら預金が増え、負債（払う義務）なら預金が減る。仕訳は種類から決まる。
 */
export function settleDue(
  kind: CreditKind,
  t: {
    lesson: LessonId;
    speaker: CharacterId;
    label?: string;
    lines: (amt: number) => string[];
    story: (amt: number) => string;
    exam: (amt: number) => string;
    idea: string;
  },
): EventTemplate {
  const { via, days } = SETTLEMENT[kind]!;
  const receivable = categoryOf(kind) === "asset";
  return {
    lesson: t.lesson,
    schedule: "daily",
    build: (ctx) => {
      const due = dueCredits(ctx.state, kind, days);
      if (due.length === 0) return null;
      const amt = sumAmounts(due);
      const tx: Transaction = {
        story: t.story(amt),
        exam: t.exam(amt),
        answer: receivable
          ? { debit: [{ account: via, amount: amt }], credit: [{ account: kind, amount: amt }] }
          : { debit: [{ account: kind, amount: amt }], credit: [{ account: via, amount: amt }] },
        idea: t.idea,
        effect: { settleCredits: settleAll(due) },
      };
      return {
        speaker: t.speaker,
        lines: t.lines(amt),
        choices: [{ label: t.label ?? "記帳する", tx, disabled: receivable ? undefined : need(ctx, via, amt) }],
      };
    },
  };
}

/** お客さんごとの好みの商品・口ぐせ・ツケを頼む確率 */
export const CUSTOMER_PREFS: Record<string, { items: ItemId[]; greet: string; creditRate: number; qty: Partial<Record<ItemId, number[]>> }> = {
  allen: { items: ["potion", "antidote", "ether"], greet: "よう店主！ 明日からダンジョンに潜るんだ。", creditRate: 0.7, qty: { potion: [5, 10], antidote: [5], ether: [3, 5] } },
  mina: { items: ["scroll", "antidote", "elixir"], greet: "こんにちは。魔法の研究に使うの。", creditRate: 0.2, qty: { scroll: [2, 3], antidote: [5, 10], elixir: [2] } },
  gord: { items: ["potion", "ether", "elixir"], greet: "おう、仲間の分もまとめて買いに来た。", creditRate: 0.2, qty: { potion: [10, 15, 20], ether: [5, 10], elixir: [2, 3] } },
  lily: { items: ["herb", "antidote"], greet: "神殿の治療室で使いたいのです。", creditRate: 0.2, qty: { herb: [10, 20], antidote: [5, 10] } },
};
