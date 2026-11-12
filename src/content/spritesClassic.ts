// 前の粗いドット絵（16×16）と、そのコマ。タイトル画面の「キャラクターの絵」で選ぶと、こちらで描く。
// 動きは1つにつき1コマだけ。商品の絵は、細かい絵と同じものを使う。

import { type Frames, SPRITES, type SpriteName, type SpriteSet, mirror, poser, recolor, squash, symmetric } from "./sprites";

const CLASSIC_SPRITES = {
  ...SPRITES,
  owl: mirror([
    "........",
    "..o.....",
    "..oo....",
    "..oboooo",
    ".obbbbbb",
    ".obgggbb",
    ".obgwkgb",
    ".obgggbb",
    ".obbbbby",
    ".obbllll",
    "obbllvll",
    "obblllll",
    ".obbllll",
    "..obbbbb",
    "...oyyoo",
    "........",
  ]),
  human: mirror([
    "........",
    "....oooo",
    "...ohhhh",
    "..ohhhhh",
    "..ohhsss",
    "..ohssss",
    "..ohsess",
    "..ohssss",
    "...ossss",
    "...occcc",
    "..occccc",
    ".osccccc",
    "..oddddd",
    "...opppp",
    "...oppo.",
    "...obbo.",
  ]),
  dwarf: mirror([
    "........",
    "........",
    "...ommmm",
    "..ommmmm",
    "..osssss",
    "..osesss",
    "..osssss",
    "..orrrss",
    "..orrrrr",
    "..orrrrr",
    ".ocrrrrr",
    ".oscrrrr",
    "..oddddd",
    "...opppp",
    "...oppo.",
    "...obbo.",
  ]),
  fairy: mirror([
    "........",
    "........",
    "........",
    ".ww.....",
    ".www..oo",
    ".wwwwohh",
    "..wwohss",
    "..wwoses",
    "...wosss",
    "....occc",
    "...osccc",
    "....occc",
    "....oso.",
    "y.......",
    "........",
    "........",
  ]),
};

const BLINK: SpriteSet["blink"] = {
  owl: { w: "b", k: "b" },
  human: { e: "s" },
  dwarf: { e: "s" },
  fairy: { e: "s" },
};

const sym = symmetric(16);

/** 下ろしている手を引っこめる（両手を上げるコマで使う） */
const HANDS_DOWN = sym([1, 11, "."], [2, 11, "o"]);

// 人とドワーフは体の形が同じなので、コマを共有する
const BIPED: Frames = {
  // 足を開く
  walk1: [
    ...sym([2, 14, "o"], [3, 14, "p"], [4, 14, "p"], [5, 14, "o"], [6, 14, "."]),
    ...sym([2, 15, "o"], [3, 15, "b"], [4, 15, "b"], [5, 15, "o"], [6, 15, "."]),
  ],
  // かがむ：脚の行を1つ抜く
  crouch1: squash(13),
  // 両手を上げる
  jump1: [
    ...HANDS_DOWN,
    ...sym([1, 4, "o"], [0, 5, "o"], [1, 5, "s"], [0, 6, "o"], [1, 6, "s"], [0, 7, "o"], [1, 7, "c"], [0, 8, "o"], [1, 8, "c"], [1, 9, "o"], [2, 9, "c"]),
  ],
  // 片手をあごに
  think1: [
    [1, 11, "."],
    [2, 11, "o"],
    [3, 10, "c"],
    [4, 10, "c"],
    [4, 9, "o"],
    [5, 9, "s"],
    [6, 9, "s"],
  ],
  // 目を閉じる（目の1行下に、まぶたの線）
  sleep1: sym([5, 6, "s"], [4, 7, "o"], [5, 7, "o"]),
  // 片手を上げる
  talk1: [
    [14, 11, "."],
    [13, 11, "o"],
    [14, 10, "s"],
    [14, 9, "o"],
  ],
  // 汗のしずく
  oops1: [
    [14, 4, "x"],
    [14, 5, "x"],
  ],
};

const POSES: Partial<Record<SpriteName, Frames>> = {
  human: BIPED,
  // ドワーフは目が人より1行上（5行目の x=4）
  dwarf: { ...BIPED, sleep1: sym([4, 5, "s"], [4, 6, "o"], [5, 6, "o"]) },
  owl: {
    // 翼を広げて上げる
    jump1: sym([0, 4, "o"], [0, 5, "b"], [0, 6, "b"], [0, 7, "o"]),
    talk1: [
      [0, 5, "o"],
      [0, 6, "b"],
      [0, 7, "o"],
    ],
    // 目を上に向ける
    think1: sym([5, 6, "w"], [5, 5, "k"]),
    sleep1: recolor(BLINK.owl!),
    oops1: [
      [14, 3, "x"],
      [14, 4, "x"],
    ],
  },
  fairy: {
    sleep1: recolor(BLINK.fairy!),
    oops1: [
      [12, 2, "x"],
      [12, 3, "x"],
    ],
  },
};

/** 前の粗い絵（16×16）のそろい。息づかいはなく、待機は体ごと上下に浮く */
export const CLASSIC: SpriteSet = {
  rows: poser(CLASSIC_SPRITES, POSES),
  blink: BLINK,
  flap: { fairy: "w" },
  breath: {},
  mouth: { owl: [7, 9, 2, 1], human: [7, 8, 2, 1], dwarf: [7, 7, 2, 1], fairy: [7, 8, 2, 1] },
};
