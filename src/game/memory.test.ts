import { describe, expect, it } from "vitest";
import { memoryOf, overdue, retention } from "./memory";
import type { LessonId } from "./types";

const recs = (lesson: LessonId, list: [number, boolean][]) => list.map(([day, ok]) => ({ day, lesson, ok }));

describe("忘却曲線にもとづく復習の間隔", () => {
  it("間をおいて思い出せるたびに間隔がのびる（1→2→4→8→15日）", () => {
    const m = memoryOf(recs("credit", [[10, true], [11, true], [13, true], [17, true], [25, true], [41, true]])).get("credit")!;
    expect(m.interval).toBe(15);
    expect(m.due).toBe(56);
  });

  it("同じ間隔のうちに何度正解しても（詰め込み）、間隔はのびない", () => {
    const m = memoryOf(recs("credit", [[10, true], [11, true], [11, true], [11, true], [12, true]])).get("credit")!;
    expect(m.interval).toBe(2);
  });

  it("忘れていたら（間違えたら）間隔は1日に戻り、のびにくくなる", () => {
    const m = memoryOf(recs("credit", [[10, true], [11, true], [13, true], [17, false]])).get("credit")!;
    expect(m.interval).toBe(1);
    expect(m.ease).toBeLessThan(2);
  });

  it("復習の日に記憶は9割まで下がり、それを過ぎると復習どき", () => {
    const m = memoryOf(recs("credit", [[10, true], [11, true]])).get("credit")!;
    expect(retention(m, m.due)).toBeCloseTo(0.9);
    expect(overdue(m, m.due - 1)).toBeLessThan(1);
    expect(overdue(m, m.due)).toBeGreaterThanOrEqual(1);
  });
});
