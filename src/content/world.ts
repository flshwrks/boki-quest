import type { CharacterId, ItemId } from "@/game/types";

export interface Character {
  name: string;
  title: string;
  sprite: "owl" | "human" | "dwarf" | "fairy";
  palette: Record<string, string>;
}

const human = (hair: string, cloth: string, clothDark: string, pants: string): Record<string, string> => ({
  o: "#1d1d2b",
  h: hair,
  s: "#f2c9a0",
  e: "#1d1d2b",
  c: cloth,
  d: clothDark,
  p: pants,
  b: "#4a2e1a",
});

export const CHARACTERS: Record<CharacterId, Character> = {
  hoho: {
    name: "ホーホー先生",
    title: "元・王国財務院の帳簿官",
    sprite: "owl",
    palette: {
      o: "#3b2414",
      b: "#8a5a2b",
      l: "#e8d2a6",
      v: "#c9a46a",
      w: "#ffffff",
      k: "#1a1a1a",
      y: "#f0b030",
      g: "#d4af37",
    },
  },
  cecil: { name: "セシル", title: "商人ギルドの受付", sprite: "human", palette: human("#c8553d", "#2f5fb3", "#203f78", "#3a3a4a") },
  gantetsu: {
    name: "ガンテツ",
    title: "ドワーフ商会の問屋",
    sprite: "dwarf",
    palette: { o: "#1d1d2b", m: "#8c8c9c", s: "#e0a878", e: "#1d1d2b", r: "#b8642a", c: "#5a7d2a", d: "#3e5a1c", p: "#5a3e2a", b: "#2e1e12" },
  },
  allen: { name: "アレン", title: "ツケ払い常連の戦士", sprite: "human", palette: human("#e0b030", "#a83232", "#6e1f1f", "#3a3a4a") },
  mina: { name: "ミーナ", title: "魔法使い", sprite: "human", palette: human("#6b3fa0", "#3a2a6a", "#24183f", "#24183f") },
  gord: { name: "ゴルド", title: "まとめ買いの盾使い", sprite: "human", palette: human("#5a3a1a", "#7a7a8a", "#4a4a5a", "#3a2a1a") },
  lily: { name: "リリィ", title: "薬草好きの僧侶", sprite: "human", palette: human("#f0e0b0", "#f0f0f0", "#b0b0c0", "#8090b0") },
  pipi: {
    name: "ピピ",
    title: "いたずら妖精",
    sprite: "fairy",
    palette: { o: "#1d1d2b", w: "#a8e8f8", h: "#f878b8", s: "#f8d8b8", e: "#1d1d2b", c: "#58c878", y: "#f8e858" },
  },
  rose: { name: "マダム・ローズ", title: "店舗の大家", sprite: "human", palette: human("#d04070", "#802050", "#501030", "#301020") },
  luke: { name: "ルーク", title: "王都銀行の窓口係", sprite: "human", palette: human("#303040", "#e8e8f0", "#202838", "#202838") },
  noel: { name: "ノエル", title: "住み込みの見習い店員", sprite: "human", palette: human("#3a8a5a", "#e8c860", "#a88a30", "#3a3a4a") },
};

export interface Item {
  name: string;
  unit: string;
  cost: number;
  price: number;
  level: number;
  palette: Record<string, string>;
  sprite: "bottle" | "herb" | "scroll";
}

export const ITEMS: Record<ItemId, Item> = {
  potion: {
    name: "ポーション",
    unit: "本",
    cost: 600,
    price: 1000,
    level: 1,
    sprite: "bottle",
    palette: { o: "#1d1d2b", k: "#8a5a2b", w: "#d8f0f8", r: "#e04848" },
  },
  herb: {
    name: "薬草",
    unit: "束",
    cost: 200,
    price: 400,
    level: 1,
    sprite: "herb",
    palette: { g: "#3a9a3a", l: "#8ad84a", s: "#6a4a2a" },
  },
  antidote: {
    name: "毒消し",
    unit: "個",
    cost: 400,
    price: 700,
    level: 1,
    sprite: "bottle",
    palette: { o: "#1d1d2b", k: "#8a5a2b", w: "#d8f0f8", r: "#9a48d8" },
  },
  scroll: {
    name: "魔法の巻物",
    unit: "巻",
    cost: 3000,
    price: 5000,
    level: 2,
    sprite: "scroll",
    palette: { o: "#1d1d2b", t: "#b07a3a", p: "#f4e4c0", k: "#6a5a8a" },
  },
  ether: {
    name: "エーテル",
    unit: "本",
    cost: 1500,
    price: 2500,
    level: 3,
    sprite: "bottle",
    palette: { o: "#1d1d2b", k: "#8a5a2b", w: "#d8f0f8", r: "#3a8ae8" },
  },
  elixir: {
    name: "エリクサー",
    unit: "本",
    cost: 6000,
    price: 10000,
    level: 5,
    sprite: "bottle",
    palette: { o: "#1d1d2b", k: "#d4af37", w: "#fff8d8", r: "#f0c850" },
  },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

/** 商品ごとの値を作る（在庫の数・在庫の原価など） */
export const perItem = (f: (id: ItemId) => number) => Object.fromEntries(ITEM_IDS.map((id) => [id, f(id)])) as Record<ItemId, number>;

export interface Level {
  name: string;
  rent: number;
  /** 昇格審査の名前 */
  exam: string;
  /** 成長したときに見せる変化 */
  perks: string[];
  /** 成長したときの師匠のひとこと */
  hoho: string;
  /** 記帳を本番と同じCBT形式にする（設定で変えていなければ） */
  cbt?: boolean;
  /** 一度に売り買いする量の倍率（店が大きくなるほどふえる） */
  scale: number;
}

export const LEVELS: Record<number, Level> = {
  1: { name: "露店", rent: 5000, scale: 1, exam: "", perks: [], hoho: "" },
  2: {
    name: "小さな店舗",
    rent: 10000,
    scale: 1,
    exam: "商人ギルドの昇格審査",
    perks: ["ギルドの審査に合格し、通りに面した店舗を借りた", "新商品「魔法の巻物」を扱えるようになった", "取引先が増え、新しい講義が始まる"],
    hoho: "ホッホ、立派になったのう。ここからは「ツケ」の世界じゃ。帳簿の腕がますます試されるぞ。",
  },
  3: {
    name: "商店街の店",
    rent: 15000,
    scale: 2,
    cbt: true,
    exam: "王都銀行の融資審査",
    perks: ["銀行の融資審査に合格し、商店街の大きな店に移った", "新商品「エーテル」を扱えるようになった", "手形やカード払いなど、支払い方が多彩になる"],
    hoho: "見事じゃ！ これからは手形や電子記録など、お金の「形」がいろいろになる。ここからは記帳も本番の試験と同じ形式でやってみよう。",
  },
  4: {
    name: "城下町の大店",
    rent: 20000,
    scale: 2,
    cbt: true,
    exam: "王都銀行の大口融資審査",
    perks: ["大口融資の審査に合格し、城下町の大通りに店を構えた", "見習い店員ノエルを雇う", "借入・設備投資・給料など、会社らしいお金の動きが始まる"],
    hoho: "ここまで来たか！ 人を雇い、お金を借り、設備を買う。立派な会社の帳簿じゃ。3級の範囲もいよいよ終盤じゃぞ。",
  },
  5: {
    name: "王都の名店",
    rent: 25000,
    scale: 3,
    cbt: true,
    exam: "王国商工会議所の審査",
    perks: ["商工会議所の審査に合格し、王都の目抜き通りの名店になった", "伝説の霊薬「エリクサー」を扱えるようになった", "消費税・税金の前払い・株主への配当など、本格的な会社の仕事が始まる"],
    hoho: "ついにここまで来たのう。これが3級の最後の範囲じゃ。ここまでの全部がつながったら、試験はもう怖くないぞ。",
  },
};

export const DAYS_PER_MONTH = 5;

/** その月の何営業日目か（1〜DAYS_PER_MONTH） */
export function dayInMonth(day: number): number {
  return ((day - 1) % DAYS_PER_MONTH) + 1;
}

/** 会計年度は4月〜3月。1年は12か月 × DAYS_PER_MONTH 営業日 */
export const DAYS_PER_YEAR = 12 * DAYS_PER_MONTH;

/** 何年目の会計年度か（1始まり） */
export const fiscalYear = (day: number) => Math.floor((day - 1) / DAYS_PER_YEAR) + 1;

/** 会計年度の初日 */
export const yearStartDay = (day: number) => (fiscalYear(day) - 1) * DAYS_PER_YEAR + 1;

/** 会計年度の何か月目か（4月 = 1 … 3月 = 12） */
export const monthOfYear = (day: number) => Math.floor(((day - 1) % DAYS_PER_YEAR) / DAYS_PER_MONTH) + 1;

/** 年度の最終営業日（3月の最終日）か */
export const isYearEnd = (day: number) => day % DAYS_PER_YEAR === 0;

/** 4月 = 1 として、カレンダーの月（4〜12, 1〜3）にする */
export const calendarMonth = (monthIndex: number) => ((monthIndex + 2) % 12) + 1;

export function dateLabel(day: number): string {
  const monthIndex = Math.floor((day - 1) / DAYS_PER_MONTH);
  const month = ((monthIndex + 3) % 12) + 1; // 4月始まり
  return `${month}月 第${dayInMonth(day)}営業日`;
}

/** そのレベルの店で扱える商品 */
export function itemsForLevel(level: number): ItemId[] {
  return ITEM_IDS.filter((id) => ITEMS[id].level <= level);
}
