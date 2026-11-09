import { describe, expect, it } from "vitest";
import { sumAmounts } from "@/engine/journal";
import { EXAM_FORMATS } from "@/content/examFormats";
import { newGame } from "./logic";
import { seededRand } from "./random";
import {
  answerValue,
  blankLabel,
  blankOrder,
  checkGuide,
  formatProgress,
  checkPracticeStep,
  gradePractice,
  guideBlank,
  nextPracticeStep,
  problemScore,
  quitTraining,
  setGuide,
  setPracticeFill,
  startPractice,
} from "./training";
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

  it("どの形式でも、すべての空欄に求め方の説明がある", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rand = seededRand(seed);
      for (const f of EXAM_FORMATS) for (const b of f.make(rand).blanks) expect(b.why, f.id).toBeTruthy();
    }
  });

  it("形式の論点（練習を開く条件）は、問題が記録する論点と同じ", () => {
    const rand = seededRand(2);
    for (const f of EXAM_FORMATS) for (let i = 0; i < 5; i++) expect(f.make(rand).lesson, f.id).toBe(f.lesson);
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
    // ガイドなし（本番と同じ）で自分で埋める
    s = setGuide(s, false);
    blanks.forEach((b, i) => (s = setPracticeFill(s, i, correctFill(b))));
    s = gradePractice(s);
    if (s.phase.kind !== "practice") throw new Error("採点できない");
    const p = s.phase.practice;
    expect(problemScore(p.problem, p.results!)).toBe(problemScore(p.problem));
    expect(s.practice.at(-1)).toEqual({ day: s.day, lesson: "closing", ok: true });
  });

  it("ガイドつき：表の上から1欄ずつ答え合わせし、間違えた欄は正解を書き込んで次へ。採点は答え合わせの正誤", () => {
    const rand = seededRand(9);
    const base = newGame("テスト", rand);
    let s = startPractice({ ...base, lessonsDone: [...base.lessonsDone, "closing"], phase: { kind: "training" } }, "statements", rand);
    s = nextPracticeStep(s, true);
    if (s.phase.kind !== "practice") throw new Error("始まらない");
    const p0 = s.phase.practice;
    const order = blankOrder(p0.problem);
    expect([...order].sort((a, b) => a - b)).toEqual(p0.problem.blanks.map((_, i) => i));
    expect(guideBlank(p0)).toBe(order[0]);
    expect(blankLabel(p0.problem, order[0])).toContain("損益計算書");

    // 1欄目はまちがえ、残りは正解
    s = checkGuide(s, "1");
    if (s.phase.kind !== "practice") throw new Error("続かない");
    expect(s.phase.practice.checks![order[0]]).toBe(false);
    expect(s.phase.practice.fills[order[0]]).toEqual(answerValue(p0.problem.blanks[order[0]]));
    for (const i of order.slice(1)) {
      s = checkGuide(s, answerValue(p0.problem.blanks[i]));
    }
    if (s.phase.kind !== "practice") throw new Error("続かない");
    expect(guideBlank(s.phase.practice)).toBeUndefined();
    s = gradePractice(s);
    if (s.phase.kind !== "practice") throw new Error("採点できない");
    const p = s.phase.practice;
    expect(problemScore(p.problem, p.results!)).toBe(problemScore(p.problem) - p.problem.blanks[order[0]].points);
  });

  it("ガイドを外すと、答案を書き直して本番と同じく自分で埋める", () => {
    const rand = seededRand(4);
    const base = newGame("テスト", rand);
    let s = startPractice({ ...base, lessonsDone: [...base.lessonsDone, "subbooks"], phase: { kind: "training" } }, "subbook", rand);
    s = setGuide(s, false);
    if (s.phase.kind !== "practice") throw new Error("始まらない");
    expect(s.phase.practice.checks).toBeUndefined();
    expect(guideBlank(s.phase.practice)).toBeUndefined();
  });

  it("採点すると形式ごとの成績に残り、ガイドなしの最高は別に数える。やめると途中を捨てて試験対策に戻る", () => {
    const rand = seededRand(11);
    const base = newGame("テスト", rand);
    const ready: GameState = { ...base, lessonsDone: [...base.lessonsDone, "subbooks"], phase: { kind: "training" } };
    let s = startPractice(ready, "subbook", rand);
    expect(quitTraining(s).phase).toEqual({ kind: "training" });

    s = setGuide(s, false);
    if (s.phase.kind !== "practice") throw new Error("始まらない");
    s.phase.practice.problem.blanks.forEach((b, i) => (s = setPracticeFill(s, i, answerValue(b))));
    s = gradePractice(s);
    const g = formatProgress(s).get("subbook")!;
    expect(g).toEqual({ tries: 1, best: 1, bestSolo: 1, last: 1 });
  });
});
