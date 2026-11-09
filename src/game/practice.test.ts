import { describe, expect, it } from "vitest";
import { sumAmounts } from "@/engine/journal";
import { EXAM_FORMATS } from "@/content/examFormats";
import { newGame } from "./logic";
import { seededRand } from "./random";
import { checkPracticeStep, gradePractice, nextPracticeStep, problemScore, setPracticeFill, startPractice } from "./training";
import type { FillAnswer, FillBlank, GameState } from "./types";

const correctFill = (b: FillBlank): FillAnswer => (typeof b.answer === "number" ? String(b.answer) : b.answer);

describe("第2問・第3問の問題演習", () => {
  it("どの形式でも、下書きの仕訳は貸借が一致する", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rand = seededRand(seed);
      for (const f of EXAM_FORMATS) {
        for (const s of f.make(rand).steps ?? []) expect(sumAmounts(s.answer.debit), `${f.id}: ${s.text}`).toBe(sumAmounts(s.answer.credit));
      }
    }
  });

  it("講義を受けた形式だけ始められ、下書き→答案→採点で、満点なら「できた」と記録する", () => {
    const rand = seededRand(5);
    const base = newGame("テスト", rand);
    const training: GameState = { ...base, phase: { kind: "training" } };
    expect(startPractice(training, "statements", rand)).toBe(training);

    let s = startPractice({ ...training, lessonsDone: [...base.lessonsDone, "closing"] }, "statements", rand);
    if (s.phase.kind !== "practice") throw new Error("始まらない");
    const steps = s.phase.practice.problem.steps!;
    expect(steps.length).toBeGreaterThanOrEqual(6);
    s = checkPracticeStep(s, steps[0].answer);
    if (s.phase.kind !== "practice") throw new Error("下書きが続かない");
    expect(s.phase.practice.stepResults[0]).toBe(true);
    s = nextPracticeStep(s, true);
    if (s.phase.kind !== "practice") throw new Error("答案に進まない");
    expect(s.phase.practice.step).toBe(steps.length);

    const blanks = s.phase.practice.problem.blanks;
    blanks.forEach((b, i) => (s = setPracticeFill(s, i, correctFill(b))));
    s = gradePractice(s);
    if (s.phase.kind !== "practice") throw new Error("採点できない");
    const p = s.phase.practice;
    expect(problemScore(p.problem, p.results!)).toBe(problemScore(p.problem));
    expect(s.practice.at(-1)).toEqual({ day: s.day, lesson: "closing", ok: true });
  });
});
