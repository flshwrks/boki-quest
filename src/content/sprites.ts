// ドット絵と、そのコマ（ポーズ）。
// 絵はパレット文字のグリッドで描く。左右対称な絵は左半分だけ書いて鏡写しにする。
// キャラクターは 32×32。足もとは30行目にそろえ、31行目は足を前に出すコマのために空けておく。

const reversed = (row: string) => [...row].reverse().join("");
const mirror = (rows: string[]) => rows.map((r) => r + reversed(r));

export const SPRITES = {
  // 大文字の W・K は目のいちばん下の行で、まばたきのときにまぶたの線になる
  owl: mirror([
    "................",
    ".....o..........",
    ".....oo.........",
    ".....oto........",
    ".....obbo...oooo",
    "....obbbbooobbbb",
    "...obbbbbbbbbbbb",
    "..obbbbbbbbbbbtt",
    "..obbbbbggggbttt",
    "..obbbbgwwwwgbtt",
    "..obbbgwwwwwwgbt",
    "..obbbgwwwkkwggg",
    "..obbbgwwkkkwgbb",
    "..obbbgWWKKKWgbb",
    "..obbbbgwwwwgbyy",
    "..obbbbbggggbbyy",
    "..obbbbbbbbbbbbn",
    "..obbbbbbbllllll",
    "..obbbbbllllllll",
    ".obttbdlllllllll",
    ".obbbbdlllvvllll",
    ".obddbdlllllllll",
    ".obbbbdllllllvvl",
    ".obbdddlllllllll",
    ".obbbbdlllvvllll",
    "..obbbdlllllllll",
    "...obbbdllllllll",
    "....obbbdlllllll",
    ".....ooooooooooo",
    ".........yyy....",
    "........ynyny...",
    "................",
  ]),
  // 目は i（光）・e の下に E の行。まばたきでは E の行だけが残って、閉じた目の線になる
  human: mirror([
    "................",
    "..........oooooo",
    "........oohhhhhh",
    "......oohhhhhhhh",
    ".....ohhhLLLhhhh",
    "....ohhhLLhhhhhh",
    "....ohhhhhhhhhhh",
    "....ohhhhhhhhhhh",
    "....ohhhhhhhhhss",
    "....ohhhhhhsssss",
    "....ohhhhsssssss",
    "....ohhHssiessss",
    "....ohhHsseessss",
    "....ohhHssEEssss",
    "....ohhHssssssss",
    "....ohHnnsssssss",
    ".....oHssssssssn",
    ".....oosssssssss",
    ".......ooooosnnn",
    "......ooccccccdn",
    ".....occcccccccd",
    "....occdcccccccc",
    "....occdcccccccc",
    "....occdcccccccc",
    "....ossdcccccccc",
    ".....ooddddddddd",
    ".......opppppppp",
    ".......oppppppo.",
    ".......oppppppo.",
    ".......obbbbbbo.",
    "......obbbbbbbo.",
    "................",
  ]),
  dwarf: mirror([
    "................",
    "................",
    "................",
    "................",
    "................",
    "..........oooooo",
    "........oommmmmm",
    ".......omllmmmmm",
    "......ommlmmmmmm",
    "......ommmmmmmmm",
    ".....oMMMMMMMMMM",
    "......osssssssss",
    "......osssiessss",
    "......osssEEsnnn",
    "......orrssssnnn",
    "......orrrrrrrrr",
    ".....oorrrrrrrrr",
    "....occorrrRrrrr",
    "....occorrrrrrrr",
    "....occcorrrrRrr",
    "....occcorrrrrrr",
    "....osscorrRrrrr",
    "....ossccorrrrrr",
    ".....oocccorrrrr",
    "......oddddorrrr",
    "......oddddddorr",
    ".......opppppppp",
    ".......oppppppo.",
    ".......obbbbbbo.",
    ".......obbbbbbo.",
    "......obbbbbbbo.",
    "................",
  ]),
  // 羽は u（ふち）・w・W（光）。羽ばたきでまとめて動かすので、体の輪郭（o）とは文字を分けている
  fairy: mirror([
    "................",
    "................",
    "................",
    "................",
    "................",
    "...........ooooo",
    ".........oohhhhh",
    ".uuu....ohhLLhhh",
    "uwwwu..ohhhhhhhh",
    "uwWwwu.ohhhhhhss",
    "uwwWwwuohhhsssss",
    ".uwwWwwohhsiesss",
    ".uwwwWwohhsEEsss",
    "..uwwwwwohssssss",
    "..uwwwwwohnnssss",
    "...uwwwwwosssssn",
    "...uwwwwwwoossss",
    "....uwwwwocccccc",
    "...uwwwwoscccccc",
    "...uwwwuoocccccc",
    "..uwwwu..occcccc",
    "..uwwu..occccccc",
    "..uuu..occcccccc",
    "........ooooosso",
    "............osso",
    "............osso",
    "...........ooooo",
    "................",
    "................",
    "................",
    "................",
    "................",
  ]),
  bottle: mirror([
    "....oo",
    "....ok",
    "....ow",
    "...oww",
    "..owww",
    ".owrrr",
    ".orrrr",
    ".orrrr",
    ".orrrr",
    "..orrr",
    "...ooo",
    "......",
  ]),
  herb: mirror([
    "......",
    ".....g",
    "....gg",
    "...ggl",
    "..ggll",
    ".gglgg",
    "..gggg",
    "...ggs",
    ".....s",
    ".....s",
    ".....s",
    "......",
  ]),
  scroll: mirror([
    "......",
    ".ooooo",
    "ottttt",
    ".opppp",
    ".opkkk",
    ".opppp",
    ".opkkk",
    ".opppp",
    "ottttt",
    ".ooooo",
    "......",
    "......",
  ]),
} as const;

export type SpriteName = keyof typeof SPRITES;

type Rows = readonly string[];

/** まばたきのコマ：目のドットを、閉じたまぶたの色に差し替える */
export const BLINK: Partial<Record<SpriteName, Record<string, string>>> = {
  owl: { w: "t", k: "t", W: "o", K: "o" },
  human: { e: "s", i: "s" },
  dwarf: { e: "s", i: "s" },
  fairy: { e: "s", i: "s" },
};

/** 羽ばたきで上下に動かすドット（妖精の羽） */
export const FLAP: Partial<Record<SpriteName, string>> = { fairy: "uwW" };

/**
 * 待機の息づかいで沈む範囲：[頭, 上半身] のそれぞれ、この行より上を1ドット下げる。
 * 下げた分はすぐ下の行に重なるので、その行は上の行より幅が広くないこと。
 * 書いていないキャラクター（妖精）は、体ごと上下に浮く
 */
export const BREATH: Partial<Record<SpriteName, readonly [number, number]>> = {
  owl: [17, 22],
  human: [19, 26],
  dwarf: [17, 26],
};

/** 口パクのコマで暗くする口の位置：[x, y, 幅, 高さ] */
export const MOUTH: Partial<Record<SpriteName, readonly [number, number, number, number]>> = {
  owl: [14, 15, 4, 1],
  human: [15, 16, 2, 2],
  dwarf: [15, 15, 2, 2],
  fairy: [15, 15, 2, 1],
};

/** ポーズで使う、キャラクターのパレットにない色（x は汗のしずく、z は寝息の Z） */
export const EXTRA_COLORS: Record<string, string> = { x: "#8fd3ff", z: "#ffffff" };

// ───────── ポーズ（コマ）：元の絵のドットを差し替えたり、絵をずらしたりして作る ─────────

export type Pose =
  // 歩く：片足を上げかける → 上げて傾く → 一歩前に下ろす → 元の絵、を左右で（4と8は元の絵）
  | `walk${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`
  // かがむ（浅く・深く）
  | `crouch${1 | 2}`
  // 跳ぶ：のび上がる → 両手を上げきる → 下りてくる
  | `jump${1 | 2 | 3}`
  // 話す身ぶり：片手を上げかける → 上げる
  | `talk${1 | 2}`
  // 考える：上を見て、頭を左 → まんなか → 右
  | `think${1 | 2 | 3}`
  // 眠る：寝息の Z がのぼっていく（4は Z なし）
  | `sleep${1 | 2 | 3 | 4}`
  // あわてる：すくんで、汗のしずくが流れる
  | `oops${1 | 2 | 3}`;

/** [x, y, 文字]。文字はパレットの色（"." は透明） */
type Edit = [number, number, string];

type Transform = (rows: Rows) => Rows;

/** ポーズの作り方：ドットの差し替え、または絵全体の変換 */
type PoseDef = Edit[] | Transform;

type Frames = Partial<Record<Pose, PoseDef>>;

/** (x, y) を左上にして、小さな絵を重ねる。1行が1文字列で、空白のところは元の絵のまま */
const stamp = (x: number, y: number, ...lines: string[]): Edit[] =>
  lines.flatMap((line, dy) => [...line].flatMap((c, dx): Edit[] => (c === " " ? [] : [[x + dx, y + dy, c]])));

/** 左右対称に差し替える（x と 31−x） */
const sym = (...edits: Edit[]): Edit[] => edits.flatMap(([x, y, c]) => [[x, y, c] as Edit, [31 - x, y, c] as Edit]);

function applyPose(rows: Rows, def: PoseDef): Rows {
  if (typeof def === "function") return def(rows);
  const grid = rows.map((r) => [...r]);
  for (const [x, y, c] of def) if (grid[y]?.[x] !== undefined) grid[y][x] = c;
  return grid.map((r) => r.join(""));
}

/** 作り方を順に重ねる */
const chain =
  (...defs: PoseDef[]): Transform =>
  (rows) =>
    defs.reduce(applyPose, rows);

/** 左右を入れ替える（左右対称な絵の、反対側のコマを作る） */
const flip: Transform = (rows) => rows.map(reversed);

/** 色を差し替える（目を閉じる：まばたきと同じ差し替えを、絵そのものにする） */
const recolor =
  (map: Record<string, string>): Transform =>
  (rows) =>
    rows.map((r) => [...r].map((c) => map[c] ?? c).join(""));

/** 縮む：指定した行を抜き、そのぶん上を下げる */
const squash =
  (...cut: number[]): Transform =>
  (rows) => [...cut.map(() => ".".repeat(rows[0].length)), ...rows.filter((_, y) => !cut.includes(y))];

/** のびる：指定した行を2行にして、そのぶん上を上げる（いちばん上の空いた行を使う） */
const stretch =
  (...double: number[]): Transform =>
  (rows) =>
    rows.flatMap((r, y) => (double.includes(y) ? [r, r] : [r])).slice(double.length);

/** 傾く：指定した行より上を、左へ1ドットずらす（行を2つ書けば、上ほど大きくずれる） */
const lean =
  (...above: number[]): Transform =>
  (rows) =>
    rows.map((r, y) => {
      const n = above.filter((a) => y < a).length;
      return r.slice(n) + ".".repeat(n);
    });

/** 絵の一部（x0〜x1 の列の、top の行から下）を上へ n ドットずらす。n が負なら下へずらし、空いた行は元のまま（足がのびる） */
const lift =
  (x0: number, x1: number, top: number, n: number): Transform =>
  (rows) =>
    rows.map((r, y) => {
      if (y < top || y + n < top) return r;
      const from = (rows[y + n] ?? "").slice(x0, x1 + 1).padEnd(x1 + 1 - x0, ".");
      return r.slice(0, x0) + from + r.slice(x1 + 1);
    });

/** 歩く8コマ：片側の3コマ（上げかける・上げる・下ろす）から、左右反対の3コマも作る */
const walk = (rise: PoseDef, high: PoseDef, plant: PoseDef): Frames => ({
  walk1: rise,
  walk2: high,
  walk3: plant,
  walk5: chain(rise, flip),
  walk6: chain(high, flip),
  walk7: chain(plant, flip),
});

/** 考える3コマ：上を見た絵（look）のまま、neck の行より上（頭）を左右に傾ける */
const think = (look: PoseDef, neck: number): Frames => ({
  think1: chain(look, lean(neck)),
  think2: look,
  think3: chain(look, flip, lean(neck), flip),
});

/** 眠る4コマ：目を閉じ、belly の行を詰めて寝息をたてる。(x, y) の右上に Z がのぼっていく */
const sleep = (name: SpriteName, belly: number, x: number, y: number): Frames => {
  const shut = recolor(BLINK[name]!);
  return {
    sleep1: chain(shut, stamp(x, y + 3, "zz ", " z ", " zz")),
    sleep2: chain(shut, squash(belly), stamp(x + 1, y + 1, "zz ", " z ", " zz")),
    sleep3: chain(shut, squash(belly), stamp(x, y, "zzzz", "  z ", " z  ", "zzzz")),
    sleep4: shut,
  };
};

/** あわてる3コマ：belly の行を詰めてすくみ、(x, y) から汗のしずくが step ドットずつ流れ落ちる */
const oops = (belly: number, x: number, y: number, step = 2): Frames => {
  const drop = (n: number) => stamp(x, y + n * step, " x ", " x ", "xxx", "xxx", "xxx", " x ");
  return { oops1: chain(squash(belly), drop(0)), oops2: drop(1), oops3: drop(2) };
};

// フクロウ。翼は画面左の分だけ書き、両方上げるコマは sym で反対側も作る

/** たたんでいる翼を、指定した行だけ消して体の輪郭にする */
const owlWingAway = (...ys: number[]): Edit[] => ys.flatMap((y) => stamp(1, y, ".o"));
/** 翼を少し浮かせる */
const OWL_WING_LIFT = stamp(0, 18, " ot", "ob", "ob", "ob", "ob");
/** 翼をほおの高さまで上げる */
const OWL_WING_OUT = [...stamp(0, 12, " o", "ot", "obd", "obd", "obd", "obd", "obd", "ob"), ...owlWingAway(21, 22, 23, 24)];
/** 翼を頭の横まで高く上げる */
const OWL_WING_UP = [
  ...stamp(0, 4, "o", "oo", "oto", "obbo", "obdbo", "obdbo", "obdbo", "obdbo", "obdbo", "obdbo", "obdbo", "obbbo", "obbbo", ".obbb"),
  ...owlWingAway(19, 20, 21, 22, 23, 24),
];
/** 目を上に向ける */
const OWL_LOOK_UP = sym(...stamp(9, 9, "wkk", "kkk", "kkk", "www", "WWW"));

const OWL: Frames = {
  // 画面右の足（x=19〜23）を上げて、体を左へ傾ける。下ろすときは体を沈め、足を1ドット手前（下）に出す
  ...walk(
    chain(lift(19, 23, 29, 1), lean(19)),
    chain(lift(19, 23, 28, 2), lean(8, 19)),
    chain(squash(29), stamp(19, 30, ".yyy.", "ynyny")),
  ),
  crouch1: squash(24),
  crouch2: squash(20, 24, 29),
  jump1: chain(sym(...OWL_WING_OUT), stretch(25)),
  jump2: chain(sym(...OWL_WING_UP), stretch(25)),
  jump3: sym(...OWL_WING_OUT),
  talk1: OWL_WING_LIFT,
  talk2: OWL_WING_OUT,
  ...think(OWL_LOOK_UP, 17),
  ...sleep("owl", 22, 28, 0),
  ...oops(24, 29, 0),
};

// 人とドワーフ。足の位置（x=17〜25 が画面右の足）は同じなので、歩くコマは作り方を共有する

/** 人とドワーフの歩くコマ。legs は足のいちばん上の行、belly は一歩下ろすときに詰める行 */
const stride = (legs: number, belly: number): Frames =>
  walk(lift(17, 25, legs, 1), chain(lift(17, 25, legs, 2), lean(26)), chain(squash(belly), lift(17, 25, legs, -1)));

/** 腕（画面左）を下ろしたままの袖と手を消して、胴の輪郭にする */
const HUMAN_ARM_AWAY = stamp(4, 22, "...o", "...o", "...o", " ..o");
/** ひじを曲げて、手を横に出す */
const HUMAN_ARM_LIFT = stamp(1, 22, "ooo", "ossccc", "ossccc", "oooo");
/** 腕を肩の高さで横にのばす */
const HUMAN_ARM_OUT = [...stamp(0, 19, " ooooo", "ossccc", "ossccccc", " ooooooo"), ...stamp(4, 23, "...o", "...o", " ..o")];
/** 腕を頭の横まで高く上げる */
const HUMAN_ARM_UP = [
  ...stamp(0, 8, " oo", "osso", "osso", "occo", "occo", "occo", "occo", "occo", "occoo", "occoo", "occcooo", " occcccc", "  oocccc", "    oooc"),
  ...HUMAN_ARM_AWAY,
];
/** 上を見て、片手をほおに当てる */
const HUMAN_PONDER = [
  ...sym(...stamp(10, 10, "ie", "ee", "EE", "ss")),
  ...stamp(1, 12, " oo", "osso", "osso", "occo", "occo", "occo", "occooo", "occcccc", " occcc", "  ooooc"),
  ...HUMAN_ARM_AWAY,
];

const HUMAN: Frames = {
  ...stride(27, 23),
  crouch1: squash(27),
  crouch2: squash(23, 27),
  jump1: chain(sym(...HUMAN_ARM_OUT), stretch(27)),
  jump2: chain(sym(...HUMAN_ARM_UP), stretch(27)),
  jump3: sym(...HUMAN_ARM_UP),
  talk1: HUMAN_ARM_LIFT,
  talk2: HUMAN_ARM_OUT,
  ...think(HUMAN_PONDER, 18),
  ...sleep("human", 23, 28, 1),
  ...oops(23, 28, 2),
};

/** 手（画面左）を袖に戻す */
const DWARF_HAND_AWAY = stamp(5, 21, "cc", "cc");
/** 手を横に出す */
const DWARF_ARM_LIFT = stamp(2, 20, "ooo", "osscc", "osscc", "ooo");
/** 腕を肩の高さで横にのばす */
const DWARF_ARM_OUT = [...stamp(0, 16, "ooooo", "osscc", "osscc", "ooooo"), ...DWARF_HAND_AWAY];
/** 腕を頭の横まで高く上げる */
const DWARF_ARM_UP = [...stamp(2, 6, " oo", "osso", "osso", "occo", "occo", "occo", "occo", "occo", "occo", "occo", "occc", " occc"), ...DWARF_HAND_AWAY];
/** 上を見て、ひげをなでる */
const DWARF_PONDER = [...sym(...stamp(10, 11, "ie", "EE", "ss")), ...stamp(5, 19, "   oooooo", "ccccccsso", "ccccccsso", "ooooooooo")];

const DWARF: Frames = {
  ...stride(27, 22),
  crouch1: squash(27),
  crouch2: squash(20, 27),
  jump1: chain(sym(...DWARF_ARM_OUT), stretch(27)),
  jump2: chain(sym(...DWARF_ARM_UP), stretch(27)),
  jump3: sym(...DWARF_ARM_UP),
  talk1: DWARF_ARM_LIFT,
  talk2: DWARF_ARM_OUT,
  ...think(DWARF_PONDER, 17),
  ...sleep("dwarf", 20, 27, 0),
  ...oops(20, 27, 3),
};

// 妖精は飛んでいるので、歩くコマはない

/** 手（画面左）を顔の横に上げる */
const FAIRY_ARM_UP = stamp(6, 14, " oo", "oss", "occo", " occ", "  wo");

const FAIRY: Frames = {
  crouch1: squash(24),
  crouch2: squash(20, 24),
  jump1: sym(...FAIRY_ARM_UP),
  jump2: chain(sym(...FAIRY_ARM_UP), stretch(24)),
  jump3: sym(...FAIRY_ARM_UP),
  talk2: FAIRY_ARM_UP,
  ...think(sym(...stamp(11, 10, "ie", "EE", "ss")), 17),
  ...sleep("fairy", 24, 23, 0),
  // 羽の上の空いたところに出すので、しずくは少しだけ流す
  ...oops(24, 26, 0, 1),
};

const POSES: Partial<Record<SpriteName, Frames>> = { owl: OWL, human: HUMAN, dwarf: DWARF, fairy: FAIRY };

/** 作ったポーズの絵は使い回す（コマ送りのたびに作り直さない） */
const posedCache = new Map<string, Rows>();

/** ポーズの絵。そのキャラクターにないポーズなら元の絵 */
export function posed(name: SpriteName, pose: Pose | undefined): Rows {
  const rows = SPRITES[name];
  const def = pose && POSES[name]?.[pose];
  if (!def) return rows;
  const key = `${name}:${pose}`;
  let result = posedCache.get(key);
  if (!result) {
    result = applyPose(rows, def);
    posedCache.set(key, result);
  }
  return result;
}
