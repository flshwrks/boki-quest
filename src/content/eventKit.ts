// 取引イベントを書くための共通部品

import { type AccountName, categoryOf } from "@/engine/accounts";
import { sumAmounts } from "@/engine/journal";
import type { CharacterId, Choice, Credit, CreditKind, GameEvent, GameState, ItemId, LessonId, Transaction } from "@/game/types";
import { CHARACTERS, LEVELS } from "./world";

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
  /** game：一度起きたら二度と起きない／year：会計年度に1回／day：1日に1回（進行側でまとめて判定する） */
  once?: "game" | "year" | "day";
  build(ctx: Ctx): Omit<GameEvent, "templateId"> | null;
}

export const pick = <T,>(rand: () => number, xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
export const name = (id: CharacterId) => CHARACTERS[id].name;
export const decline = (label: string, reply: string, reputation = 0): Choice => ({ label, reply, effect: { reputation } });

/** 店が大きくなるほど、一度に売り買いする量がふえる */
export const tradeScale = (level: number) => LEVELS[level].scale;

/** 残高が足りなければ、選べない理由を返す */
export const need = (ctx: Ctx, account: AccountName, amount: number) =>
  ctx.balance(account) < amount ? `${account}が足りない` : undefined;
export const needCash = (ctx: Ctx, amount: number) => need(ctx, "現金", amount);
export const needDeposit = (ctx: Ctx, amount: number) => need(ctx, "普通預金", amount);

/** 試験文での支払い方の言い回し（「現金で」「普通預金口座から」） */
export const viaPhrase = (via: AccountName) => (via === "現金" ? "現金で" : `${via}口座から`);

/** 決算整理仕訳を1本書くだけのイベント */
export function adjustment(speaker: CharacterId, lines: string[], tx: Transaction): Omit<GameEvent, "templateId"> {
  return { speaker, lines, choices: [{ label: "決算整理仕訳を書く", tx }] };
}

/** ふつうの支払元 */
export const PAY_SOURCES: AccountName[] = ["普通預金", "当座預金", "現金"];

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

/**
 * 負債の残高（未払法人税等・未払消費税・未払配当金など）を、好きな支払元から全額払うイベント。
 * when で、払う時期を絞り込める。
 */
export function payBalance(
  account: AccountName,
  t: {
    lesson: LessonId;
    speaker: CharacterId;
    when?: (ctx: Ctx) => boolean;
    lines: (amt: number) => string[];
    story: (amt: number) => string;
    exam: (amt: number, via: AccountName) => string;
    idea: string;
    verb?: string;
  },
): EventTemplate {
  return {
    lesson: t.lesson,
    schedule: "daily",
    build: (ctx) => {
      if (t.when && !t.when(ctx)) return null;
      const amt = ctx.balance(account);
      if (amt <= 0) return null;
      return {
        speaker: t.speaker,
        lines: t.lines(amt),
        choices: payFrom(
          ctx,
          amt,
          PAY_SOURCES,
          (via) => ({ story: t.story(amt), exam: t.exam(amt, via), answer: { debit: [{ account, amount: amt }], credit: [{ account: via, amount: amt }] }, idea: t.idea }),
          t.verb,
        ),
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

/** お客さんの話し方。同じ場面でも、それぞれの口調で話す */
interface Voice {
  want: (item: string) => string;
  askCredit: string;
  askShipping: (fee: string) => string;
  askDiscount: string;
  noCash: string;
  soldOut: string;
  declined: string;
  payDebt: string;
  partial: (amt: string) => string;
  paid: (amt: string, bank: boolean) => string;
  returnGoods: (goods: string) => string;
  cardAsk: string;
  cardOnly: string;
  noteDebt: (amt: string) => string;
  transferred: (amt: string) => string;
}

const VOICES: Record<"allen" | "mina" | "gord" | "lily", Voice> = {
  // 戦士：くだけた男口調
  allen: {
    want: (item) => `${item}をくれ！`,
    askCredit: "代金はツケにしてくれないか？ 月末にはきっちり払うからさ。",
    askShipping: (fee) => `それと、遠征先の砦まで届けてほしいんだ。送料${fee}円はそっち持ちで頼むよ。`,
    askDiscount: "まとめ買いするからさ、1割まけてくれよ！",
    noCash: "今は手持ちがないんだ…また来るよ",
    soldOut: "品切れか…残念だな",
    declined: "そっか…",
    payDebt: "この前のツケ、払いに来たぜ！ ダンジョンで稼いできたんだ。",
    partial: (amt) => `悪い、今日は半分の${amt}円だけで勘弁してくれ…残りはまた今度！`,
    paid: (amt, bank) => (bank ? `${amt}円、ギルド経由で普通預金に振り込んでおいたぜ。` : `${amt}円、現金で持ってきたぜ。`),
    returnGoods: (goods) => `この前ツケで買った${goods}、栓がゆるんで漏れてたんだ…返品させてくれないか？`,
    cardAsk: "ギルドカードで払ってもいいか？",
    cardOnly: "悪い、カードしか持ってないんだ…",
    noteDebt: (amt) => `この前のツケ、ギルドの約束手形で払わせてくれ。額面${amt}円、期日は来月だ。`,
    transferred: (amt) => `そういえば、この前のツケ、銀行から振り込んでおいたぜ！ ${amt}円、届いてたか？`,
  },
  // 魔法使い：落ち着いた口調
  mina: {
    want: (item) => `${item}をいただけるかしら。`,
    askCredit: "お代はツケにしてもらえる？ 月末には必ず払うわ。",
    askShipping: (fee) => `それと、塔まで届けてもらえるかしら。送料${fee}円はそちら持ちでお願いね。`,
    askDiscount: "まとめて買うのだから、1割引いてもらえないかしら。",
    noCash: "あいにく持ち合わせがないの…また来るわね",
    soldOut: "品切れなのね…残念",
    declined: "そう…",
    payDebt: "先日のツケを払いに来たわ。",
    partial: (amt) => `ごめんなさい、今日は半分の${amt}円だけ。残りはまた今度ね。`,
    paid: (amt, bank) => (bank ? `${amt}円、普通預金に振り込んでおいたわ。` : `${amt}円、現金で持ってきたわ。`),
    returnGoods: (goods) => `この前ツケで買った${goods}、封が切れていたの。返品させてもらえる？`,
    cardAsk: "ギルドカードで払ってもいいかしら？",
    cardOnly: "あいにく、カードしか持っていないの…",
    noteDebt: (amt) => `先日のツケ、ギルドの約束手形でお支払いするわ。額面${amt}円、期日は来月よ。`,
    transferred: (amt) => `そういえば、先日のツケは銀行から振り込んでおいたわ。${amt}円、届いているかしら？`,
  },
  // 盾使い：豪快な口調
  gord: {
    want: (item) => `${item}を頼む。`,
    askCredit: "代金はツケにしといてくれんか。月末にまとめて払う。",
    askShipping: (fee) => `それと、砦まで運んでくれ。送料${fee}円はそっち持ちで頼む。`,
    askDiscount: "まとめ買いだ、1割まけてくれんか？",
    noCash: "今は持ち合わせがない…また来る",
    soldOut: "品切れか…しかたない",
    declined: "そうか…",
    payDebt: "おう、ツケを払いに来た。",
    partial: (amt) => `すまん、今日は半分の${amt}円だけだ。残りはまた今度払う。`,
    paid: (amt, bank) => (bank ? `${amt}円、普通預金に振り込んでおいたぞ。` : `${amt}円、現金で持ってきた。`),
    returnGoods: (goods) => `この前ツケで買った${goods}、瓶が割れておった。返品させてくれ。`,
    cardAsk: "ギルドカードで払ってもいいか？",
    cardOnly: "カードしか持っておらん…",
    noteDebt: (amt) => `この前のツケ、ギルドの約束手形で払わせてくれ。額面${amt}円、期日は来月だ。`,
    transferred: (amt) => `そういえば、この前のツケは銀行から振り込んでおいたぞ。${amt}円、届いとるか？`,
  },
  // 僧侶：丁寧語
  lily: {
    want: (item) => `${item}をいただけますか。`,
    askCredit: "お代はツケにしていただけますか？ 月末には必ずお支払いします。",
    askShipping: (fee) => `それと、神殿まで届けていただけますか。送料${fee}円はそちらのご負担でお願いします。`,
    askDiscount: "たくさんいただくので、1割お安くしていただけませんか？",
    noCash: "あいにく持ち合わせがなくて…また参りますね",
    soldOut: "品切れなのですね…残念です",
    declined: "そうですか…",
    payDebt: "先日のお代をお支払いしに参りました。",
    partial: (amt) => `申し訳ありません、今日は半分の${amt}円だけで…残りは改めてお持ちします。`,
    paid: (amt, bank) => (bank ? `${amt}円、普通預金にお振り込みしておきました。` : `${amt}円、現金でお持ちしました。`),
    returnGoods: (goods) => `先日ツケでいただいた${goods}、中身が傷んでいました。返品させていただけますか？`,
    cardAsk: "ギルドカードでお支払いしてもよろしいですか？",
    cardOnly: "申し訳ありません、カードしか持っていなくて…",
    noteDebt: (amt) => `先日のお代、ギルドの約束手形でお支払いさせてください。額面${amt}円、期日は来月です。`,
    transferred: (amt) => `そういえば、先日のお代は銀行からお振り込みしました。${amt}円、届いていますか？`,
  },
};

/** そのお客さんの話し方（お客さん以外が来たときは丁寧語） */
export const voiceOf = (who: CharacterId): Voice => VOICES[who as keyof typeof VOICES] ?? VOICES.lily;
