import type { AccountName } from "@/engine/accounts";
import { diagnose, sameEntry, sumAmounts, type Entry } from "@/engine/journal";
import { balanceIn, balanceOf, netBalances, statements } from "@/engine/ledger";
import { TEMPLATES } from "@/content/events";
import { withSalesTax } from "@/content/salesTax";
import type { Ctx } from "@/content/eventKit";
import { EXAM_BANK } from "@/content/examBank";
import { LESSONS, LESSON_BY_ID, lessonsForLevel, type Lesson } from "@/content/lessons";
import { DAYS_PER_MONTH, ITEM_IDS, dayInMonth, isYearEnd } from "@/content/world";
import { CLOSING_PLAN, OPENING_PLAN } from "@/content/eventsClosing";
import { fmt } from "@/engine/format";
export type { Rand } from "./random";
import { type Rand, shuffle } from "./random";
import type { Choice, DayStats, Effect, ExamQuestion, ExamSession, GameState, JournalRecord, LessonId, QueueItem, ResultInfo, Transaction, TxSession } from "./types";


const emptyDay = (): DayStats => ({ sales: 0, purchases: 0, correct: 0, firstTry: 0, bestCombo: 0 });
const clamp = (v: number) => Math.max(0, Math.min(100, v));

export function entriesOf(state: GameState): Entry[] {
  return state.journal.map((r) => r.entry);
}

export function balance(state: GameState, account: AccountName): number {
  return balanceOf(entriesOf(state), account);
}

export function unlockedAccounts(state: GameState): AccountName[] {
  return state.lessonsDone.flatMap((id) => LESSON_BY_ID[id].accounts);
}

/** 開業からの売上の累計（決算の損益振替で売上の残高がゼロに戻っても数え続ける） */
export function totalSales(state: GameState): number {
  return state.journal
    .filter((r) => r.templateId !== "closing-transfer")
    .reduce((sum, r) => sum + sumAmounts(r.entry.credit.filter((l) => l.account === "売上")) - sumAmounts(r.entry.debit.filter((l) => l.account === "売上")), 0);
}

/** 今日の予定に入っている講義 */
export function todaysLesson(state: GameState): LessonId | undefined {
  return state.queue.find((q) => q.kind === "lesson")?.id as LessonId | undefined;
}

export function expectedCustomers(state: GameState): number {
  return state.queue.filter((q) => q.kind === "event" && q.id.startsWith("customer")).length;
}

/** 新しいゲームの状態。セーブの読み込みでも、後から増えた項目の初期値として使う */
export function initialState(shopName: string): GameState {
  return {
    version: 2,
    shopName,
    level: 1,
    day: 1,
    trust: 50,
    reputation: 20,
    combo: 0,
    stock: { potion: 0, herb: 0, antidote: 0, scroll: 0, ether: 0, elixir: 0 },
    journal: [],
    lessonsDone: [],
    queue: [],
    credits: [],
    creditSeq: 0,
    quest: null,
    cashDiff: null,
    mistakes: [],
    examRetryDay: 0,
    closingFrom: null,
    today: emptyDay(),
    phase: { kind: "dayStart" },
  };
}

export function newGame(shopName: string, rand: Rand): GameState {
  const state = initialState(shopName);
  return { ...state, queue: planDay(state, rand) };
}

/** 次に受ける講義（1日1つ） */
function nextLesson(state: GameState): Lesson | undefined {
  return lessonsForLevel(state.level).find((l) => !state.lessonsDone.includes(l.id));
}

const ev = (id: string, guided = false): QueueItem => ({ kind: "event", id, guided });

/** 講義と、その直後の練習取引 */
const lessonItems = (l: Lesson): QueueItem[] => [{ kind: "lesson", id: l.id }, ...l.practice.map((t) => ev(t, true))];

/** 講義を受けた後の取引。毎日判定するものと、ときどき起きるもの（確率つき） */
const DAILY = Object.entries(TEMPLATES).filter(([, t]) => t.schedule === "daily");
const EXTRAS = Object.entries(TEMPLATES).filter(([, t]) => typeof t.schedule === "number");

export function planDay(state: GameState, rand: Rand): QueueItem[] {
  // 開業日は開業に必要な講義をまとめて受け、お客さんを1人だけ迎える
  if (state.day === 1) return [...LESSONS.filter((l) => l.opening).flatMap(lessonItems), ev("customer")];
  const has = (id: LessonId) => state.lessonsDone.includes(id);
  const dim = dayInMonth(state.day);
  const q: QueueItem[] = [];

  const lesson = nextLesson(state);
  if (lesson) q.push(...lessonItems(lesson));
  const willHave = (id: LessonId) => has(id) || lesson?.id === id;

  if (willHave("expenses") && dim === 1) q.push(ev("rent"));
  if (willHave("expenses") && dim === 3) q.push(ev("utility"));
  for (const [id, t] of DAILY) if (has(t.lesson)) q.push(ev(id));
  if (has("credit") && state.credits.filter((c) => c.kind === "売掛金").length > 1 && rand() < 0.5) q.push(ev("collect"));

  q.push(ev("bank"), ev("wholesale"));
  if (rand() < 0.5) q.push(ev("wholesale"));
  if (has("returns") && rand() < 0.3) q.push(ev("purchase-return"));

  const extras = EXTRAS.filter(([, t]) => willHave(t.lesson) && rand() < (t.schedule as number)).map(([id]) => ev(id));
  // 評判が上がるほど、店が大きくなるほど、お客さんが増える
  const customers = 1 + state.level + Math.floor(state.reputation / 25);
  const rest = shuffle([...Array.from({ length: customers }, () => ev("customer")), ...extras], rand);
  const half = Math.ceil(rest.length / 2);
  q.push(...rest.slice(0, half), ev("bank"), ...rest.slice(half));
  // 特注クエストの手付金はクエストの段階で判定するので、常に最後に置いておけばよい
  if (has("advances")) q.push(ev("advance-dwarf"));
  return q;
}

function ctxOf(state: GameState, rand: Rand, guided: boolean): Ctx {
  // 残高は最初に必要になったときに一度だけ集計し、使い回す
  let net: Map<AccountName, number> | undefined;
  return {
    state,
    rand,
    guided,
    balance: (account) => {
      net ??= netBalances(entriesOf(state));
      return balanceIn(net, account);
    },
    has: (id) => state.lessonsDone.includes(id),
  };
}

const MONEY: AccountName[] = ["現金", "小口現金", "当座預金", "普通預金"];

/** 取引で払うお金が残高より多ければ、選べない理由を返す */
function moneyShortage(ctx: Ctx, tx: Transaction): string | undefined {
  for (const account of MONEY) {
    const paid = sumAmounts(tx.answer.credit.filter((l) => l.account === account));
    if (paid > 0 && ctx.balance(account) < paid) return `${account}が足りない`;
  }
  return undefined;
}

/** キューから次の講義・イベントを取り出す。空になったら一日の終わり */
export function advance(state: GameState, rand: Rand): GameState {
  const queue = [...state.queue];
  const ctx = ctxOf(state, rand, false);
  while (queue.length > 0) {
    const head = queue.shift()!;
    if (head.kind === "lesson") {
      if (state.lessonsDone.includes(head.id)) continue;
      return { ...state, queue, phase: { kind: "lesson", lesson: head.id, page: 0 } };
    }
    if (head.kind === "worksheet") return { ...state, queue, phase: { kind: "worksheet", answered: [null, null] } };
    if (head.kind === "report") return { ...state, queue, phase: { kind: "report" } };
    const { id } = head;
    const guided = !!head.guided;
    const template = TEMPLATES[id];
    if (!template || !state.lessonsDone.includes(template.lesson)) continue;
    if (template.once && state.journal.some((r) => r.templateId === id && (template.once === "game" || r.day === state.day))) continue;
    const built = template.build({ ...ctx, guided });
    if (!built) continue;
    // 講義の練習では、仕訳をしない選択肢（断るなど）を出さない
    let choices = guided ? built.choices.filter((c) => c.tx) : [...built.choices];
    // 消費税を習ったあとは、商品の売買に税抜方式の消費税を加える。税込で払えなくなった選択肢は選べない
    if (state.lessonsDone.includes("salestax")) {
      choices = choices.map((c) => {
        if (!c.tx?.taxable) return c;
        const tx = withSalesTax(c.tx);
        return { ...c, tx, disabled: c.disabled ?? moneyShortage(ctx, tx) };
      });
    }
    if (choices.every((c) => c.disabled)) {
      choices.push({
        label: "今は見送る（お金が足りない）",
        reply: "ホーホー「お金が足りんときは、銀行で引き出すか、商品を売って現金を作るのじゃ」",
        effect: { reputation: -1 },
      });
    }
    return { ...state, queue, phase: { kind: "event", event: { ...built, choices, templateId: id, guided } } };
  }
  return { ...state, queue, phase: { kind: "dayEnd" } };
}

export function turnLessonPage(state: GameState, delta: number): GameState {
  if (state.phase.kind !== "lesson") return state;
  const lesson = LESSON_BY_ID[state.phase.lesson];
  const page = state.phase.page + delta;
  if (page < 0) return state;
  if (page >= lesson.pages.length) {
    return {
      ...state,
      lessonsDone: [...state.lessonsDone, lesson.id],
      phase: { kind: "lessonDone", lesson: lesson.id },
    };
  }
  return { ...state, phase: { ...state.phase, page } };
}

function applyEffect(state: GameState, effect: Effect | undefined): GameState {
  if (!effect) return state;
  let next = { ...state };
  if (effect.stock) {
    const stock = { ...next.stock };
    for (const id of ITEM_IDS) stock[id] = Math.max(0, stock[id] + (effect.stock[id] ?? 0));
    next.stock = stock;
  }
  if (effect.reputation) next.reputation = clamp(next.reputation + effect.reputation);
  if (effect.settleCredits || effect.addCredits) {
    let credits = next.credits.map((c) => {
      const s = effect.settleCredits?.find((x) => x.id === c.id);
      return s ? { ...c, amount: c.amount - s.amount } : c;
    });
    credits = credits.filter((c) => c.amount > 0);
    let seq = next.creditSeq;
    for (const c of effect.addCredits ?? []) credits.push({ ...c, id: `c${++seq}`, day: next.day });
    next = { ...next, credits, creditSeq: seq };
  }
  if (effect.quest !== undefined) next.quest = effect.quest;
  if (effect.cashDiff !== undefined) next.cashDiff = effect.cashDiff;
  return next;
}

export function choose(state: GameState, index: number, rand: Rand): GameState {
  if (state.phase.kind !== "event") return state;
  const event = state.phase.event;
  const choice: Choice | undefined = event.choices[index];
  if (!choice || choice.disabled) return state;
  if (choice.tx) {
    const session: TxSession = {
      tx: choice.tx,
      speaker: event.speaker,
      templateId: event.templateId,
      guided: !!event.guided,
      // 練習問題では最初のヒントを無料で見せる
      hints: event.guided ? 1 : 0,
      attempts: 0,
      feedback: null,
    };
    return { ...state, phase: { kind: "journal", session } };
  }
  const next = applyEffect(state, choice.effect);
  if (choice.reply) return { ...next, phase: { kind: "reply", speaker: event.speaker, text: choice.reply } };
  return advance(next, rand);
}

export function takeHint(state: GameState): GameState {
  if (state.phase.kind !== "journal") return state;
  const s = state.phase.session;
  if (s.hints >= 3) return state;
  return { ...state, phase: { kind: "journal", session: { ...s, hints: s.hints + 1 } } };
}

const COMBO_MESSAGES: Record<number, string> = {
  3: "3連続ノーヒント正解！ ホーホー先生が目を細めている。",
  5: "5連続！ 「帳簿のきれいな店は信用できる」と噂が広がった。（評判 +3）",
  10: "10連続！ 王都の会計士たちがこの店の帳簿を見に来た。（評判 +5）",
};

export function submitEntry(state: GameState, input: Entry): GameState {
  if (state.phase.kind !== "journal") return state;
  const s = state.phase.session;
  const d = diagnose(input, s.tx.answer);
  if (!d.ok) {
    // 書きかけ（空欄・金額なし）は注意だけ。ミスとして数えない
    if (d.kind === "incomplete") {
      return { ...state, phase: { kind: "journal", session: { ...s, feedback: d.messages } } };
    }
    const firstMiss = s.attempts === 0;
    return {
      ...state,
      trust: firstMiss && !s.guided ? clamp(state.trust - 2) : state.trust,
      combo: 0,
      mistakes: firstMiss ? [...state.mistakes, { day: state.day, templateId: s.templateId, exam: s.tx.exam }] : state.mistakes,
      phase: { kind: "journal", session: { ...s, attempts: s.attempts + 1, feedback: d.messages } },
    };
  }

  const paidHints = s.guided ? Math.max(0, s.hints - 1) : s.hints;
  const firstTry = s.attempts === 0 && paidHints === 0;
  // ヒントを使ったり、間違えてから自力で直したりしても少し報われる
  const trustDelta = firstTry ? 2 : 1;
  const combo = firstTry ? state.combo + 1 : 0;
  const comboMessage = COMBO_MESSAGES[combo];
  const comboRep = combo === 5 ? 3 : combo === 10 ? 5 : 0;

  const sales = sumAmounts(s.tx.answer.credit.filter((l) => l.account === "売上"));
  const purchases = sumAmounts(s.tx.answer.debit.filter((l) => l.account === "仕入"));

  let next: GameState = {
    ...state,
    journal: [...state.journal, { day: state.day, templateId: s.templateId, exam: s.tx.exam, entry: s.tx.answer }],
    trust: clamp(state.trust + trustDelta),
    combo,
    reputation: clamp(state.reputation + comboRep),
    today: {
      sales: state.today.sales + sales,
      purchases: state.today.purchases + purchases,
      correct: state.today.correct + 1,
      firstTry: state.today.firstTry + (firstTry ? 1 : 0),
      bestCombo: Math.max(state.today.bestCombo, combo),
    },
  };
  next = applyEffect(next, s.tx.effect);
  const info: ResultInfo = { tx: s.tx, firstTry, trustDelta, combo, comboMessage };
  return { ...next, phase: { kind: "result", info, speaker: s.speaker } };
}

export function isMonthEnd(state: GameState): boolean {
  return dayInMonth(state.day) === DAYS_PER_MONTH;
}

/** 次のLvへの昇格条件と、昇格審査の形式（朝の画面の目標表示と共通） */
export const LEVEL_UP: Record<number, { days: number; sales: number; trust: number; questions: number; minutes: number; requires?: LessonId[] }> = {
  1: { days: 4, sales: 50000, trust: 55, questions: 4, minutes: 12 },
  2: { days: 12, sales: 250000, trust: 60, questions: 5, minutes: 15 },
  3: { days: 22, sales: 600000, trust: 65, questions: 5, minutes: 15 },
  // Lv5 は、最初の決算を終えてから
  4: { days: 64, sales: 1500000, trust: 70, questions: 6, minutes: 18, requires: ["closing"] },
};

export const EXAM_PASS = 70;

/** 今のLvの講義をすべて受け、売上累計と帳簿の信用が十分なら昇格審査を受けられる */
export function canLevelUp(state: GameState): boolean {
  const goal = LEVEL_UP[state.level];
  if (!goal) return false;
  const lessonsDone = [...lessonsForLevel(state.level).map((l) => l.id), ...(goal.requires ?? [])].every((id) => state.lessonsDone.includes(id));
  return lessonsDone && state.day >= goal.days && totalSales(state) >= goal.sales && state.trust >= goal.trust;
}

export function closeDay(state: GameState, rand: Rand = Math.random): GameState {
  // 決算日を終えたら新しい年度へ。初日はまず再振替仕訳から
  if (state.closingFrom !== null) {
    const next = startDay({ ...state, closingFrom: null, day: state.day + 1, today: emptyDay() }, rand);
    return { ...next, queue: [...OPENING_PLAN, ...next.queue] };
  }
  if (isMonthEnd(state)) return { ...state, phase: { kind: "monthEnd", answered: [null, null] } };
  return nextDay(state, rand);
}

/** 3月の最終営業日を終えたら、同じ日を決算日にする */
function startClosing(state: GameState): GameState {
  // 初めての決算では、各整理仕訳を講義の練習として扱う
  const queue = CLOSING_PLAN.map((q) => (q.kind === "event" ? { ...q, guided: !state.lessonsDone.includes(TEMPLATES[q.id].lesson) } : q));
  return { ...state, closingFrom: state.journal.length, today: emptyDay(), queue, phase: { kind: "dayStart" } };
}

/** 損益振替：収益・費用の残高を損益勘定に集め、当期純利益を繰越利益剰余金へ移す */
export function transferEntries(state: GameState): JournalRecord[] {
  const { revenues, expenses, netIncome } = statements(entriesOf(state));
  const record = (exam: string, entry: Entry): JournalRecord => ({ day: state.day, templateId: "closing-transfer", exam, entry });
  const records: JournalRecord[] = [];
  if (revenues.length) records.push(record("収益の各勘定の残高を損益勘定に振り替えた。", { debit: revenues, credit: [{ account: "損益", amount: sumAmounts(revenues) }] }));
  if (expenses.length) records.push(record("費用の各勘定の残高を損益勘定に振り替えた。", { debit: [{ account: "損益", amount: sumAmounts(expenses) }], credit: expenses }));
  if (netIncome !== 0) {
    // 利益なら 損益／繰越利益剰余金、損失なら逆
    const [d, c]: AccountName[] = netIncome > 0 ? ["損益", "繰越利益剰余金"] : ["繰越利益剰余金", "損益"];
    const amount = Math.abs(netIncome);
    records.push(record(`当期純${netIncome > 0 ? "利益" : "損失"}${fmt(amount)}円を繰越利益剰余金勘定に振り替えた。`, { debit: [{ account: d, amount }], credit: [{ account: c, amount }] }));
  }
  return records;
}

/** 財務諸表を確認したら、損益を振り替えて決算日を終える */
export function finishReport(state: GameState, rand: Rand): GameState {
  if (state.phase.kind !== "report") return state;
  return advance({ ...state, journal: [...state.journal, ...transferEntries(state)] }, rand);
}

/** その日の予定を立て、昇格の条件がそろっていれば朝いちばんに審査を行う */
function startDay(state: GameState, rand: Rand): GameState {
  const planned = { ...state, queue: planDay(state, rand) };
  if (canLevelUp(planned) && planned.day >= planned.examRetryDay) return { ...planned, phase: { kind: "exam", exam: makeExam(planned, rand) } };
  return { ...planned, phase: { kind: "dayStart" } };
}

export function nextDay(state: GameState, rand: Rand = Math.random): GameState {
  if (isYearEnd(state.day) && state.closingFrom === null) return startClosing(state);
  return startDay({ ...state, day: state.day + 1, today: emptyDay() }, rand);
}

/** これまでに習った論点から、なるべく論点が重ならないように出題する */
export function makeExam(state: GameState, rand: Rand): ExamSession {
  const goal = LEVEL_UP[state.level];
  const learned = new Set(state.lessonsDone);
  // 今のLvで習った論点を優先し、同じ論点の2問目以降は後回しにする
  const pool = shuffle(
    EXAM_BANK.filter((q) => learned.has(q.lesson)),
    rand,
  ).sort((a, b) => LESSON_BY_ID[b.lesson].level - LESSON_BY_ID[a.lesson].level);
  const seen = new Set<LessonId>();
  const firsts: ExamQuestion[] = [];
  const repeats: ExamQuestion[] = [];
  for (const q of pool) {
    if (seen.has(q.lesson)) repeats.push(q);
    else {
      seen.add(q.lesson);
      firsts.push(q);
    }
  }
  const questions = [...firsts, ...repeats].slice(0, goal.questions);
  return {
    toLevel: state.level + 1,
    questions,
    answers: questions.map(() => null),
    startedAt: null,
    minutes: goal.minutes,
    graded: null,
  };
}

function updateExam(state: GameState, f: (e: ExamSession) => ExamSession): GameState {
  if (state.phase.kind !== "exam") return state;
  return { ...state, phase: { kind: "exam", exam: f(state.phase.exam) } };
}

export const beginExam = (state: GameState, now: number) => updateExam(state, (e) => (e.startedAt ? e : { ...e, startedAt: now }));

export const setExamAnswer = (state: GameState, index: number, answer: Entry) =>
  updateExam(state, (e) => (e.graded ? e : { ...e, answers: e.answers.map((a, i) => (i === index ? answer : a)) }));

export function examScore(e: ExamSession): number {
  return e.graded ? Math.round((e.graded.filter(Boolean).length / e.graded.length) * 100) : 0;
}

/** 採点する。間違えた問題は苦手として記録する */
export function gradeExam(state: GameState): GameState {
  if (state.phase.kind !== "exam" || state.phase.exam.graded) return state;
  const e = state.phase.exam;
  const graded = e.questions.map((q, i) => {
    const a = e.answers[i];
    return !!a && sameEntry(a, q.answer);
  });
  const mistakes = e.questions
    .filter((_, i) => !graded[i])
    .map((q) => ({ day: state.day, templateId: `exam:${q.lesson}`, exam: q.text }));
  return updateExam({ ...state, mistakes: [...state.mistakes, ...mistakes] }, (x) => ({ ...x, graded }));
}

/** 結果を見終えたあと。合格なら昇格、不合格なら2日後に再挑戦 */
export function finishExam(state: GameState, rand: Rand): GameState {
  if (state.phase.kind !== "exam" || !state.phase.exam.graded) return state;
  if (examScore(state.phase.exam) >= EXAM_PASS) {
    const promoted = startDay({ ...state, level: state.level + 1 }, rand);
    return { ...promoted, phase: { kind: "levelUp", level: promoted.level } };
  }
  return { ...state, examRetryDay: state.day + 2, phase: { kind: "dayStart" } };
}

/** 月末・決算日のクイズに答える。正解なら信用が上がる */
export function answerQuiz(state: GameState, index: number, correct: boolean): GameState {
  const p = state.phase;
  if ((p.kind !== "monthEnd" && p.kind !== "worksheet") || p.answered[index] !== null) return state;
  const answered = p.answered.map((a, i) => (i === index ? correct : a));
  return { ...state, trust: clamp(state.trust + (correct ? 3 : 0)), phase: { ...p, answered } };
}
