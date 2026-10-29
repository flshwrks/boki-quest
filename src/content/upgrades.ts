// 店の設備：朝の画面から買える。備品・車両運搬具として帳簿に載り、決算で減価償却する。
// 設備ごとに、店の経営に長く効く効果がある

import type { AccountName } from "@/engine/accounts";
import type { GameState, LessonId, Transaction } from "@/game/types";
import { je, n } from "./eventKit";
import { seasonOf } from "./seasons";

export type UpgradeId = "shelf" | "sign" | "showcase" | "coolbox" | "wagon";

export interface Upgrade {
  name: string;
  /** 試験の文での呼び名 */
  exam: string;
  account: "備品" | "車両運搬具";
  price: number;
  /** 付随費用（据付費・登録手数料）。取得原価に含める */
  fee?: { label: string; amount: number };
  /** 買えるようになる講義 */
  lesson: LessonId;
  /** 店への効果（朝の画面の説明） */
  effect: string;
}

export const UPGRADES: Record<UpgradeId, Upgrade> = {
  shelf: { name: "陳列棚", exam: "店舗用の陳列棚", account: "備品", price: 40000, lesson: "payables", effect: "大口の注文が起きやすくなる" },
  sign: { name: "魔導看板", exam: "店舗用の看板", account: "備品", price: 30000, lesson: "payables", effect: "評判が下がりにくくなる" },
  showcase: { name: "ガラスのショーケース", exam: "店舗用のショーケース", account: "備品", price: 60000, lesson: "payables", effect: "大口の注文が、ふだんの3倍の数量になる" },
  coolbox: {
    name: "魔法の保管箱",
    exam: "商品保管用の冷蔵ケース",
    account: "備品",
    price: 50000,
    fee: { label: "据付費", amount: 3000 },
    lesson: "fixedassets",
    effect: "ガンテツの特価が、さらに5%安くなる",
  },
  wagon: {
    name: "荷馬車",
    exam: "営業用の車両",
    account: "車両運搬具",
    price: 200000,
    fee: { label: "登録手数料", amount: 10000 },
    lesson: "fixedassets",
    effect: "毎月、遠くの村から大口の配達注文が来る",
  },
};

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

export const hasUpgrade = (state: GameState, id: UpgradeId) => state.upgrades.includes(id);

/** 取得原価（付随費用を含む） */
export const upgradeCost = (id: UpgradeId) => UPGRADES[id].price + (UPGRADES[id].fee?.amount ?? 0);

export type UpgradePay = "現金" | "普通預金" | "未払金";

/** 設備を買う取引。付随費用は取得原価に含める。月末払いなら未払金（商品ではない物の後払い） */
export function upgradeTx(id: UpgradeId, pay: UpgradePay): Transaction {
  const u = UPGRADES[id];
  const fee = u.fee?.amount ?? 0;
  const cost = upgradeCost(id);
  const credit: AccountName = pay;
  const feeText = u.fee ? `、${u.fee.label}${n(fee)}円とともに` : "";
  return {
    story: `${u.name}を${n(u.price)}円で買った${u.fee ? `（${u.fee.label}${n(fee)}円）` : ""}。${pay === "未払金" ? "代金は月末払い。" : `代金は${pay}で払った。`}`,
    exam:
      pay === "未払金"
        ? `${u.exam}${n(u.price)}円を購入し${feeText || "、"}代金は月末に支払うこととした。`
        : `${u.exam}${n(u.price)}円を購入し${feeText || "、"}代金は${pay === "現金" ? "現金で" : "普通預金口座から"}支払った。`,
    answer: je([[u.account, cost]], [[credit, cost]]),
    idea: u.fee
      ? "長く使う設備を買った。据付費や登録手数料のような付随費用は、設備の金額（取得原価）に含めるよ。"
      : pay === "未払金"
        ? "長く使う物を後払いで買った。商品ではない物の後払いは、買掛金とは別の科目だよ。"
        : "長く使う物を買った。商品ではないので、仕入ではなく設備の科目にするよ。",
    note: u.fee ? `付随費用は取得原価に含めるから、${u.account}は ${n(u.price)} + ${n(fee)} = ${n(cost)}円じゃ。` : undefined,
    effect: {
      upgrade: id,
      addCredits: pay === "未払金" ? [{ kind: "未払金", who: "gantetsu", amount: cost }] : undefined,
    },
  };
}

// ───────── 評判と信用 ─────────

/** 評判の段階。お客さんの数と、大口の注文（数量2倍）の起きやすさが変わる */
export const REP_TIERS = [
  { min: 80, name: "名店", bigOrder: 0.35, customers: 1, effect: "お客さんが多く、大口の注文がよく来る" },
  { min: 60, name: "評判の店", bigOrder: 0.2, customers: 1, effect: "お客さんが多く、大口の注文が来る" },
  { min: 20, name: "町の道具屋", bigOrder: 0, customers: 0, effect: "いつもどおり" },
  { min: 0, name: "無名の店", bigOrder: 0, customers: -1, effect: "お客さんが少ない" },
] as const;
export const repTier = (reputation: number) => REP_TIERS.find((t) => reputation >= t.min)!;

/** 大口の注文が起きる確率（陳列棚があると上がる） */
export const bigOrderRate = (state: GameState) => repTier(state.reputation).bigOrder + (hasUpgrade(state, "shelf") ? 0.1 : 0) + (seasonOf(state.day)?.bigOrder ?? 0);

/** 帳簿の信用がこれ以上なら、ガンテツの特価がさらに安くなる */
export const TRUSTED = 80;
