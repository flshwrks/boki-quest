import { EXTRA_COLORS, FINE, type Look, type Pose, type SpriteName, type SpriteSet, type SpriteStyle } from "@/content/sprites";
import { CLASSIC } from "@/content/spritesClassic";
import { memo } from "react";
import { useSpriteStyle } from "./spriteStyle";

export type { Pose, SpriteName };

const SETS: Record<SpriteStyle, SpriteSet> = { fine: FINE, classic: CLASSIC };

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
  look,
}: {
  name: SpriteName;
  palette: Record<string, string>;
  size?: number;
  className?: string;
  label?: string;
  /** まばたき・待機の息づかい・羽ばたきをつける */
  animate?: boolean;
  /** 口パク（話しはじめに数回だけ） */
  talking?: boolean;
  /** 今のコマのポーズ（省くと元の絵） */
  pose?: Pose;
  /** 人の描き分け */
  look?: Look;
}) {
  const set = SETS[useSpriteStyle()];
  const rows = set.rows(name, pose, look);
  const colors = { ...EXTRA_COLORS, ...palette };
  const w = rows[0].length;
  const h = rows.length;
  const blink = animate ? set.blink[name] : undefined;
  const flap = animate ? set.flap[name] : undefined;
  // 息づかいで別々に動かすので、頭・上半身・足もとに分けて描く
  const [neck, waist] = set.breath[name] ?? [0, 0];
  const head: React.ReactNode[] = [];
  const torso: React.ReactNode[] = [];
  const feet: React.ReactNode[] = [];
  const eyesClosed: React.ReactNode[] = [];
  const wings: React.ReactNode[] = [];
  const mouth = talking ? set.mouth[name] : undefined;
  rows.forEach((row, y) => {
    const part = y < neck ? head : y < waist ? torso : feet;
    // 同じ色が横に続くところは、1つの四角にまとめる
    for (let x = 0, n = 1; x < row.length; x += n) {
      const ch = row[x];
      for (n = 1; row[x + n] === ch; n++);
      const fill = colors[ch];
      if (!fill) continue;
      const rect = (key: string, color: string) => <rect key={key} x={x} y={y} width={n + 0.02} height={1.02} fill={color} />;
      (flap?.includes(ch) ? wings : part).push(rect(`${x}-${y}`, fill));
      // 閉じた目のコマは、開いた目の上に重ねてときどき見せる
      if (blink?.[ch]) eyesClosed.push(rect(`c${x}-${y}`, palette[blink[ch]]));
    }
  });
  // 待機の動き：息づかいのあるキャラクターは頭と上半身が沈み、ないキャラクター（妖精と、前の粗い絵）は体ごと浮く。
  // ポーズのコマの間は、息づかいを止める
  const breathes = animate && set.breath[name] !== undefined;
  const breathing = breathes && !pose;
  // 動き出しのずれは CSS 変数で渡し、各アニメーションが共通で使う
  const style = animate ? ({ "--sprite-delay": `${-offset(label ?? name) * 0.37}s` } as React.CSSProperties) : undefined;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={(size * h) / w}
      className={`pixel ${animate && !breathes ? "sprite-idle" : ""} ${className}`}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {wings.length > 0 && <g className="sprite-flap">{wings}</g>}
      {feet}
      <g className={breathing ? "sprite-breath" : undefined}>
        {torso}
        <g className={breathing ? "sprite-breath-head" : undefined}>
          {head}
          {eyesClosed.length > 0 && <g className="sprite-eyes-closed">{eyesClosed}</g>}
          {mouth && <rect className="sprite-talk" x={mouth[0]} y={mouth[1]} width={mouth[2]} height={mouth[3] + 0.02} fill={palette.o} />}
        </g>
      </g>
    </svg>
  );
});
