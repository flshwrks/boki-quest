// 試験対策：習熟度マップ・苦手ドリル・模擬試験。朝の画面から入り、終わったら朝に戻る

import { type Entry, sameEntry } from "@/engine/journal";
import { parseAmount } from "@/engine/format";
import { EXAM_BANK } from "@/content/examBank";
import { LESSONS, LESSON_BY_ID, PREP_LEVEL } from "@/content/lessons";
import {
  closingProblem,
  ledgerProblem,
  subBookProblem,
} from "@/content/mockExam";
import {
  advance,
  examMistakes,
  lessonOfTemplate,
  logPractice,
  pickQuestions,
} from "./logic";
import { type Rand, shuffle } from "./random";
import type {
  DrillSession,
  ExamQuestion,
  FillAnswer,
  FillBlank,
  GameState,
  LessonId,
  MockSession,
  Mistake,
} from "./types";

export const DRILL_SIZE = 8;
export const MOCK_MINUTES = 60;
/** 第1問：仕訳15問・各3点 */
export const MOCK_QUESTIONS = 15;
const MOCK_POINTS = 3;

export function openTraining(state: GameState): GameState {
  return state.phase.kind === "dayStart"
    ? { ...state, phase: { kind: "training" } }
    : state;
}

export function closeTraining(state: GameState): GameState {
  return state.phase.kind === "training"
    ? { ...state, phase: { kind: "dayStart" } }
    : state;
}

/** 試験対策の講義を受ける（受けた講義も読み直せる） */
export function startPrepLesson(state: GameState, lesson: LessonId): GameState {
  return state.phase.kind === "training"
    ? { ...state, phase: { kind: "lesson", lesson, page: 0 } }
    : state;
}

/** 講義を終えたあと。試験対策の講義なら試験対策の画面へ、それ以外は今日の予定を進める */
export function afterLesson(state: GameState, rand: Rand): GameState {
  const p = state.phase;
  if (p.kind === "lessonDone" && LESSON_BY_ID[p.lesson].level === PREP_LEVEL)
    return { ...state, phase: { kind: "training" } };
  return advance(state, rand);
}

// ───────── 習熟度 ─────────

/** 直近の何回分で習熟度をはかるか（昔のミスをいつまでも引きずらないように） */
const RECENT = 10;

export interface Mastery {
  tries: number;
  correct: number;
  /** 0：まだ練習していない／1：練習中／2：まずまず／3：得意 */
  stars: 0 | 1 | 2 | 3;
}

export function masteryOf(state: GameState): Map<LessonId, Mastery> {
  const recent = new Map<LessonId, boolean[]>();
  for (const r of state.practice)
    recent.set(
      r.lesson,
      [...(recent.get(r.lesson) ?? []), r.ok].slice(-RECENT),
    );
  const map = new Map<LessonId, Mastery>();
  for (const [lesson, oks] of recent) {
    const correct = oks.filter(Boolean).length;
    const rate = correct / oks.length;
    map.set(lesson, {
      tries: oks.length,
      correct,
      stars: rate >= 0.9 && oks.length >= 5 ? 3 : rate >= 0.7 ? 2 : 1,
    });
  }
  return map;
}

/** 苦手な順に並べた、習った論点（審査の問題がある論点だけ） */
export function weakLessons(state: GameState): LessonId[] {
  const m = masteryOf(state);
  const withQuestions = new Set(EXAM_BANK.map((q) => q.lesson));
  const score = (id: LessonId) => {
    const x = m.get(id);
    // まだ練習していない論点は、苦手と得意の間に置く
    return x ? x.correct / x.tries : 0.75;
  };
  return state.lessonsDone
    .filter((id) => withQuestions.has(id))
    .sort((a, b) => score(a) - score(b));
}

// ───────── 苦手ドリル ─────────

/** まだ克服していないミスを、問題の形にする（審査の問題は問題集から、店の取引は記帳した仕訳から） */
function mistakeQuestion(
  state: GameState,
  m: Mistake,
): ExamQuestion | undefined {
  if (m.templateId.startsWith("exam:"))
    return EXAM_BANK.find((q) => q.text === m.exam);
  const lesson = lessonOfTemplate(m.templateId);
  const record = state.journal.find(
    (r) => r.templateId === m.templateId && r.exam === m.exam,
  );
  return lesson && record
    ? { lesson, text: m.exam, answer: record.entry }
    : undefined;
}

export function drillQuestions(
  state: GameState,
  lesson: LessonId | null,
  rand: Rand,
): ExamQuestion[] {
  const texts = new Set<string>();
  const out: ExamQuestion[] = [];
  const add = (q: ExamQuestion | undefined) => {
    if (
      !q ||
      texts.has(q.text) ||
      (lesson && q.lesson !== lesson) ||
      out.length >= DRILL_SIZE
    )
      return;
    texts.add(q.text);
    out.push(q);
  };
  // 新しいミスから半分まで。残りは苦手な論点の問題
  const own = state.mistakes.filter((m) => !m.resolved).reverse();
  for (const m of own)
    if (out.length < DRILL_SIZE / 2 || lesson) add(mistakeQuestion(state, m));
  const targets = lesson ? [lesson] : weakLessons(state).slice(0, 4);
  for (const q of shuffle(
    EXAM_BANK.filter((x) => targets.includes(x.lesson)),
    rand,
  ))
    add(q);
  if (!lesson)
    for (const q of pickQuestions(state, DRILL_SIZE, rand, false)) add(q);
  return shuffle(out, rand);
}

export function startDrill(
  state: GameState,
  lesson: LessonId | null,
  rand: Rand,
): GameState {
  if (state.phase.kind !== "training") return state;
  const questions = drillQuestions(state, lesson, rand);
  if (questions.length === 0) return state;
  const drill: DrillSession = {
    lesson,
    questions,
    index: 0,
    results: questions.map(() => null),
    answer: null,
  };
  return { ...state, phase: { kind: "drill", drill } };
}

/** 今の問題を答え合わせする。正解したら、同じ問題のミスを克服済みにする */
export function checkDrill(state: GameState, answer: Entry): GameState {
  if (state.phase.kind !== "drill") return state;
  const d = state.phase.drill;
  if (d.results[d.index] !== null) return state;
  const q = d.questions[d.index];
  const ok = sameEntry(answer, q.answer);
  const logged = logPractice(state, q.lesson, ok);
  const mistakes = ok
    ? state.mistakes.map((m) =>
        m.exam === q.text ? { ...m, resolved: true } : m,
      )
    : state.mistakes;
  const results = d.results.map((r, i) => (i === d.index ? ok : r));
  return {
    ...logged,
    mistakes,
    phase: { kind: "drill", drill: { ...d, results, answer } },
  };
}

/** 次の問題へ。最後の問題のあとは結果の画面（index が問題数と同じ） */
export function nextDrill(state: GameState): GameState {
  if (state.phase.kind !== "drill") return state;
  const d = state.phase.drill;
  if (d.index >= d.questions.length)
    return { ...state, phase: { kind: "training" } };
  return {
    ...state,
    phase: { kind: "drill", drill: { ...d, index: d.index + 1, answer: null } },
  };
}

// ───────── 模擬試験 ─────────

/** 模擬試験は、すべての講義（試験対策の講義を含む）を受けたら受けられる */
export const lessonsLeft = (state: GameState) =>
  LESSONS.filter((l) => !state.lessonsDone.includes(l.id));

export function makeMock(state: GameState, rand: Rand): MockSession {
  const questions = pickQuestions(state, MOCK_QUESTIONS, rand, false);
  const problems = [
    ledgerProblem(rand),
    subBookProblem(rand),
    closingProblem(rand),
  ];
  return {
    questions,
    answers: questions.map(() => null),
    problems,
    fills: problems.map((p) => p.blanks.map(() => null)),
    startedAt: null,
    minutes: MOCK_MINUTES,
    graded: null,
  };
}

export function startMock(state: GameState, rand: Rand): GameState {
  if (state.phase.kind !== "training" || lessonsLeft(state).length > 0)
    return state;
  return { ...state, phase: { kind: "mock", mock: makeMock(state, rand) } };
}

function updateMock(
  state: GameState,
  f: (m: MockSession) => MockSession,
): GameState {
  if (state.phase.kind !== "mock") return state;
  return { ...state, phase: { kind: "mock", mock: f(state.phase.mock) } };
}

export const beginMock = (state: GameState, now: number) =>
  updateMock(state, (m) => (m.startedAt ? m : { ...m, startedAt: now }));

export const setMockAnswer = (state: GameState, index: number, answer: Entry) =>
  updateMock(state, (m) =>
    m.graded
      ? m
      : { ...m, answers: m.answers.map((a, i) => (i === index ? answer : a)) },
  );

export const setMockFill = (
  state: GameState,
  problem: number,
  blank: number,
  value: FillAnswer,
) =>
  updateMock(state, (m) =>
    m.graded
      ? m
      : {
          ...m,
          fills: m.fills.map((p, i) =>
            i === problem ? p.map((v, j) => (j === blank ? value : v)) : p,
          ),
        },
  );

export function fillCorrect(blank: FillBlank, value: FillAnswer): boolean {
  if (value === null) return false;
  if (blank.kind === "amount")
    return (
      typeof value === "string" &&
      value.trim() !== "" &&
      parseAmount(value) === blank.answer
    );
  if (blank.kind === "select") return value === blank.answer;
  const want = blank.answer as string[];
  return (
    Array.isArray(value) &&
    value.length === want.length &&
    want.every((w) => value.includes(w))
  );
}

/** 第1問・第2問・第3問の得点。第2問は(1)(2)の合計 */
export function mockParts(m: MockSession): number[] {
  if (!m.graded) return [0, 0, 0];
  const g = m.graded;
  const fillScore = (p: number) =>
    m.problems[p].blanks.reduce(
      (a, b, i) => a + (g.fills[p][i] ? b.points : 0),
      0,
    );
  return [
    g.questions.filter(Boolean).length * MOCK_POINTS,
    fillScore(0) + fillScore(1),
    fillScore(2),
  ];
}

export const mockScore = (m: MockSession) =>
  mockParts(m).reduce((a, b) => a + b, 0);

/** 第2問・第3問の各問を、どの論点の練習として記録するか */
const PROBLEM_LESSONS: LessonId[] = ["ledgerclose", "subbooks", "closing"];

export function gradeMock(state: GameState): GameState {
  if (state.phase.kind !== "mock" || state.phase.mock.graded) return state;
  const m = state.phase.mock;
  const questions = m.questions.map((q, i) => {
    const a = m.answers[i];
    return !!a && sameEntry(a, q.answer);
  });
  const fills = m.problems.map((p, i) =>
    p.blanks.map((b, j) => fillCorrect(b, m.fills[i][j])),
  );
  const graded: MockSession = { ...m, graded: { questions, fills } };
  // 第1問は1問ずつ、第2問・第3問は7割以上とれたら「できた」と記録する
  let next = m.questions.reduce(
    (s, q, i) => logPractice(s, q.lesson, questions[i]),
    state,
  );
  next = m.problems.reduce((s, p, i) => {
    const got = p.blanks.reduce(
      (a, b, j) => a + (fills[i][j] ? b.points : 0),
      0,
    );
    const all = p.blanks.reduce((a, b) => a + b.points, 0);
    return logPractice(s, PROBLEM_LESSONS[i], got >= all * 0.7);
  }, next);
  return {
    ...next,
    mistakes: [
      ...state.mistakes,
      ...examMistakes(state, m.questions, questions),
    ],
    mocks: [
      ...state.mocks,
      { day: state.day, score: mockScore(graded), parts: mockParts(graded) },
    ],
    phase: { kind: "mock", mock: graded },
  };
}

export const finishMock = (state: GameState): GameState =>
  state.phase.kind === "mock" && state.phase.mock.graded
    ? { ...state, phase: { kind: "training" } }
    : state;
