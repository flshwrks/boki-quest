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
}: {
  name: SpriteName;
  palette: Record<string, string>;
  size?: number;
  className?: string;
  label?: string;
  /** まばたき・待機の揺れ・羽ばたきをつける */
  animate?: boolean;
}) {
  const rows = SPRITES[name];
  const w = rows[0].length;
  const h = rows.length;
  const blink = animate ? BLINK[name] : undefined;
  const flap = animate ? FLAP[name] : undefined;
  const body: React.ReactNode[] = [];
  const eyesOpen: React.ReactNode[] = [];
  const eyesClosed: React.ReactNode[] = [];
  const wings: React.ReactNode[] = [];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const fill = palette[ch];
      if (!fill) return;
      const rect = (key: string, color: string) => <rect key={key} x={x} y={y} width={1.02} height={1.02} fill={color} />;
      if (blink?.[ch]) {
        eyesOpen.push(rect(`o${x}-${y}`, fill));
        eyesClosed.push(rect(`c${x}-${y}`, palette[blink[ch]]));
      } else if (flap === ch) wings.push(rect(`w${x}-${y}`, fill));
      else body.push(rect(`${x}-${y}`, fill));
    });
  });
  const delay = `${-offset(label ?? name) * 0.37}s`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={(size * h) / w}
      className={`pixel ${animate ? "sprite-idle" : ""} ${className}`}
      style={animate ? { animationDelay: delay } : undefined}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {wings.length > 0 && (
        <g className="sprite-flap" style={{ animationDelay: delay }}>
          {wings}
        </g>
      )}
      {body}
      {eyesOpen.length > 0 && (
        <>
          <g className="sprite-eyes-open" style={{ animationDelay: delay }}>
            {eyesOpen}
          </g>
          <g className="sprite-eyes-closed" style={{ animationDelay: delay }}>
            {eyesClosed}
          </g>
        </>
      )}
    </svg>
  );
});
