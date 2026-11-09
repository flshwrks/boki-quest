// 試験対策：習熟度マップ・苦手ドリル・模擬試験。朝の画面から入り、終わったら朝に戻る

import { memoryOf, retention } from "./memory";
import { type Entry, sameEntry } from "@/engine/journal";
import { parseAmount } from "@/engine/format";
import { BANK_BY_LESSON, EXAM_BANK } from "@/content/examBank";
import { LESSONS } from "@/content/lessons";
import { pick } from "@/content/eventKit";
import { EXAM_FORMATS, EXAM_PARTS, FORMAT_BY_ID } from "@/content/examFormats";
import { type Mastery, advance, gradeQuestions, lessonOfTemplate, logPractice, logPractices, pickQuestions , masteryOf } from "./logic";

export { type Mastery, masteryOf };
import { type Rand, shuffle } from "./random";
import type {
  DrillSession,
  ExamQuestion,
  FillAnswer,
  FillBlank,
  FillCell,
  FillProblem,
  GameState,
  LessonId,
  MockSession,
  Mistake,
  ProblemPractice,
} from "./types";

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
export function weakLessons(state: GameState, mastery = masteryOf(state), memory = memoryOf(state.practice)): LessonId[] {
  const score = (id: LessonId) => {
    const x = mastery.get(id);
    // まだ練習していない論点は、苦手と得意の間に置く。忘れかけている（記憶の残りが少ない）論点ほど先に
    return (x ? x.correct / x.tries : 0.75) * (0.5 + 0.5 * retention(memory.get(id), state.day));
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
  // 第2問(1)・(2)、第3問は、それぞれ出題形式を選ぶ。模擬試験では下書きの仕訳を使わないので、セーブに残さない
  const problems = EXAM_PARTS.map((part) => {
    const { steps: _, ...problem } = pick(rand, EXAM_FORMATS.filter((f) => f.part === part)).make(rand);
    return problem;
  });
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

/** 第2問・第3問は、7割とれたら「できた」と記録する */
export const problemPassed = (p: FillProblem, results: boolean[]) => problemScore(p, results) >= problemScore(p) * 0.7;

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
    m.problems.map((p, i) => ({ lesson: p.lesson, ok: problemPassed(p, fills[i]) })),
  );
  return {
    ...logged,
    mocks: [...state.mocks, { day: state.day, score: sum(parts), parts }],
    phase: { kind: "mock", mock: graded },
  };
}

export const finishMock = (state: GameState): GameState =>
  state.phase.kind === "mock" && state.phase.mock.graded ? { ...state, phase: { kind: "training" } } : state;

// ───────── 第2問・第3問の問題演習 ─────────


/** 形式を選んで始める（数字は毎回変わる）。下書きの仕訳がある形式は、そこから */
export function startPractice(state: GameState, format: string, rand: Rand): GameState {
  const f = FORMAT_BY_ID.get(format);
  if (!f || !(state.phase.kind === "training" || state.phase.kind === "practice") || !state.lessonsDone.includes(f.lesson)) return state;
  const problem = f.make(rand);
  const practice: ProblemPractice = {
    format,
    problem,
    step: 0,
    stepResults: (problem.steps ?? []).map(() => null),
    stepAnswer: null,
    fills: problem.blanks.map(() => null),
    // はじめはガイドつき（1欄ずつ、求め方を見ながら）
    checks: problem.blanks.map(() => null),
    results: null,
  };
  return { ...state, phase: { kind: "practice", practice } };
}

const isNumberCell = (c: FillCell) => typeof c === "string" && /^[△\d,]+$/.test(c);

/** 答案用紙の空欄を、表の上から下・左から右の順に並べる（ガイドで埋める順） */
export function blankOrder(problem: FillProblem): number[] {
  return problem.sheet.flatMap((t) => t.rows.flatMap((row) => row.flatMap((c) => (typeof c === "string" ? [] : [c.blank]))));
}

/** 空欄の場所の名前（「損益計算書の『減価償却費』」「商品有高帳 6/15 売上の払出金額」など） */
export function blankLabel(problem: FillProblem, blank: number): string {
  for (const t of problem.sheet) {
    for (const row of t.rows) {
      const col = row.findIndex((c) => typeof c !== "string" && c.blank === blank);
      if (col < 0) continue;
      const named = (c: FillCell) => typeof c === "string" && c !== "" && !isNumberCell(c);
      // 行の名前は、左にある言葉（なければ右）。長すぎる文（取引の文など）なら行の番号
      const left = row.slice(0, col).reverse().find(named) ?? row.slice(col + 1).find(named);
      let name = typeof left === "string" ? left : "";
      if (name.length > 16 && typeof row[0] === "string" && row[0]) name = row[0];
      const date = typeof row[0] === "string" && row[0].includes("/") && row[0] !== name ? `${row[0]} ` : "";
      const column = t.head?.[col] && t.head[col] !== "金額" ? `の${t.head[col]}` : "";
      return `${t.title ?? "答案"}：${date}${name ? `「${name}」` : ""}${column}`;
    }
  }
  return "";
}

/** ガイドで次に埋める空欄（全部埋めたら undefined） */
export const guideBlank = (p: ProblemPractice) => (p.checks ? blankOrder(p.problem).find((i) => p.checks![i] === null) : undefined);

/** 空欄の正解を、入力欄に入る形にする */
export const answerValue = (b: FillBlank): FillAnswer => (typeof b.answer === "number" ? String(b.answer) : b.answer);

/** ガイドの1欄を答え合わせする。間違えたら正解を書き込んで先へ進める（表が最後まで埋まるように） */
export const checkGuide = (state: GameState, value: FillAnswer) =>
  updatePractice(state, (p) => {
    const i = guideBlank(p);
    if (i === undefined || p.results) return p;
    const blank = p.problem.blanks[i];
    const ok = fillCorrect(blank, value);
    return { ...p, fills: setAt(p.fills, i, ok ? value : answerValue(blank)), checks: setAt(p.checks!, i, ok) };
  });

/** ガイドつき・なしを切り替える。切り替えたら答案は書き直し */
export const setGuide = (state: GameState, on: boolean) =>
  updatePractice(state, (p) =>
    p.results ? p : { ...p, fills: p.problem.blanks.map(() => null), checks: on ? p.problem.blanks.map(() => null) : undefined },
  );

function updatePractice(state: GameState, f: (p: ProblemPractice) => ProblemPractice): GameState {
  return state.phase.kind === "practice" ? { ...state, phase: { kind: "practice", practice: f(state.phase.practice) } } : state;
}

/** 下書きの仕訳を答え合わせする */
export const checkPracticeStep = (state: GameState, answer: Entry) =>
  updatePractice(state, (p) => {
    const step = p.problem.steps?.[p.step];
    if (!step || p.stepResults[p.step] !== null) return p;
    return { ...p, stepResults: setAt(p.stepResults, p.step, sameEntry(answer, step.answer)), stepAnswer: answer };
  });

/** 次の下書きへ。all なら残りの下書きを飛ばして答案の記入へ */
export const nextPracticeStep = (state: GameState, all = false) =>
  updatePractice(state, (p) => ({ ...p, step: all ? (p.problem.steps?.length ?? 0) : p.step + 1, stepAnswer: null }));

export const setPracticeFill = (state: GameState, blank: number, value: FillAnswer) =>
  updatePractice(state, (p) => (p.results ? p : { ...p, fills: setAt(p.fills, blank, value) }));

/** 答案を採点する。7割以上なら、その論点を「できた」と記録する */
export function gradePractice(state: GameState): GameState {
  if (state.phase.kind !== "practice" || state.phase.practice.results) return state;
  const p = state.phase.practice;
  // ガイドつきなら、1欄ずつ答え合わせしたときの正誤で採点する（間違えた欄は正解が書き込まれているため）
  const results = p.checks ? p.checks.map((c) => c === true) : p.problem.blanks.map((b, i) => fillCorrect(b, p.fills[i]));
  const logged = logPractice(state, p.problem.lesson, problemPassed(p.problem, results));
  return { ...logged, phase: { kind: "practice", practice: { ...p, results } } };
}

export const finishPractice = (state: GameState): GameState => (state.phase.kind === "practice" ? { ...state, phase: { kind: "training" } } : state);
