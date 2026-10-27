import { describe, expect, it } from "vitest";
import { parseAmount } from "@/engine/format";
import { EXAM_BANK } from "@/content/examBank";
import { LESSONS, PREP_LEVEL } from "@/content/lessons";
import { THEORY, inventoryProblem, slipsProblem, theoryProblem, trialAfterProblem } from "@/content/mockExam";
import { TEMPLATES } from "@/content/events";
import { choose, newGame, nextLesson, skipLesson, submitEntry } from "./logic";
import { seededRand } from "./random";
import { makeMock, mockFullParts } from "./training";
import type { FillCell, FillProblem, GameState } from "./types";

/** 表のセルを、空欄なら正解の値で読む */
const value = (p: FillProblem, c: FillCell): number =>
  typeof c === "string" ? parseAmount(c.replace("△", "")) : (p.blanks[c.blank].answer as number);
const points = (p: FillProblem) => p.blanks.reduce((a, b) => a + b.points, 0);

describe("模擬試験の追加形式", () => {
  it("商品有高帳：各行の金額＝数量×単価、売上原価＝払出金額の合計、配点は10点", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const p = inventoryProblem(seededRand(seed));
      expect(points(p)).toBe(10);
      const [book, answers] = p.sheet;
      let out = 0;
      for (const r of book.rows) {
        for (const at of [2, 5, 8]) {
          if (r[at] === "") continue;
          const qty = value(p, r[at]);
          const price = value(p, r[at + 1]);
          expect(value(p, r[at + 2]), `${p.title} ${JSON.stringify(r)}`).toBe(qty * price);
          expect(Number.isInteger(price)).toBe(true);
        }
        if (r[5] !== "") out += value(p, r[7]);
      }
      expect(value(p, answers.rows[0][1])).toBe(out);
      expect(value(p, answers.rows[1][1])).toBeGreaterThan(0);
    }
  });

  it("仕訳日計表：借方の合計と貸方の合計が一致し、配点は10点", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const p = slipsProblem(seededRand(seed));
      expect(points(p)).toBe(10);
      const rows = p.sheet[0].rows;
      const body = rows.slice(0, -1);
      const total = value(p, rows.at(-1)![0]);
      expect(body.reduce((a, r) => a + (r[0] === "" ? 0 : value(p, r[0])), 0)).toBe(total);
      expect(body.reduce((a, r) => a + (r[2] === "" ? 0 : value(p, r[2])), 0)).toBe(total);
    }
  });

  it("語群選択：答えは語群の中にあり、文には空欄が1つ", () => {
    for (const [word, text] of THEORY) expect(text.split("（　）").length, word).toBe(2);
    for (let seed = 1; seed <= 20; seed++) {
      const p = theoryProblem(seededRand(seed));
      expect(points(p)).toBe(10);
      for (const b of p.blanks) expect(b.options).toContain(b.answer);
    }
  });

  it("決算整理後残高試算表：借方と貸方の合計が一致し、配点は35点", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const p = trialAfterProblem(seededRand(seed));
      expect(points(p)).toBe(35);
      const rows = p.sheet[0].rows;
      const body = rows.slice(0, -1);
      const total = value(p, rows.at(-1)![0]);
      expect(body.reduce((a, r) => a + (r[0] === "" ? 0 : value(p, r[0])), 0)).toBe(total);
      expect(body.reduce((a, r) => a + (r[2] === "" ? 0 : value(p, r[2])), 0)).toBe(total);
    }
  });

  it("どの組み合わせでも、模擬試験は100点満点", () => {
    const s = { ...newGame("テスト商店", seededRand(1)), lessonsDone: LESSONS.map((l) => l.id) };
    for (let seed = 1; seed <= 200; seed++) {
      const m = makeMock(s, seededRand(seed));
      expect(mockFullParts(m)).toEqual([45, 20, 35]);
      for (const p of m.problems) for (const b of p.blanks) expect(b.points, p.title).toBeGreaterThan(0);
    }
  });
});

describe("カリキュラム", () => {
  it("店の講義と決算の講義には、すべて問題集の問題がある（ドリル・模試・早送りで出せる）", () => {
    const withQuestions = new Set(EXAM_BANK.map((q) => q.lesson));
    for (const l of LESSONS.filter((x) => x.level !== PREP_LEVEL && x.id !== "basics")) expect(withQuestions.has(l.id), l.title).toBe(true);
  });

  it("講義の練習取引は、すべて取引の一覧にある", () => {
    for (const l of LESSONS) for (const t of l.practice) expect(TEMPLATES[t], `${l.title} の ${t}`).toBeDefined();
  });

  it("後から追加された前の Lv の講義は、補講として次に受ける", () => {
    const s = newGame("テスト商店", seededRand(1));
    const done = LESSONS.filter((l) => l.level >= 1 && l.level <= 5 && l.id !== "taxes").map((l) => l.id);
    expect(nextLesson({ ...s, level: 5, lessonsDone: done })?.id).toBe("taxes");
  });

  it("講義の早送り：確認問題に正解すると、講義を受けたことになる", () => {
    const s: GameState = { ...newGame("テスト商店", seededRand(1)), phase: { kind: "lesson", lesson: "taxes", page: 0 } };
    const next = skipLesson(s);
    expect(next.lessonsDone).toContain("taxes");
    expect(next.phase.kind).toBe("lessonDone");
  });
});

describe("ギルドの帳簿相談", () => {
  it("正解しても店の帳簿（仕訳帳）には記入せず、正誤だけ記録する", () => {
    const rand = seededRand(3);
    const base = newGame("テスト商店", rand);
    const built = TEMPLATES["guild-fixedsale"].build({ state: base, rand, balance: () => 0, has: () => true, guided: false })!;
    let s: GameState = {
      ...base,
      lessonsDone: [...base.lessonsDone, "fixedsale"],
      phase: { kind: "event", event: { ...built, templateId: "guild-fixedsale" } },
    };
    s = choose(s, 0, rand);
    if (s.phase.kind !== "journal") throw new Error("仕訳に進まない");
    s = submitEntry(s, s.phase.session.tx.answer);
    expect(s.phase.kind).toBe("result");
    expect(s.journal.length).toBe(base.journal.length);
    expect(s.practice.at(-1)).toEqual({ day: s.day, lesson: "fixedsale", ok: true });
  });
});
