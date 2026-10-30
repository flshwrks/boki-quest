// レアアイテムと店の内装（簿記とは関係のない、集める楽しみ）。
// レアアイテムはノーヒント正解のときにときどき見つかり、集めた数や実績に応じて店の内装が解禁される

import type { GameState } from "@/game/types";

export type Rarity = "common" | "rare" | "legendary";

export interface Treasure {
  id: string;
  icon: string;
  name: string;
  rarity: Rarity;
  /** 図鑑の説明 */
  text: string;
}

/** weight：見つかるときの重み。rank：飾る順（高いほど先） */
export const RARITY: Record<Rarity, { label: string; weight: number; rank: number; style: string }> = {
  common: { label: "ふつう", weight: 70, rank: 0, style: "border-white/40" },
  rare: { label: "レア", weight: 25, rank: 1, style: "border-sky-300/70 bg-sky-300/10" },
  legendary: { label: "伝説", weight: 5, rank: 2, style: "border-gold bg-gold/15" },
};

export const TREASURES: Treasure[] = [
  { id: "clover", icon: "🍀", name: "四つ葉の薬草", rarity: "common", text: "薬草の束にまぎれていた。持っているとツイている気がする。" },
  { id: "feather", icon: "🪶", name: "グリフォンの羽", rarity: "common", text: "窓から舞いこんできた。ペンにすると字がきれいに書ける…らしい。" },
  { id: "shell", icon: "🐚", name: "歌う貝殻", rarity: "common", text: "耳に当てると、遠い港の歌が聞こえる。" },
  { id: "bell", icon: "🔔", name: "妖精の鈴", rarity: "common", text: "いたずら妖精の落とし物。鳴らすと少しだけ気分が明るくなる。" },
  { id: "compass", icon: "🧭", name: "迷わずの羅針盤", rarity: "common", text: "いつも店のほうを指している。帰り道に迷わない。" },
  { id: "candle", icon: "🕯️", name: "消えないろうそく", rarity: "common", text: "夜なべの帳簿づけのお供。100年燃え続けているとか。" },
  { id: "mushroom", icon: "🍄", name: "光るきのこ", rarity: "common", text: "倉庫のすみで光っていた。食べないほうがいい。" },
  { id: "pebble", icon: "🪨", name: "ふしぎな石ころ", rarity: "common", text: "ただの石に見えるが、ときどき温かい。" },
  { id: "crystal", icon: "🔮", name: "占いの水晶", rarity: "rare", text: "のぞきこむと、明日のお客さんがぼんやり見える…気がする。" },
  { id: "key", icon: "🗝️", name: "古代の鍵", rarity: "rare", text: "どこの扉の鍵かはわからない。いつか開ける日が来るかも。" },
  { id: "horn", icon: "📯", name: "勇者の角笛", rarity: "rare", text: "伝説の勇者が置いていったツケのかた。本人はもう来ない。" },
  { id: "potion7", icon: "🧪", name: "七色の薬瓶", rarity: "rare", text: "振るたびに色が変わる。売り物ではない。" },
  { id: "golem", icon: "🪆", name: "ゴーレムの人形", rarity: "rare", text: "夜中にこっそり棚の整理をしてくれる。" },
  { id: "scale", icon: "🐉", name: "竜のうろこ", rarity: "legendary", text: "山の竜が、帳簿のきれいな店にだけ落としていくという。" },
  { id: "crown", icon: "👑", name: "失われた王冠", rarity: "legendary", text: "なぜか売上金の袋に入っていた。王様には内緒。" },
  { id: "star", icon: "🌟", name: "星のしずく", rarity: "legendary", text: "流れ星のかけら。持ち主の店をいつまでも照らす。" },
];

const BY_ID = new Map(TREASURES.map((t) => [t.id, t]));
export const treasureOf = (id: string) => BY_ID.get(id);

/** ノーヒント正解のとき、レアアイテムが見つかる確率（連続正解が多いほど上がる：5%〜15%） */
export const dropRate = (combo: number) => 0.05 + 0.01 * Math.min(combo, 10);

/** 見つかったレアアイテムを選ぶ（レア度の重みつき） */
export function pickTreasure(rand: () => number): Treasure {
  const total = TREASURES.reduce((a, t) => a + RARITY[t.rarity].weight, 0);
  let roll = rand() * total;
  return TREASURES.find((t) => (roll -= RARITY[t.rarity].weight) < 0) ?? TREASURES[0];
}

/** 集めた種類の数 */
export const kindsOf = (state: GameState) => Object.keys(state.treasures).length;

// ───────── 店の内装 ─────────

export type DecorId = "wood" | "stone" | "library" | "gold" | "dragon";

export interface Decor {
  name: string;
  /** 解禁の条件（図鑑に出す） */
  hint: string;
  unlocked: (state: GameState) => boolean;
  /** 店内の壁 */
  wall: string;
  /** カウンター */
  counter: string;
  /** 内装の飾り（壁にちりばめる） */
  ornament?: string;
}

export const DECORS: Record<DecorId, Decor> = {
  wood: { name: "木の店", hint: "はじめから", unlocked: () => true, wall: "repeating-linear-gradient(90deg,#6b4a2e 0 30px,#5e4027 30px 32px)", counter: "#7a4e28" },
  stone: {
    name: "石造りの店",
    hint: "実績を5つ集める",
    unlocked: (s) => s.achievements.length >= 5,
    wall: "repeating-linear-gradient(0deg,#6a6a74 0 22px,#55555e 22px 24px),#6a6a74",
    counter: "#5a5a66",
  },
  library: {
    name: "星空の書庫",
    hint: "レアアイテムを6種類集める",
    unlocked: (s) => kindsOf(s) >= 6,
    wall: "radial-gradient(circle at 20% 30%,#fff8 1px,transparent 2px),radial-gradient(circle at 70% 60%,#fff6 1px,transparent 2px),radial-gradient(circle at 45% 15%,#fff5 1px,transparent 2px),linear-gradient(#1c2350,#2e2a5c)",
    counter: "#4a3a6e",
    ornament: "✨",
  },
  gold: {
    name: "黄金の間",
    hint: "伝説のレアアイテムを1つ見つける",
    unlocked: (s) => TREASURES.some((t) => t.rarity === "legendary" && s.treasures[t.id]),
    wall: "repeating-linear-gradient(90deg,#8a6a1e 0 26px,#a8842a 26px 28px)",
    counter: "#c9a03a",
    ornament: "💰",
  },
  dragon: {
    name: "竜の巣",
    hint: "レアアイテムをすべて集める",
    unlocked: (s) => kindsOf(s) >= TREASURES.length,
    wall: "radial-gradient(circle at 50% 120%,#c84a2a,transparent 60%),linear-gradient(#3a1810,#5a2414)",
    counter: "#6a2a1a",
    ornament: "🔥",
  },
};

export const DECOR_IDS = Object.keys(DECORS) as DecorId[];
