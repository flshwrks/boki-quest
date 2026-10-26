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

// 絵の中身は名前とパレットで決まるので、同じ props なら描き直さない
export const Sprite = memo(function Sprite({
  name,
  palette,
  size = 64,
  className = "",
  label,
}: {
  name: SpriteName;
  palette: Record<string, string>;
  size?: number;
  className?: string;
  label?: string;
}) {
  const rows = SPRITES[name];
  const w = rows[0].length;
  const h = rows.length;
  const rects: React.ReactNode[] = [];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const fill = palette[ch];
      if (fill) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={fill} />);
    });
  });
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={(size * h) / w}
      className={`pixel ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {rects}
    </svg>
  );
});
