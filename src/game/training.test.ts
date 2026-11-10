import { describe, expect, it } from "vitest";
import { parseAmount } from "@/engine/format";
import { EXAM_BANK, unusedTraps } from "@/content/examBank";
import { CONFUSABLE, accountChoices } from "@/content/examChoices";
import { isAccountName } from "@/engine/accounts";
import { LESSONS } from "@/content/lessons";
import { SUB_BOOKS, closingProblem, ledgerProblem, subBookProblem } from "@/content/mockExam";
import { newGame, practiceFromHistory, turnLessonPage } from "./logic";
import { seededRand } from "./random";
import {
  DRILL_SIZE,
  MOCK_QUESTIONS,
  mockQuestions,
  afterLesson,
  startPrepLesson,
  checkDrill,
  fillCorrect,
  finishMock,
  gradeMock,
  masteryOf,
  mockScore,
  nextDrill,
  setMockAnswer,
  setMockFill,
  startDrill,
  startMock,
} from "./training";
import type { FillCell, FillProblem, FillTable, GameState } from "./types";

/** 空欄に正解を入れた表の、金額の列を数値で読む */
function amountsOf(p: FillProblem, table: FillTable, col: number): number[] {
  return table.rows.map((r) => {
    const c: FillCell = r[col];
    if (typeof c === "string") return parseAmount(c.replace("△", ""));
    const a = p.blanks[c.blank].answer;
    return typeof a === "number" ? a : 0;
  });
}

const points = (p: FillProblem) => p.blanks.reduce((a, b) => a + b.points, 0);

/** 列の合計（最後の行）が、上の行の合計と一致するか */
function checkColumn(p: FillProblem, table: FillTable, col: number, signed?: (row: FillCell[]) => number) {
  const xs = amountsOf(p, table, col);
  const total = xs.at(-1)!;
  const body = table.rows.slice(0, -1).reduce((a, r, i) => a + xs[i] * (signed ? signed(r) : 1), 0);
  expect(body, `${p.title} ${table.title} の${col}列目`).toBe(total);
}

describe("模擬試験の問題", () => {
  it("勘定記入：左右の合計が一致し、配点は10点", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const p = ledgerProblem(seededRand(seed));
      expect(points(p)).toBe(10);
      for (const t of p.sheet) {
        checkColumn(p, t, 2);
        checkColumn(p, t, 5);
      }
      for (const b of p.blanks) if (b.kind === "amount") expect(Number.isInteger(b.answer) && (b.answer as number) > 0).toBe(true);
    }
  });

  it("補助簿：答えは選択肢の中から選べ、配点は10点", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const p = subBookProblem(seededRand(seed));
      expect(points(p)).toBe(10);
      for (const b of p.blanks) for (const a of b.answer as string[]) expect(SUB_BOOKS).toContain(a);
    }
  });

  it("財務諸表：試算表と貸借対照表の左右が一致し、税金は税引前利益の30％、配点は35点", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const p = closingProblem(seededRand(seed));
      expect(points(p)).toBe(35);
      const [tb] = p.given!;
      checkColumn(p, tb, 0);
      checkColumn(p, tb, 2);
      const [pl, bs] = p.sheet;
      checkColumn(p, pl, 1);
      checkColumn(p, pl, 3);
      // 資産の側は、控除科目（△）を引く
      checkColumn(p, bs, 1, (r) => (typeof r[1] !== "string" ? (r[1].prefix ? -1 : 1) : r[1].startsWith("△") ? -1 : 1));
      checkColumn(p, bs, 3);
      // 税金と当期純利益
      const plCells = pl.rows.slice(0, -1);
      const find = (name: string) => {
        const i = plCells.findIndex((r) => r[0] === name);
        return i < 0 ? 0 : amountsOf(p, pl, 1)[i];
      };
      const tax = find("法人税、住民税及び事業税");
      const net = find("当期純利益");
      expect(tax).toBe(((tax + net) * 30) / 100);
      expect(net).toBeGreaterThan(0);
      for (const b of p.blanks) expect(Number.isInteger(b.answer) && (b.answer as number) > 0, JSON.stringify(b)).toBe(true);
      expect(p.blanks.length).toBeGreaterThanOrEqual(10);
    }
  });

  it("空欄の採点：金額はカンマがあってもよく、補助簿は過不足なく選んだときだけ正解", () => {
    expect(fillCorrect({ kind: "amount", answer: 12000, points: 2 }, "12,000")).toBe(true);
    expect(fillCorrect({ kind: "amount", answer: 12000, points: 2 }, "")).toBe(false);
    expect(fillCorrect({ kind: "select", answer: "損益", points: 2, options: [] }, "損益")).toBe(true);
    const multi = {
      kind: "multi" as const,
      answer: ["仕入帳", "商品有高帳"],
      points: 2,
    };
    expect(fillCorrect(multi, ["商品有高帳", "仕入帳"])).toBe(true);
    expect(fillCorrect(multi, ["仕入帳"])).toBe(false);
    expect(fillCorrect(multi, ["仕入帳", "商品有高帳", "売上帳"])).toBe(false);
  });
});

/** すべての講義を受けた状態で、試験対策の画面を開いておく */
function trainingState(): GameState {
  const s = newGame("テスト商店", seededRand(1));
  return {
    ...s,
    level: 5,
    lessonsDone: LESSONS.map((l) => l.id),
    phase: { kind: "training" },
  };
}

describe("苦手ドリル", () => {
  it("間違えた問題が出て、正解すると克服済みになり、終わったら試験対策に戻る", () => {
    const missed = EXAM_BANK.find((q) => q.lesson === "notes")!;
    let s: GameState = {
      ...trainingState(),
      mistakes: [{ day: 1, templateId: "exam:notes", exam: missed.text }],
    };
    s = startDrill(s, null, seededRand(2));
    if (s.phase.kind !== "drill") throw new Error("ドリルが始まらない");
    expect(s.phase.drill.questions.length).toBe(DRILL_SIZE);
    expect(s.phase.drill.questions.map((q) => q.text)).toContain(missed.text);
    for (let i = 0; i < DRILL_SIZE; i++) {
      if (s.phase.kind !== "drill") throw new Error("ドリルが途中で終わった");
      s = checkDrill(s, s.phase.drill.questions[i].answer);
      s = nextDrill(s);
    }
    expect(s.mistakes[0].resolved).toBe(true);
    expect(s.practice.length).toBe(DRILL_SIZE);
    s = nextDrill(s);
    expect(s.phase.kind).toBe("training");
  });

  it("論点を選ぶと、その論点の問題だけが出る", () => {
    const s = startDrill(trainingState(), "credit", seededRand(3));
    if (s.phase.kind !== "drill") throw new Error("ドリルが始まらない");
    expect(s.phase.drill.questions.every((q) => q.lesson === "credit")).toBe(true);
  });
});

describe("模擬試験", () => {
  it("すべて正解すれば100点（第1問45点・第2問20点・第3問35点）で、成績が残る", () => {
    let s = startMock(trainingState(), seededRand(4));
    if (s.phase.kind !== "mock") throw new Error("模試が始まらない");
    const m = s.phase.mock;
    expect(m.questions.length).toBe(15);
    m.questions.forEach((q, i) => (s = setMockAnswer(s, i, q.answer)));
    m.problems.forEach((p, i) =>
      p.blanks.forEach((b, j) => {
        const a = b.answer;
        s = setMockFill(s, i, j, typeof a === "number" ? a.toLocaleString("ja-JP") : a);
      }),
    );
    s = gradeMock(s);
    if (s.phase.kind !== "mock") throw new Error("採点で模試が終わった");
    expect(mockScore(s.phase.mock)).toBe(100);
    expect(s.mocks).toEqual([{ day: s.day, score: 100, parts: [45, 20, 35] }]);
    expect(finishMock(s).phase.kind).toBe("training");
  });

  it("講義が残っていると受けられない", () => {
    const s = { ...trainingState(), lessonsDone: [] };
    expect(startMock(s, seededRand(5)).phase.kind).toBe("training");
  });
});

describe("試験対策の講義", () => {
  it("試験対策の画面から受けた講義は、終わると試験対策の画面に戻る", () => {
    let s = startPrepLesson({ ...trainingState(), lessonsDone: [] }, "subbooks");
    while (s.phase.kind === "lesson") s = turnLessonPage(s, 1);
    expect(s.lessonsDone).toContain("subbooks");
    expect(afterLesson(s, seededRand(6)).phase.kind).toBe("training");
  });
});

describe("習熟度", () => {
  it("直近10回の正答率で星がつく", () => {
    const s = trainingState();
    const rec = (ok: boolean) => ({ day: 1, lesson: "credit" as const, ok });
    const m = masteryOf({
      ...s,
      practice: [...Array(10).fill(rec(false)), ...Array(10).fill(rec(true))],
    });
    expect(m.get("credit")).toEqual({ tries: 10, correct: 10, stars: 3 });
    expect(masteryOf({ ...s, practice: [rec(true), rec(false)] }).get("credit")?.stars).toBe(1);
  });

  it("古いセーブでは、記帳と苦手の記録から正誤を作り直す", () => {
    const s = trainingState();
    const old: GameState = {
      ...s,
      journal: [
        {
          day: 2,
          templateId: "customer",
          exam: "",
          entry: { debit: [], credit: [] },
        },
        {
          day: 3,
          templateId: "customer",
          exam: "",
          entry: { debit: [], credit: [] },
        },
      ],
      mistakes: [
        { day: 3, templateId: "customer", exam: "" },
        { day: 4, templateId: "exam:notes", exam: "" },
      ],
    };
    expect(practiceFromHistory(old)).toEqual([
      { day: 2, lesson: "trade", ok: true },
      { day: 3, lesson: "trade", ok: false },
      { day: 4, lesson: "notes", ok: false },
    ]);
  });
});

describe("第1問の問題集（本番レベル）", () => {
  it("つまずきやすい点の書き出しは、すべてどれかの問題に当たる", () => {
    expect(unusedTraps()).toEqual([]);
  });

  it("本番レベルの問題（基本の問題以外）には、すべてつまずきやすい点がある", () => {
    for (const q of EXAM_BANK.filter((x) => !x.basic)) expect(q.trap, q.text).toBeTruthy();
  });

  it("模擬試験の第1問は、基本の問題を出さず、論点がなるべく重ならない", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const qs = mockQuestions(trainingState(), seededRand(seed));
      expect(qs).toHaveLength(MOCK_QUESTIONS);
      expect(qs.some((q) => q.basic)).toBe(false);
      expect(new Set(qs.map((q) => q.lesson)).size).toBe(MOCK_QUESTIONS);
    }
  });

  it("勘定科目の選択肢は、正解の科目をすべて含み、まちがえやすい科目を混ぜて6つ以上", () => {
    for (const g of CONFUSABLE) for (const a of g) expect(isAccountName(a), a).toBe(true);
    for (const q of EXAM_BANK) {
      const choices = accountChoices(q);
      for (const l of [...q.answer.debit, ...q.answer.credit]) expect(choices, q.text).toContain(l.account);
      expect(new Set(choices).size, q.text).toBe(choices.length);
      expect(choices.length, q.text).toBeGreaterThanOrEqual(6);
      expect(accountChoices(q), "開き直しても同じ").toEqual(choices);
    }
  });
});

