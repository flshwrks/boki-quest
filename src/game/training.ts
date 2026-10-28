// 試験対策：習熟度マップ・苦手ドリル・模擬試験。朝の画面から入り、終わったら朝に戻る

import { type Entry, sameEntry } from "@/engine/journal";
import { parseAmount } from "@/engine/format";
import { BANK_BY_LESSON, EXAM_BANK } from "@/content/examBank";
import { LESSONS } from "@/content/lessons";
import { pick } from "@/content/eventKit";
import {
  closingProblem,
  inventoryProblem,
  ledgerProblem,
  slipsProblem,
  subBookProblem,
  theoryProblem,
  trialAfterProblem,
  receivableLedgerProblem,
  totalsTrialProblem,
  worksheetProblem,
} from "@/content/mockExam";
import { type Mastery, advance, gradeQuestions, lessonOfTemplate, logPractice, logPractices, pickQuestions , masteryOf } from "./logic";

export { type Mastery, masteryOf };
import { type Rand, shuffle } from "./random";
import type { DrillSession, ExamQuestion, FillAnswer, FillBlank, FillProblem, GameState, LessonId, MockSession, Mistake } from "./types";

export const DRILL_SIZE = 8;
export const MOCK_MINUTES = 60;
/** 第1問：仕訳15問・各3点 */
export const MOCK_QUESTIONS = 15;
const MOCK_POINTS = 3;

/** 審査・模試の問題がある論点（ドリルで練習できる論点） */
export const LESSONS_WITH_QUESTIONS = new Set(BANK_BY_LESSON.keys());

export function openTraining(state: GameState): GameState {
  return state.phase.kind === "dayStart" ? { ...state, phase: { kind: "training" } } : state;
}

export function closeTraining(state: GameState): GameState {
  return state.phase.kind === "training" ? { ...state, phase: { kind: "dayStart" } } : state;
}

/** 試験対策の講義を受ける（受けた講義も読み直せる）。終わったら試験対策の画面に戻る */
export function startPrepLesson(state: GameState, lesson: LessonId): GameState {
  return state.phase.kind === "training" ? { ...state, phase: { kind: "lesson", lesson, page: 0, returnTo: "training" } } : state;
}

/** 講義を終えたあと。試験対策から開いた講義ならそこへ戻り、それ以外は今日の予定を進める */
export function afterLesson(state: GameState, rand: Rand): GameState {
  if (state.phase.kind === "lessonDone" && state.phase.returnTo) return { ...state, phase: { kind: state.phase.returnTo } };
  return advance(state, rand);
}

// ───────── 習熟度 ─────────

/** 苦手な順に並べた、習った論点（ドリルで練習できる論点だけ） */
export function weakLessons(state: GameState, mastery = masteryOf(state)): LessonId[] {
  const score = (id: LessonId) => {
    const x = mastery.get(id);
    // まだ練習していない論点は、苦手と得意の間に置く
    return x ? x.correct / x.tries : 0.75;
  };
  return state.lessonsDone.filter((id) => LESSONS_WITH_QUESTIONS.has(id)).sort((a, b) => score(a) - score(b));
}

// ───────── 苦手ドリル ─────────

/** 問題集の問題を、問題文から引く */
const BANK_BY_TEXT = new Map(EXAM_BANK.map((q) => [q.text, q]));

/** まだ克服していないミスを、問題の形にする（審査の問題は問題集から、店の取引は記帳した仕訳から） */
function mistakeQuestion(state: GameState, m: Mistake): ExamQuestion | undefined {
  // 審査やギルドの帳簿相談で出た問題は、問題集にそのまま載っている
  const banked = BANK_BY_TEXT.get(m.exam);
  if (banked) return banked;
  const lesson = lessonOfTemplate(m.templateId);
  const record = state.journal.find((r) => r.templateId === m.templateId && r.exam === m.exam);
  return lesson && record ? { lesson, text: m.exam, answer: record.entry } : undefined;
}

export function drillQuestions(state: GameState, lesson: LessonId | null, rand: Rand): ExamQuestion[] {
  const texts = new Set<string>();
  const out: ExamQuestion[] = [];
  const add = (q: ExamQuestion | undefined) => {
    if (!q || texts.has(q.text) || (lesson && q.lesson !== lesson) || out.length >= DRILL_SIZE) return;
    texts.add(q.text);
    out.push(q);
  };
  // 新しいミスから。おまかせのときは半分まで、残りは苦手な論点の問題
  const ownLimit = lesson ? DRILL_SIZE : DRILL_SIZE / 2;
  for (const m of [...state.mistakes].reverse()) {
    if (out.length >= ownLimit) break;
    if (!m.resolved) add(mistakeQuestion(state, m));
  }
  const targets = lesson ? [lesson] : weakLessons(state).slice(0, 4);
  for (const q of shuffle(
    EXAM_BANK.filter((x) => targets.includes(x.lesson)),
    rand,
  ))
    add(q);
  if (!lesson) for (const q of pickQuestions(state, DRILL_SIZE, rand, false)) add(q);
  return shuffle(out, rand);
}

export function startDrill(state: GameState, lesson: LessonId | null, rand: Rand): GameState {
  if (state.phase.kind !== "training") return state;
  const questions = drillQuestions(state, lesson, rand);
  if (questions.length === 0) return state;
  const drill: DrillSession = { lesson, questions, index: 0, results: questions.map(() => null), answer: null };
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
  const mistakes = ok ? state.mistakes.map((m) => (m.exam === q.text ? { ...m, resolved: true } : m)) : state.mistakes;
  const results = d.results.map((r, i) => (i === d.index ? ok : r));
  return { ...logged, mistakes, phase: { kind: "drill", drill: { ...d, results, answer } } };
}

/** 次の問題へ。最後の問題のあとは結果の画面（index が問題数と同じ） */
export function nextDrill(state: GameState): GameState {
  if (state.phase.kind !== "drill") return state;
  const d = state.phase.drill;
  if (d.index >= d.questions.length) return { ...state, phase: { kind: "training" } };
  return { ...state, phase: { kind: "drill", drill: { ...d, index: d.index + 1, answer: null } } };
}

// ───────── 模擬試験 ─────────

/** 模擬試験は、すべての講義（試験対策の講義を含む）を受けたら受けられる */
export const lessonsLeft = (state: GameState) => LESSONS.filter((l) => !state.lessonsDone.includes(l.id));

export function makeMock(state: GameState, rand: Rand): MockSession {
  const questions = pickQuestions(state, MOCK_QUESTIONS, rand, false);
  // 第2問(1)・(2)、第3問は、それぞれ出題形式を選ぶ
  const problems = [
    pick(rand, [ledgerProblem, inventoryProblem, slipsProblem, receivableLedgerProblem]),
    pick(rand, [subBookProblem, theoryProblem]),
    pick(rand, [closingProblem, trialAfterProblem, worksheetProblem, totalsTrialProblem]),
  ].map((make) => make(rand));
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
  if (state.phase.kind !== "training" || lessonsLeft(state).length > 0) return state;
  return { ...state, phase: { kind: "mock", mock: makeMock(state, rand) } };
}

function updateMock(state: GameState, f: (m: MockSession) => MockSession): GameState {
  if (state.phase.kind !== "mock" || state.phase.mock.graded) return state;
  return { ...state, phase: { kind: "mock", mock: f(state.phase.mock) } };
}

const setAt = <T>(xs: T[], index: number, value: T) => xs.map((x, i) => (i === index ? value : x));

export const beginMock = (state: GameState, now: number) => updateMock(state, (m) => (m.startedAt ? m : { ...m, startedAt: now }));

export const setMockAnswer = (state: GameState, index: number, answer: Entry) =>
  updateMock(state, (m) => ({ ...m, answers: setAt(m.answers, index, answer) }));

export const setMockFill = (state: GameState, problem: number, blank: number, value: FillAnswer) =>
  updateMock(state, (m) => ({ ...m, fills: setAt(m.fills, problem, setAt(m.fills[problem], blank, value)) }));

export function fillCorrect(blank: FillBlank, value: FillAnswer): boolean {
  if (value === null) return false;
  if (blank.kind === "amount") return typeof value === "string" && value.trim() !== "" && parseAmount(value) === blank.answer;
  if (blank.kind === "select") return value === blank.answer;
  const want = blank.answer as string[];
  return Array.isArray(value) && value.length === want.length && want.every((w) => value.includes(w));
}

/** 穴埋め問題の得点。results を省くと満点 */
export const problemScore = (p: FillProblem, results?: boolean[]) => p.blanks.reduce((a, b, i) => a + (!results || results[i] ? b.points : 0), 0);

/** 第1問・第2問・第3問の得点。第2問は(1)(2)の合計。graded を省くと各大問の満点 */
function partsOf(m: MockSession, graded?: MockSession["graded"]): number[] {
  const fill = (i: number) => problemScore(m.problems[i], graded?.fills[i]);
  const first = graded ? graded.questions.filter(Boolean).length : m.questions.length;
  return [first * MOCK_POINTS, fill(0) + fill(1), fill(2)];
}

export const mockParts = (m: MockSession) => (m.graded ? partsOf(m, m.graded) : [0, 0, 0]);
export const mockFullParts = (m: MockSession) => partsOf(m);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const mockScore = (m: MockSession) => sum(mockParts(m));

export function gradeMock(state: GameState): GameState {
  if (state.phase.kind !== "mock" || state.phase.mock.graded) return state;
  const m = state.phase.mock;
  const { graded: questions, state: next } = gradeQuestions(state, m.questions, m.answers);
  const fills = m.problems.map((p, i) => p.blanks.map((b, j) => fillCorrect(b, m.fills[i][j])));
  const graded: MockSession = { ...m, graded: { questions, fills } };
  const parts = mockParts(graded);
  // 第2問・第3問は、7割以上とれたら「できた」と記録する
  const logged = logPractices(
    next,
    m.problems.map((p, i) => ({ lesson: p.lesson, ok: problemScore(p, fills[i]) >= problemScore(p) * 0.7 })),
  );
  return {
    ...logged,
    mocks: [...state.mocks, { day: state.day, score: sum(parts), parts }],
    phase: { kind: "mock", mock: graded },
  };
}

export const finishMock = (state: GameState): GameState =>
  state.phase.kind === "mock" && state.phase.mock.graded ? { ...state, phase: { kind: "training" } } : state;
