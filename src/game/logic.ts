import type { AccountName } from "@/engine/accounts";
import { diagnose, sumAmounts, type Entry } from "@/engine/journal";
import { balanceOf } from "@/engine/ledger";
import { TEMPLATES, type Ctx } from "@/content/events";
import { LESSONS, LESSON_BY_ID, lessonsForLevel, type Lesson } from "@/content/lessons";
import { DAYS_PER_MONTH, ITEM_IDS, dayInMonth } from "@/content/world";
import type { Choice, DayStats, Effect, GameState, LessonId, ResultInfo, TxSession } from "./types";

export type Rand = () => number;

const GUIDED = "!";
const LESSON = "lesson:";

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

export function totalSales(state: GameState): number {
  return balance(state, "売上");
}

/** 今日の予定に入っている講義 */
export function todaysLesson(state: GameState): LessonId | undefined {
  return state.queue.find((q) => q.startsWith(LESSON))?.slice(LESSON.length) as LessonId | undefined;
}

export function expectedCustomers(state: GameState): number {
  return state.queue.filter((q) => q.endsWith("customer")).length;
}

export function newGame(shopName: string, rand: Rand): GameState {
  const state: GameState = {
    version: 1,
    shopName,
    level: 1,
    day: 1,
    trust: 50,
    reputation: 20,
    combo: 0,
    stock: { potion: 0, herb: 0, antidote: 0, scroll: 0 },
    journal: [],
    lessonsDone: [],
    queue: [],
    credits: [],
    creditSeq: 0,
    quest: null,
    cashDiff: null,
    mistakes: [],
    today: emptyDay(),
    phase: { kind: "dayStart" },
  };
  return { ...state, queue: planDay(state, rand) };
}

/** 次に受ける講義（1日1つ） */
function nextLesson(state: GameState): Lesson | undefined {
  return lessonsForLevel(state.level).find((l) => !state.lessonsDone.includes(l.id));
}

/** 講義と、その直後の練習取引 */
const lessonItems = (l: Lesson) => [`${LESSON}${l.id}`, ...l.practice.map((t) => GUIDED + t)];

export function planDay(state: GameState, rand: Rand): string[] {
  // 開業日は開業に必要な講義をまとめて受け、お客さんを1人だけ迎える
  if (state.day === 1) return [...LESSONS.filter((l) => l.opening).flatMap(lessonItems), "customer"];
  const has = (id: LessonId) => state.lessonsDone.includes(id);
  const dim = dayInMonth(state.day);
  const q: string[] = [];

  const lesson = nextLesson(state);
  if (lesson) q.push(...lessonItems(lesson));
  const willHave = (id: LessonId) => has(id) || lesson?.id === id;

  if (willHave("expenses") && dim === 1) q.push("rent");
  if (willHave("expenses") && dim === 3) q.push("utility");
  if (has("advances")) q.push("receive-staff", "deliver-staff");
  if (has("cashdiff")) q.push("cashdiff-resolve");
  if (has("credit")) q.push("pay-supplier", "collect");
  if (has("credit") && state.credits.filter((c) => c.kind === "売掛金").length > 1 && rand() < 0.5) q.push("collect");

  q.push("bank", "wholesale");
  if (rand() < 0.5) q.push("wholesale");
  if (has("returns") && rand() < 0.3) q.push("purchase-return");

  const extras: string[] = [];
  if (willHave("expenses")) {
    if (rand() < 0.35) extras.push("supplies");
    if (rand() < 0.25) extras.push("letter");
    if (rand() < 0.2) extras.push("ad");
  }
  if (has("returns") && rand() < 0.25) extras.push("sales-return");
  if (has("cashdiff") && rand() < 0.2) extras.push("cashdiff");
  if (has("advances") && !state.quest && rand() < 0.15) extras.push("order-staff");

  const customers = 2 + Math.floor(state.reputation / 25);
  const rest = [...Array(customers).fill("customer"), ...extras];
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  q.push(...rest.slice(0, Math.ceil(rest.length / 2)), "bank", ...rest.slice(Math.ceil(rest.length / 2)));
  // 特注クエストの手付金はクエストの段階で判定するので、常に最後に置いておけばよい
  if (has("advances")) q.push("advance-dwarf");
  return q;
}

function ctxOf(state: GameState, rand: Rand, guided: boolean): Ctx {
  return {
    state,
    rand,
    guided,
    cash: balance(state, "現金"),
    deposit: balance(state, "普通預金"),
    has: (id) => state.lessonsDone.includes(id),
  };
}

/** キューから次の講義・イベントを取り出す。空になったら一日の終わり */
export function advance(state: GameState, rand: Rand): GameState {
  const queue = [...state.queue];
  while (queue.length > 0) {
    const head = queue.shift()!;
    if (head.startsWith(LESSON)) {
      const lesson = head.slice(LESSON.length) as LessonId;
      if (state.lessonsDone.includes(lesson)) continue;
      return { ...state, queue, phase: { kind: "lesson", lesson, page: 0 } };
    }
    const guided = head.startsWith(GUIDED);
    const id = guided ? head.slice(1) : head;
    const template = TEMPLATES[id];
    if (!template || !state.lessonsDone.includes(template.lesson)) continue;
    const built = template.build(ctxOf(state, rand, guided));
    if (!built) continue;
    if (built.choices.every((c) => c.disabled)) {
      built.choices.push({
        label: "今は見送る（お金が足りない）",
        reply: "ホーホー「お金が足りんときは、銀行で引き出すか、商品を売って現金を作るのじゃ」",
        effect: { reputation: -1 },
      });
    }
    return { ...state, queue, phase: { kind: "event", event: { ...built, templateId: id, guided: built.guided ?? guided } } };
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

/** Lv1 → Lv2 の条件（朝の画面の目標表示と共通） */
export const LEVEL_UP = { days: 4, sales: 50000, trust: 55 };

/** Lv1 → Lv2：Lv1の講義をすべて受け、売上累計と帳簿の信用が十分なとき */
export function canLevelUp(state: GameState): boolean {
  if (state.level !== 1) return false;
  const lv1Done = lessonsForLevel(1).every((l) => state.lessonsDone.includes(l.id));
  return lv1Done && state.day >= LEVEL_UP.days && totalSales(state) >= LEVEL_UP.sales && state.trust >= LEVEL_UP.trust;
}

export function closeDay(state: GameState): GameState {
  if (isMonthEnd(state)) return { ...state, phase: { kind: "monthEnd", answered: [null, null] } };
  return nextDay(state);
}

export function nextDay(state: GameState, rand: Rand = Math.random): GameState {
  const levelUp = canLevelUp(state);
  const base: GameState = {
    ...state,
    day: state.day + 1,
    level: levelUp ? state.level + 1 : state.level,
    today: emptyDay(),
  };
  const planned = { ...base, queue: planDay(base, rand) };
  return { ...planned, phase: levelUp ? { kind: "levelUp", level: base.level } : { kind: "dayStart" } };
}

export function answerMonthQuiz(state: GameState, index: number, correct: boolean): GameState {
  if (state.phase.kind !== "monthEnd") return state;
  const answered = [...state.phase.answered];
  if (answered[index] !== null) return state;
  answered[index] = correct;
  return { ...state, trust: clamp(state.trust + (correct ? 3 : 0)), phase: { kind: "monthEnd", answered } };
}
