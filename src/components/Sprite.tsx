import { memo } from "react";

// ドット絵はパレット文字のグリッドで描く。左右対称な絵は左半分だけ書いて鏡写しにする。

const reversed = (row: string) => [...row].reverse().join("");
const mirror = (rows: string[]) => rows.map((r) => r + reversed(r));

const SPRITES = {
  // フクロウは32×32（ほかのキャラクターの倍の細かさ）。
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
  // 細かくする前のフクロウ。見比べ用のページ（/sprites）だけで使い、全員を描き直したら消す
  owl16: mirror([
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

/** まばたきのコマ：目のドットを、閉じたまぶたの色に差し替える */
const BLINK: Partial<Record<SpriteName, Record<string, string>>> = {
  owl: { w: "t", k: "t", W: "o", K: "o" },
  owl16: { w: "b", k: "b" },
  human: { e: "s" },
  dwarf: { e: "s" },
  fairy: { e: "s" },
};

/** 羽ばたきで上下に動かすドット（妖精の羽） */
const FLAP: Partial<Record<SpriteName, string>> = { fairy: "w" };

// ───────── ポーズ（コマ）：元の絵のドットを一部だけ差し替える ─────────

export type Pose = "walk1" | "walk2" | "walk3" | "walk4" | "crouch" | "armsUp" | "think" | "sleep" | "sweat" | "gesture";

/** [x, y, 文字]。文字はパレットの色（"." は透明、"x" は汗のしずく） */
type Edit = [number, number, string];

type Transform = (rows: readonly string[]) => readonly string[];

/** ポーズの作り方：ドットの差し替え、または絵全体の変換 */
type PoseDef = Edit[] | Transform;

/** 横に並んだドットの差し替え：(x, y) から右へ1文字ずつ */
const run = (x: number, y: number, chars: string): Edit[] => [...chars].map((c, i) => [x + i, y, c]);

/** 左右対称に差し替える（x と 幅−1−x） */
const sym =
  (width: number) =>
  (...edits: Edit[]): Edit[] =>
    edits.flatMap(([x, y, c]) => [[x, y, c] as Edit, [width - 1 - x, y, c] as Edit]);
const sym16 = sym(16);
const sym32 = sym(32);

function applyPose(rows: readonly string[], def: PoseDef): readonly string[] {
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

/** 目を閉じる：まばたきと同じく、目の色をまぶたの色に変える */
const eyesShut =
  (closed: Record<string, string>): Transform =>
  (rows) =>
    rows.map((r) => [...r].map((c) => closed[c] ?? c).join(""));

/** かがむ：指定した行を抜き、そのぶん全体を下げる */
const squash =
  (...cut: number[]): Transform =>
  (rows) => [...cut.map(() => ".".repeat(rows[0].length)), ...rows.filter((_, y) => !cut.includes(y))];

/** 人とドワーフ：手はふだん腰のあたり（11行目の x=2 と 13） */
const HANDS_DOWN = sym16([1, 11, "."], [2, 11, "o"]);
// 両足を開く（登場のときに、ふだんの足と交互に見せて歩かせる）
const LEGS_APART = [...sym16([2, 14, "o"], [3, 14, "p"], [4, 14, "p"], [5, 14, "o"], [6, 14, "."]), ...sym16([2, 15, "o"], [3, 15, "b"], [4, 15, "b"], [5, 15, "o"], [6, 15, "."])];
const BIPED: Partial<Record<Pose, PoseDef>> = {
  walk1: LEGS_APART,
  walk3: LEGS_APART,
  // 腰の行を詰める
  crouch: squash(13),
  // 両手を頭より高く上げる（袖を肩から上へのばし、てっぺんに手）
  armsUp: [
    ...HANDS_DOWN,
    ...sym16([1, 4, "o"], [0, 5, "o"], [1, 5, "s"], [0, 6, "o"], [1, 6, "s"], [0, 7, "o"], [1, 7, "c"], [0, 8, "o"], [1, 8, "c"], [1, 9, "o"], [2, 9, "c"]),
  ],
  // 片手をあごに当てる（袖を胸の前に回し、あごの下に手）
  think: [[1, 11, "."], [2, 11, "o"], [3, 10, "c"], [4, 10, "c"], [4, 9, "o"], [5, 9, "s"], [6, 9, "s"]],
  // 目を閉じる（目のドットを消して、その下に閉じたまぶたの線）
  sleep: sym16([5, 6, "s"], [4, 7, "o"], [5, 7, "o"]),
  // 片手を少し上げて話す
  gesture: [[14, 11, "."], [13, 11, "o"], [14, 10, "s"], [14, 9, "o"]],
  sweat: [[14, 4, "x"], [14, 5, "x"]],
};

// フクロウ（32×32）。左右対称なので、片側だけ作って反対側は flip か sym32 で作る

/** 歩く：頭から先に、体を左へ傾ける（上ほど大きくずらす） */
const leanLeft: Transform = (rows) =>
  rows.map((r, y) => {
    const n = y < 8 ? 2 : y < 19 ? 1 : 0;
    return r.slice(n) + ".".repeat(n);
  });
/** 画面右の足（x=19〜23）を上げる */
const OWL_FOOT_UP = [...run(19, 29, "ynyny"), ...run(19, 30, ".....")];
/** 上げた足を一歩前に下ろす：体は足の行を詰めて沈め、下ろした足だけ1ドット手前（下）に出す */
const OWL_FOOT_DOWN = chain(squash(29), [...run(19, 30, ".yyy."), ...run(19, 31, "ynyny")]);
/** たたんでいる翼（画面左）を、指定した行だけ消して体の輪郭にする */
const owlWingAway = (...ys: number[]): Edit[] => ys.flatMap((y) => run(1, y, ".o"));
/** 翼（画面左）を頭の横まで高く上げる */
const OWL_WING_UP = [
  ...run(0, 4, "o"),
  ...run(0, 5, "oo"),
  ...run(0, 6, "oto"),
  ...run(0, 7, "obbo"),
  ...[8, 9, 10, 11, 12, 13, 14].flatMap((y) => run(0, y, "obdbo")),
  ...[15, 16].flatMap((y) => run(0, y, "obbbo")),
  ...run(0, 17, ".obbb"),
  ...owlWingAway(19, 20, 21, 22, 23, 24),
];
/** 翼（画面左）をほおの高さまで少し上げる */
const OWL_WING_OUT = [
  ...run(1, 12, "o"),
  ...run(0, 13, "ot"),
  ...[14, 15, 16, 17, 18].flatMap((y) => run(0, y, "obd")),
  ...run(0, 19, "ob"),
  ...owlWingAway(21, 22, 23, 24),
];
const OWL: Partial<Record<Pose, PoseDef>> = {
  // 歩く4コマ：左に傾いて右足を上げる → 右足を下ろす → その左右反対を2コマ
  walk1: chain(OWL_FOOT_UP, leanLeft),
  walk2: OWL_FOOT_DOWN,
  walk3: chain(OWL_FOOT_UP, leanLeft, flip),
  walk4: chain(OWL_FOOT_DOWN, flip),
  // おなかの1行と足の行を詰める
  crouch: squash(22, 29),
  armsUp: sym32(...OWL_WING_UP),
  gesture: OWL_WING_OUT,
  // 目を上に向ける
  think: sym32(...run(9, 9, "wkk"), ...run(9, 10, "kkk"), ...run(9, 11, "kkk"), ...run(9, 12, "www"), ...run(9, 13, "WWW")),
  sleep: eyesShut(BLINK.owl!),
  // しずくの形（細い先から、下がふくらむ）
  sweat: [...[1, 2, 6].flatMap((y) => run(30, y, "x")), ...[3, 4, 5].flatMap((y) => run(29, y, "xxx"))],
};

const POSES: Partial<Record<SpriteName, Partial<Record<Pose, PoseDef>>>> = {
  human: BIPED,
  // ドワーフは目が人より1行上（5行目の x=4）
  dwarf: { ...BIPED, sleep: sym16([4, 5, "s"], [4, 6, "o"], [5, 6, "o"]) },
  owl: OWL,
  owl16: {
    // 翼を広げて上げる
    armsUp: sym16([0, 4, "o"], [0, 5, "b"], [0, 6, "b"], [0, 7, "o"]),
    gesture: [[0, 5, "o"], [0, 6, "b"], [0, 7, "o"]],
    // 目を上に向ける
    think: sym16([5, 6, "w"], [5, 5, "k"]),
    sleep: eyesShut(BLINK.owl16!),
    sweat: [[14, 3, "x"], [14, 4, "x"]],
  },
  fairy: { sleep: eyesShut(BLINK.fairy!), sweat: [[12, 2, "x"], [12, 3, "x"]] },
};

/** 作ったポーズの絵は使い回す（コマ送りのたびに作り直さない） */
const posedCache = new Map<string, readonly string[]>();

/** ポーズの絵。そのキャラクターにないポーズなら元の絵 */
function posed(name: SpriteName, pose: Pose | undefined): readonly string[] {
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

/** ポーズで使う、キャラクターのパレットにない色 */
const EXTRA_COLORS: Record<string, string> = { x: "#8fd3ff" };

/** 口パクのコマで暗くする口の位置：[x, y, 幅] */
const MOUTH: Partial<Record<SpriteName, [number, number, number]>> = {
  owl: [14, 15, 4],
  owl16: [7, 9, 2],
  human: [7, 8, 2],
  dwarf: [7, 7, 2],
  fairy: [7, 8, 2],
};

/** 名前から決まる、動き出すタイミングのずれ（全員が同時に動かないように） */
const offset = (key: string) => [...key].reduce((a, c) => a + c.charCodeAt(0), 0) % 7;

// 絵の中身は名前とパレットで決まるので、同じ props なら描き直さない
export const Sprite = memo(function Sprite({
  name,
  palette,
  size = 64,
  className = "",
  label,
  animate = false,
  talking = false,
  pose,
}: {
  name: SpriteName;
  palette: Record<string, string>;
  size?: number;
  className?: string;
  label?: string;
  /** まばたき・待機の揺れ・羽ばたきをつける */
  animate?: boolean;
  /** 口パク（話しはじめに数回だけ） */
  talking?: boolean;
  /** 今のコマのポーズ（省くと元の絵） */
  pose?: Pose;
}) {
  const rows = posed(name, pose);
  const colors = { ...EXTRA_COLORS, ...palette };
  const w = rows[0].length;
  const h = rows.length;
  const blink = animate ? BLINK[name] : undefined;
  const flap = animate ? FLAP[name] : undefined;
  const body: React.ReactNode[] = [];
  const eyesClosed: React.ReactNode[] = [];
  const wings: React.ReactNode[] = [];
  const mouth = talking ? MOUTH[name] : undefined;
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const fill = colors[ch];
      if (!fill) return;
      const rect = (key: string, color: string) => <rect key={key} x={x} y={y} width={1.02} height={1.02} fill={color} />;
      if (flap === ch) wings.push(rect(`w${x}-${y}`, fill));
      else body.push(rect(`${x}-${y}`, fill));
      // 閉じた目のコマは、開いた目の上に重ねてときどき見せる
      if (blink?.[ch]) eyesClosed.push(rect(`c${x}-${y}`, palette[blink[ch]]));
    });
  });
  // 動き出しのずれは CSS 変数で渡し、各アニメーションが共通で使う
  const style = animate ? ({ "--sprite-delay": `${-offset(label ?? name) * 0.37}s` } as React.CSSProperties) : undefined;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={(size * h) / w}
      className={`pixel ${animate ? "sprite-idle" : ""} ${className}`}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {wings.length > 0 && <g className="sprite-flap">{wings}</g>}
      {body}
      {eyesClosed.length > 0 && <g className="sprite-eyes-closed">{eyesClosed}</g>}
      {mouth && <rect className="sprite-talk" x={mouth[0]} y={mouth[1]} width={mouth[2]} height={1.02} fill={palette.o} />}
    </svg>
  );
});
