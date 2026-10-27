import { memo } from "react";

// ドット絵はパレット文字のグリッドで描く。左右対称な絵は左半分だけ書いて鏡写しにする。

const mirror = (rows: string[]) => rows.map((r) => r + [...r].reverse().join(""));

const SPRITES = {
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
  owl: { w: "b", k: "b" },
  human: { e: "s" },
  dwarf: { e: "s" },
  fairy: { e: "s" },
};

/** 羽ばたきで上下に動かすドット（妖精の羽） */
const FLAP: Partial<Record<SpriteName, string>> = { fairy: "w" };

// ───────── ポーズ（コマ）：元の絵のドットを一部だけ差し替える ─────────

export type Pose = "walk" | "crouch" | "armsUp" | "think" | "sleep" | "sweat" | "gesture";

/** [x, y, 文字]。文字はパレットの色（"." は透明、"x" は汗のしずく） */
type Edit = [number, number, string];

/** 左右対称に差し替える（x と 15−x） */
const sym = (...edits: Edit[]): Edit[] => edits.flatMap(([x, y, c]) => [[x, y, c] as Edit, [15 - x, y, c] as Edit]);

/** 人とドワーフ：手はふだん腰のあたり（11行目の x=2 と 13） */
const HANDS_DOWN = sym([1, 11, "."], [2, 11, "o"]);
const BIPED: Partial<Record<Pose, Edit[]>> = {
  // 両足を開く（登場のときに、ふだんの足と交互に見せて歩かせる）
  walk: [...sym([2, 14, "o"], [3, 14, "p"], [4, 14, "p"], [5, 14, "o"], [6, 14, "."]), ...sym([2, 15, "o"], [3, 15, "b"], [4, 15, "b"], [5, 15, "o"], [6, 15, "."])],
  // 両手を頭より高く上げる（袖を肩から上へのばし、てっぺんに手）
  armsUp: [
    ...HANDS_DOWN,
    ...sym([1, 4, "o"], [0, 5, "o"], [1, 5, "s"], [0, 6, "o"], [1, 6, "s"], [0, 7, "o"], [1, 7, "c"], [0, 8, "o"], [1, 8, "c"], [1, 9, "o"], [2, 9, "c"]),
  ],
  // 片手をあごに当てる（袖を胸の前に回し、あごの下に手）
  think: [[1, 11, "."], [2, 11, "o"], [3, 10, "c"], [4, 10, "c"], [4, 9, "o"], [5, 9, "s"], [6, 9, "s"]],
  // 目を閉じる（目のドットを消して、その下に閉じたまぶたの線）
  sleep: sym([5, 6, "s"], [4, 7, "o"], [5, 7, "o"]),
  // 片手を少し上げて話す
  gesture: [[14, 11, "."], [13, 11, "o"], [14, 10, "s"], [14, 9, "o"]],
  sweat: [[14, 4, "x"], [14, 5, "x"]],
};
const POSES: Partial<Record<SpriteName, Partial<Record<Pose, Edit[]>>>> = {
  human: BIPED,
  // ドワーフは目が人より1行上（5行目の x=4）
  dwarf: { ...BIPED, sleep: sym([4, 5, "s"], [4, 6, "o"], [5, 6, "o"]) },
  owl: {
    // 翼を広げて上げる
    armsUp: sym([0, 4, "o"], [0, 5, "b"], [0, 6, "b"], [0, 7, "o"]),
    gesture: [[0, 5, "o"], [0, 6, "b"], [0, 7, "o"]],
    // 目を上に向ける
    think: sym([5, 6, "w"], [5, 5, "k"]),
    sweat: [[14, 3, "x"], [14, 4, "x"]],
  },
  fairy: { sweat: [[12, 2, "x"], [12, 3, "x"]] },
};

/** ポーズの絵。眠りは目を閉じたコマ、かがむのは全体を1ドット下げて腰を詰める */
function posed(name: SpriteName, pose: Pose | undefined): readonly string[] {
  const rows = SPRITES[name];
  if (!pose) return rows;
  if (pose === "sleep" && !POSES[name]?.sleep) {
    const closed = BLINK[name] ?? {};
    return rows.map((r) => [...r].map((c) => closed[c] ?? c).join(""));
  }
  if (pose === "crouch") {
    if (!POSES[name]?.walk) return rows;
    return [".".repeat(rows[0].length), ...rows.slice(0, 13), ...rows.slice(14)];
  }
  const edits = POSES[name]?.[pose];
  if (!edits) return rows;
  const grid = rows.map((r) => [...r]);
  for (const [x, y, c] of edits) if (grid[y]?.[x] !== undefined) grid[y][x] = c;
  return grid.map((r) => r.join(""));
}

/** ポーズで使う、キャラクターのパレットにない色 */
const EXTRA_COLORS: Record<string, string> = { x: "#8fd3ff" };

/** 口パクのコマで口になる行。顔の中央2ドット（x = 7, 8）を暗くする */
const MOUTH_ROW: Partial<Record<SpriteName, number>> = { owl: 9, human: 8, dwarf: 7, fairy: 8 };

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
  const w = rows[0].length;
  const h = rows.length;
  const blink = animate ? BLINK[name] : undefined;
  const flap = animate ? FLAP[name] : undefined;
  const body: React.ReactNode[] = [];
  const eyesClosed: React.ReactNode[] = [];
  const wings: React.ReactNode[] = [];
  const mouth: React.ReactNode[] = [];
  const mouthRow = talking ? MOUTH_ROW[name] : undefined;
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const fill = palette[ch] ?? EXTRA_COLORS[ch];
      if (!fill) return;
      const rect = (key: string, color: string) => <rect key={key} x={x} y={y} width={1.02} height={1.02} fill={color} />;
      if (flap === ch) wings.push(rect(`w${x}-${y}`, fill));
      else body.push(rect(`${x}-${y}`, fill));
      // 閉じた目のコマは、開いた目の上に重ねてときどき見せる
      if (blink?.[ch]) eyesClosed.push(rect(`c${x}-${y}`, palette[blink[ch]]));
      if (y === mouthRow && (x === 7 || x === 8)) mouth.push(rect(`m${x}-${y}`, palette.o));
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
      {mouth.length > 0 && <g className="sprite-talk">{mouth}</g>}
    </svg>
  );
});
