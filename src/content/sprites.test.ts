import { describe, expect, it } from "vitest";
import { EXTRA_COLORS, FINE, type Pose, type SpriteSet } from "./sprites";
import { CLASSIC } from "./spritesClassic";
import { CHARACTERS } from "./world";

const POSES: (Pose | undefined)[] = [
  undefined,
  ...([1, 2, 3, 4, 5, 6, 7, 8] as const).map((n): Pose => `walk${n}`),
  "crouch1",
  "crouch2",
  "jump1",
  "jump2",
  "jump3",
  "talk1",
  "talk2",
  "think1",
  "think2",
  "think3",
  "sleep1",
  "sleep2",
  "sleep3",
  "sleep4",
  "oops1",
  "oops2",
  "oops3",
];

const SETS: [string, SpriteSet, number][] = [
  ["細かい絵", FINE, 32],
  ["前の粗い絵", CLASSIC, 16],
];

describe.each(SETS)("%s", (_, set, size) => {
  it.each(Object.entries(CHARACTERS))("%s：どのコマも大きさがそろい、パレットにない色を使わない", (_id, c) => {
    const colors = { ...EXTRA_COLORS, ...c.palette };
    for (const pose of POSES) {
      const rows = set.rows(c.sprite, pose);
      expect(rows.map((r) => r.length)).toEqual(Array(size).fill(size));
      const unknown = [...new Set(rows.join(""))].filter((ch) => ch !== "." && !colors[ch]);
      expect(unknown, `${pose ?? "元の絵"}`).toEqual([]);
    }
  });

  it("まばたきで閉じた目の色が、パレットにある", () => {
    for (const c of Object.values(CHARACTERS)) {
      for (const to of Object.values(set.blink[c.sprite] ?? {})) expect(c.palette[to]).toBeTruthy();
    }
  });
});
