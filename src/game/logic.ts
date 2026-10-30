import type { AccountName } from "@/engine/accounts";
import { diagnose, sameEntry, sumAmounts, sumOf, type Entry } from "@/engine/journal";
import { balanceIn, balanceOf, netBalances, statements } from "@/engine/ledger";
import { type PurchasePay, TEMPLATES, purchaseTx } from "@/content/events";
import { type Memory, memoryOf, overdue } from "./memory";
import { rollRequests } from "./requests";
import { DECORS, type DecorId, dropRate, pickTreasure } from "@/content/treasures";
import { UPGRADES, type UpgradeId, type UpgradePay, hasUpgrade, repTier, upgradeTx } from "@/content/upgrades";
import { withSalesTax } from "@/content/salesTax";
import { type Ctx, need } from "@/content/eventKit";
import { BANK_BY_LESSON, EXAM_BANK } from "@/content/examBank";
import { LESSONS, LESSON_BY_ID, lessonsForLevel, lessonsUpTo, type Lesson } from "@/content/lessons";
import { DAYS_PER_MONTH, ITEMS, ITEM_IDS, OPEN_DAY, dayInMonth, isYearEnd, perItem, yearStartDay } from "@/content/world";
import { CLOSING_PLAN, OPENING_PLAN } from "@/content/eventsClosing";
import { fmt } from "@/engine/format";
export type { Rand } from "./random";
import { type Rand, shuffle } from "./random";
import type { CharacterId, Choice, DayStats, ItemId, PracticeRecord, Effect, ExamQuestion, ExamSession, GameState, JournalRecord, LessonId, QueueItem, ResultInfo, Transaction, TxSession } from "./types";


const emptyDay = (): DayStats => ({ sales: 0, purchases: 0, correct: 0, firstTry: 0, bestCombo: 0 });
const clamp = (v: number) => Math.max(0, Math.min(100, v));

/**
 * 帳簿の信用は「最近の記帳の正確さ」：ノーヒント正解なら100、それ以外なら30に向かって少しずつ動く（直近20件くらいの平均）。
 * 足し算でためると上限に張りついて意味がなくなるので、正確さが落ちれば下がるようにする
 */
const TRUST_RATE = 0.1;
const trustAfter = (trust: number, clean: boolean) => clamp(Math.round(trust + ((clean ? 100 : 30) - trust) * TRUST_RATE));

/**
 * 評判は、何もしなければ毎日40に向かって戻る（よい商売を続けないと保てない）。看板があると戻りがゆるやか。
 * 1日に評判が上がる量（売るたびに＋1〜3など）とつり合うところで落ち着くので、上限に張りつきにくい
 */
const REP_BASE = 40;
const repAfterDay = (state: GameState) =>
  clamp(state.reputation - Math.round((state.reputation - REP_BASE) * (hasUpgrade(state, "sign") ? 0.12 : 0.2)));

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
  return balanceOf(
    state.journal.filter((r) => r.templateId !== "closing-transfer").map((r) => r.entry),
    "売上",
  );
}

/** 今日の予定に入っている講義 */
export function todaysLesson(state: GameState): LessonId | undefined {
  return state.queue.find((q) => q.kind === "lesson")?.id as LessonId | undefined;
}

export function expectedCustomers(state: GameState): number {
  return state.queue.filter((q) => q.kind === "event" && (q.id.startsWith("customer") || q.fallback === "customer")).length;
}

/** 新しいゲームの状態。セーブの読み込みでも、後から増えた項目の初期値として使う */
export function initialState(shopName: string): GameState {
  return {
    version: 2,
    shopName,
    level: 1,
    day: OPEN_DAY,
    openDay: OPEN_DAY,
    trust: 50,
    reputation: 20,
    combo: 0,
    stock: perItem(() => 0),
    stockValue: perItem(() => 0),
    journal: [],
    lessonsDone: [],
    queue: [],
    credits: [],
    creditSeq: 0,
    quest: null,
    upgrades: [],
    requests: null,
    reward: null,
    festival: null,
    treasures: {},
    decor: "wood",
    cashDiff: null,
    mistakes: [],
    examRetryDay: 0,
    closingFrom: null,
    achievements: [],
    bestCombo: 0,
    practice: [],
    mocks: [],
    autoPost: false,
    today: emptyDay(),
    phase: { kind: "dayStart" },
  };
}

export function newGame(shopName: string, rand: Rand): GameState {
  const state = rollRequests(initialState(shopName));
  return { ...state, queue: planDay(state, rand) };
}

/** 次に受ける講義（1日1つ）。今の Lv までの講義で、まだ受けていないもの（後から足された講義は「補講」になる） */
export function nextLesson(state: GameState): Lesson | undefined {
  return lessonsUpTo(state.level).find((l) => !state.lessonsDone.includes(l.id));
}

const ev = (id: string, guided = false): QueueItem => ({ kind: "event", id, guided });

/** 講義と、その直後の練習取引（"guild" はその講義の論点のギルドの帳簿相談） */
const lessonItems = (l: Lesson): QueueItem[] => [
  { kind: "lesson", id: l.id },
  ...l.practice.map((t): QueueItem => (t === "guild" ? { kind: "event", id: t, guided: true, topic: l.id } : ev(t, true))),
];

/** 講義を受けた後の取引。毎日判定するものと、ときどき起きるもの（確率つき） */
const DAILY = Object.entries(TEMPLATES).filter(([, t]) => t.schedule === "daily");
/** 復習の取引（論点ごと）と、その論点の中で選ばれる重み */
export const REVIEW_TEMPLATES = new Map<LessonId, [string, number][]>();
/** お客さんの来店として出す取引と、その重み */
const WALK_INS: [string, number][] = [];
for (const [id, t] of Object.entries(TEMPLATES)) {
  if (t.review) REVIEW_TEMPLATES.set(t.lesson, [...(REVIEW_TEMPLATES.get(t.lesson) ?? []), [id, t.review]]);
  if (t.walkIn) WALK_INS.push([id, t.walkIn]);
}

/** 重みつきで1つ選ぶ（候補がなければ undefined） */
function pickWeighted(options: [string, number][], rand: Rand): string | undefined {
  let roll = rand() * options.reduce((a, [, w]) => a + w, 0);
  return options.find(([, w]) => (roll -= w) < 0)?.[0];
}
/** 毎日の売り買いで必ず練習する論点（復習の対象から外す）。消費税は、習ったあとの売り買いすべてに含まれる */
export const EVERYDAY = new Set<LessonId>(["basics", "trade", "salestax"]);

/** 直近の何回分で習熟度をはかるか（昔のミスをいつまでも引きずらないように） */
const RECENT = 10;

export interface Mastery {
  tries: number;
  correct: number;
  /** 1：練習中（正答率7割未満）／2：まずまず／3：得意 */
  stars: 1 | 2 | 3;
}

/** 論点ごとの習熟度（直近の正答率）。習熟度マップと、復習で苦手な論点を選ぶのに使う */
export function masteryOf(state: GameState): Map<LessonId, Mastery> {
  const all = new Map<LessonId, boolean[]>();
  for (const r of state.practice) {
    const oks = all.get(r.lesson);
    if (oks) oks.push(r.ok);
    else all.set(r.lesson, [r.ok]);
  }
  const map = new Map<LessonId, Mastery>();
  for (const [lesson, oks] of all) {
    const recent = oks.slice(-RECENT);
    const correct = recent.filter(Boolean).length;
    const rate = correct / recent.length;
    map.set(lesson, { tries: recent.length, correct, stars: rate >= 0.9 && recent.length >= 5 ? 3 : rate >= 0.7 ? 2 : 1 });
  }
  return map;
}

/** 一度きり（once）の取引で、決められた期間にもう起きたもの */
function onceUsed(state: GameState, id: string): boolean {
  const once = TEMPLATES[id]?.once;
  if (!once) return false;
  const since = { game: 0, year: yearStartDay(state.day), day: state.day }[once];
  return state.journal.some((r) => r.templateId === id && r.day >= since);
}

/** その取引を組み立てる。取引がない・講義をまだ受けていない・一度きりでもう済んだ・今日は起こせない、なら null */
function buildable(state: GameState, ctx: Ctx, id: string) {
  const t = TEMPLATES[id];
  return t && state.lessonsDone.includes(t.lesson) && !onceUsed(state, id) ? t.build(ctx) : null;
}

/** ギルドの帳簿相談の取引名（"guild-論点"。正誤の記録で論点に戻す） */
const GUILD_PREFIX = "guild-";
const guildId = (topic: LessonId | undefined) => `${GUILD_PREFIX}${topic}`;

/**
 * 復習の時期がまだ来ていない得意な論点（★3）か。こうした論点の取引は、意思決定（選択肢）だけ選べば、記帳はノエルに任せられる
 */
function settled(lesson: LessonId | undefined, day: number, memory: Map<LessonId, Memory>, mastery: Map<LessonId, Mastery>): boolean {
  return !!lesson && mastery.get(lesson)?.stars === 3 && overdue(memory.get(lesson), day) < 1;
}

/** 今日の予定に入っている、復習の論点 */
export const reviewTopics = (state: GameState): LessonId[] => [
  ...new Set(state.queue.flatMap((q) => (q.kind === "event" && q.topic && !q.guided ? [q.topic] : []))),
];

/**
 * 復習の予定（忘却曲線にもとづく間隔反復）：習った論点のうち、復習の時期が来たもの（思い出せるうちに）を、
 * 急ぎの順（間隔に対して時間がたったもの・苦手なもの）に選び、その論点の取引（なければギルドの帳簿相談）を入れる。
 * 時期の来ていない論点は出さないので、よく覚えている論点ほど間があき、忘れかけの論点に時間を使える
 */
function reviewItems(state: GameState, rand: Rand, today?: LessonId): QueueItem[] {
  const memory = memoryOf(state.practice);
  const mastery = masteryOf(state);
  const candidates = state.lessonsDone.filter((id) => id !== today && !EVERYDAY.has(id) && (REVIEW_TEMPLATES.has(id) || BANK_BY_LESSON.has(id)));
  const count = Math.min(MAX_REVIEWS, state.level);
  // 復習の時期が来た論点の上位（選ぶ数の3倍）について、今日、店の取引として起こせるかを確かめる
  const shortlist = candidates
    .map((id) => ({ id, od: overdue(memory.get(id), state.day) }))
    .filter(({ od }) => od >= 1)
    .map(({ id, od }) => ({ id, score: od + (mastery.get(id)?.stars === 1 ? 0.5 : 0) + rand() * 0.1 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count * 3);
  // 試しに組み立てるだけなので、ゲームの乱数は使わない
  const trial = ctxOf(state, () => 0.5, false);
  const ready = ([t]: [string, number]) => buildable(state, trial, t) !== null;
  // 今日の店で起こせる論点を優先し、ギルドの帳簿相談でしか出せない論点（決算整理や、今は起こせない取引）は半分の頻度にする
  const chosen = shortlist
    .map(({ id, score }) => ({ id, score: (REVIEW_TEMPLATES.get(id) ?? []).some(ready) ? score : score / 2 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
  return chosen.map(({ id: topic }) => ({ kind: "event", id: pickWeighted((REVIEW_TEMPLATES.get(topic) ?? []).filter(ready), rand) ?? "guild", topic }));
}

/** お客さん1人分の来店。習った払い方や用件のお客さんをまぜ、今日は起こせなければいつものお客さんにする */
function walkIn(options: [string, number][], rand: Rand): QueueItem {
  const id = pickWeighted(options, rand) ?? "customer";
  return id === "customer" ? ev(id) : { kind: "event", id, fallback: "customer" };
}

/** 1日のお客さんと復習の上限（1日の記帳を10件あまりにおさめる） */
const MAX_CUSTOMERS = 4;
const MAX_REVIEWS = 4;

export function planDay(state: GameState, rand: Rand): QueueItem[] {
  // 開業日は開業に必要な講義をまとめて受け、お客さんを1人だけ迎える
  if (businessDays(state) === 1) return [...LESSONS.filter((l) => l.opening).flatMap(lessonItems), ev("customer")];
  const has = (id: LessonId) => state.lessonsDone.includes(id);
  const dim = dayInMonth(state.day);
  const q: QueueItem[] = [];

  const lesson = nextLesson(state);
  if (lesson) q.push(...lessonItems(lesson));
  const willHave = (id: LessonId) => has(id) || lesson?.id === id;

  if (willHave("expenses") && dim === 1) q.push(ev("rent"));
  if (willHave("expenses") && dim === 3) q.push(ev("utility"));
  for (const [id, t] of DAILY) if (has(t.lesson)) q.push(ev(id));

  q.push(ev("bank"), ev("wholesale"));
  if (rand() < 0.5) q.push(ev("wholesale"));
  if (has("returns") && rand() < 0.3) q.push(ev("purchase-return"));

  const extras = reviewItems(state, rand, lesson?.id);
  // 店が大きくなるほど、評判が上がるほど、お客さんが増える（1日が長くなりすぎないよう、上限つき。店が育った分は1回の取引の量がふえる）
  const customers = Math.max(1, Math.min(MAX_CUSTOMERS, 1 + state.level + repTier(state.reputation).customers));
  const walkIns = WALK_INS.filter(([id]) => has(TEMPLATES[id].lesson));
  const rest = shuffle([...Array.from({ length: customers }, () => walkIn(walkIns, rand)), ...extras], rand);
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
    const reason = need(ctx, account, sumOf(tx.answer.credit, account));
    if (reason) return reason;
  }
  return undefined;
}

/**
 * 選択肢の取引を仕上げる：消費税を習ったあとは商品の売買に消費税を加え、払うお金が残高より多ければ選べない理由をつける。
 * noelTax なら、消費税の行はノエルが書き足す（省くと taxByNoel で決める）
 */
function prepareTx(state: GameState, ctx: Ctx, tx: Transaction, noelTax?: boolean): { tx: Transaction; disabled?: string } {
  // 店の帳簿に記入しない練習は、店のお金とは関係がない
  if (tx.offBooks) return { tx };
  const taxed = tx.taxable && state.lessonsDone.includes("salestax") ? withSalesTax(tx) : tx;
  const disabled = moneyShortage(ctx, taxed);
  if (taxed !== tx && (noelTax ?? taxByNoel(state))) return { tx: { ...tx, withTax: taxed }, disabled };
  return { tx: taxed, disabled };
}

/** 消費税の仕訳を自分で書く数（1日あたり）。習熟度★3なら1件、それまでは2件。残りはノエルが書き足す */
const SELF_TAX_PER_DAY = { mastered: 1, learning: 2 };

/** 今日の残りの売買で、消費税の行をノエルに任せるか（ノエルに任せる設定がオンで、今日すでに自分で決まった数を書いたあと） */
function taxByNoel(state: GameState, mastery = masteryOf(state)): boolean {
  if (!noelOn(state)) return false;
  const self = todaysRecords(state).filter((r) => !r.auto && !r.noelTax && [...r.entry.debit, ...r.entry.credit].some((l) => TAX_ACCOUNTS.has(l.account))).length;
  const limit = mastery.get("salestax")?.stars === 3 ? SELF_TAX_PER_DAY.mastered : SELF_TAX_PER_DAY.learning;
  return self >= limit;
}

const TAX_ACCOUNTS = new Set<AccountName>(["仮払消費税", "仮受消費税"]);

/** 今日の仕訳（仕訳帳の後ろから今日の分だけ見る） */
function todaysRecords(state: GameState): JournalRecord[] {
  let i = state.journal.length;
  while (i > 0 && state.journal[i - 1].day === state.day) i--;
  return state.journal.slice(i);
}

/** 帳簿に載せる取引（消費税をノエルに任せたなら、税込のほう） */
const booked = (tx: Transaction) => tx.withTax ?? tx;

/** 朝の仕入れ注文の記録に使う templateId */
const ORDER = "order";

/** 朝の画面で買う設備の templateId は "upgrade-設備" */
const UPGRADE_PREFIX = "upgrade-";

/** 取引の種類（templateId）から、その論点の講義を引く。朝の注文は商品売買、設備はそれを買えるようになる講義 */
export function lessonOfTemplate(templateId: string): LessonId | undefined {
  if (templateId === ORDER) return "trade";
  if (templateId.startsWith(UPGRADE_PREFIX)) return UPGRADES[templateId.slice(UPGRADE_PREFIX.length) as UpgradeId]?.lesson;
  // ギルドの帳簿相談は "guild-論点"
  if (templateId.startsWith(GUILD_PREFIX)) return templateId.slice(GUILD_PREFIX.length) as LessonId;
  return TEMPLATES[templateId]?.lesson;
}

/** 論点ごとの正誤を記録する（習熟度マップ・苦手ドリルのもと） */
export function logPractice(state: GameState, lesson: LessonId | undefined, ok: boolean): GameState {
  return lesson ? logPractices(state, [{ lesson, ok }]) : state;
}

/** 審査や模試の採点で、まとめて記録する */
export function logPractices(state: GameState, results: { lesson: LessonId; ok: boolean }[]): GameState {
  return { ...state, practice: [...state.practice, ...results.map((r) => ({ day: state.day, ...r }))] };
}

/** 正誤の記録がない古いセーブ向けに、記帳と苦手の記録から作り直す */
export function practiceFromHistory(state: GameState): PracticeRecord[] {
  const missed = new Set(state.mistakes.map((m) => `${m.day}:${m.templateId}`));
  const fromJournal = state.journal.flatMap((r): PracticeRecord[] => {
    const lesson = lessonOfTemplate(r.templateId);
    return lesson ? [{ day: r.day, lesson, ok: !missed.has(`${r.day}:${r.templateId}`) }] : [];
  });
  const fromExams = state.mistakes
    .filter((m) => m.templateId.startsWith("exam:"))
    .map((m): PracticeRecord => ({ day: m.day, lesson: m.templateId.slice("exam:".length) as LessonId, ok: false }));
  return [...fromJournal, ...fromExams].sort((a, b) => a.day - b.day);
}

/** 仕訳の入力を始める */
const txSession = (tx: Transaction, speaker: CharacterId, templateId: string, guided = false): TxSession => ({
  tx,
  speaker,
  templateId,
  guided,
  // 練習問題では最初のヒントを無料で見せる
  hints: guided ? 1 : 0,
  attempts: 0,
  feedback: null,
});


/** 朝の仕入れ注文の仕訳と、注文できない理由（お金が足りないなど） */
export function orderPreview(state: GameState, item: ItemId, qty: number, pay: PurchasePay): { tx: Transaction; disabled?: string } {
  return prepareTx(state, ctxOf(state, Math.random, false), purchaseTx(item, qty, pay));
}

/**
 * 朝の仕入れの記帳をノエルに任せられるか。商品売買（掛けなら掛け取引も）が習熟度★3のときだけ。
 * 苦手なうちは自分で記帳して、仕入の仕訳を体に覚えさせる
 */
export function autoOrder(state: GameState, pay: PurchasePay): boolean {
  if (!noelOn(state)) return false;
  const mastery = masteryOf(state);
  const topics: LessonId[] = [lessonOfTemplate(ORDER)!, ...(pay === "買掛金" ? (["credit"] as const) : [])];
  return topics.every((l) => mastery.get(l)?.stars === 3);
}

/** 今日、ノエルが代わりに記帳した取引（仕訳帳の後ろから今日の分だけ見る）。orders なら朝の仕入れだけ */
export const autoPostedToday = (state: GameState, orders = false) => todaysRecords(state).filter((r) => r.auto && (!orders || r.templateId === ORDER));

/** 開店前に、ガンテツへ仕入れを注文する。記帳が終わったら朝の画面に戻る（ノエルに任せていれば、そのまま朝の画面） */
export function startOrder(state: GameState, item: ItemId, qty: number, pay: PurchasePay): GameState {
  if (state.phase.kind !== "dayStart") return state;
  const { tx, disabled } = orderPreview(state, item, qty, pay);
  if (disabled) return state;
  if (autoOrder(state, pay)) return postToBooks(state, ORDER, booked(tx), "auto");
  return { ...state, phase: { kind: "journal", session: txSession(tx, "gantetsu", ORDER) } };
}

/** 朝の画面で買える設備（その講義を受けたもの、まだ買っていないもの）と、買えない理由 */
export function upgradePreview(state: GameState, id: UpgradeId, pay: UpgradePay): { tx: Transaction; disabled?: string } {
  const ctx = ctxOf(state, Math.random, false);
  const prepared = prepareTx(state, ctx, upgradeTx(id, pay));
  // 月末払いでも、払うあてのない買い物はしない
  if (pay === "未払金" && ctx.balance("普通預金") + ctx.balance("現金") < sumAmounts(prepared.tx.answer.debit)) return { ...prepared, disabled: "月末に払うお金が足りない" };
  return prepared;
}

/** 開店前に、店の設備を買う。記帳が終わったら朝の画面に戻る */
export function startUpgrade(state: GameState, id: UpgradeId, pay: UpgradePay): GameState {
  if (state.phase.kind !== "dayStart" || hasUpgrade(state, id) || !state.lessonsDone.includes(UPGRADES[id].lesson)) return state;
  const { tx, disabled } = upgradePreview(state, id, pay);
  if (disabled) return state;
  return { ...state, phase: { kind: "journal", session: txSession(tx, "gantetsu", UPGRADE_PREFIX + id) } };
}

/** 正解の画面の次へ。朝の注文・設備なら朝の画面に戻り、それ以外は今日の予定を進める */
export function afterResult(state: GameState, rand: Rand): GameState {
  const morning = (id: string) => id === ORDER || id.startsWith(UPGRADE_PREFIX);
  if (state.phase.kind === "result" && morning(state.phase.info.templateId)) return { ...state, phase: { kind: "dayStart" } };
  return advance(state, rand);
}

/** ノエルに記帳を任せられるか（給料の講義でノエルを雇ったあと） */
export const canAutoPost = (state: GameState) => state.lessonsDone.includes("payroll");

/** ノエルに任せる設定がオンで、任せられる時期か */
const noelOn = (state: GameState) => state.autoPost && canAutoPost(state);

/** ノエルが記帳するのは、習熟度★3の論点の決まった後始末（選べる仕訳が1つだけのもの） */
function autoPostTx(templateId: string, choices: Choice[], mastery: Map<LessonId, Mastery>): Transaction | undefined {
  const t = TEMPLATES[templateId];
  if (!t?.routine || mastery.get(t.lesson)?.stars !== 3) return undefined;
  const ready = choices.filter((c) => c.tx && !c.disabled);
  return ready.length === 1 ? ready[0].tx : undefined;
}

/** キューから次の講義・イベントを取り出す。空になったら一日の終わり */
export function advance(state: GameState, rand: Rand): GameState {
  let cur = state;
  const queue = [...state.queue];
  let ctx = ctxOf(cur, rand, false);
  // ノエルに任せているときだけ、習熟度を調べる
  const mastery = noelOn(cur) ? masteryOf(cur) : undefined;
  let memory: Map<LessonId, Memory> | undefined;
  while (queue.length > 0) {
    const head = queue.shift()!;
    if (head.kind === "lesson") {
      if (cur.lessonsDone.includes(head.id)) continue;
      return { ...cur, queue, phase: { kind: "lesson", lesson: head.id, page: 0 } };
    }
    if (head.kind === "worksheet") return { ...cur, queue, phase: { kind: "worksheet", answered: [null, null] } };
    if (head.kind === "report") return { ...cur, queue, phase: { kind: "report" } };
    const { id, topic, fallback } = head;
    const guided = !!head.guided;
    /** その取引を組み立てる。取引がない・講義をまだ受けていない・一度きりでもう済んだ・今日は起こせない、なら null */
    const tryBuild = (tid: string) => buildable(cur, { ...ctx, guided, topic }, tid);
    let built = tryBuild(id);
    let templateId = id === "guild" ? guildId(topic) : id;
    if (!built && fallback) {
      built = tryBuild(fallback);
      templateId = fallback;
    }
    // 復習で選んだ取引が今日は起こせないときは、同じ論点のギルドの帳簿相談にする
    if (!built && topic && id !== "guild") {
      built = tryBuild("guild");
      templateId = guildId(topic);
    }
    if (!built) continue;
    // 講義の練習では、仕訳をしない選択肢（断るなど）を出さない
    let choices = guided ? built.choices.filter((c) => c.tx) : [...built.choices];
    // 講義の練習・復習では消費税も自分で書く。消費税をノエルに任せるかは、この取引で一度だけ決める
    const taxed = cur.lessonsDone.includes("salestax") && choices.some((c) => c.tx?.taxable);
    const noelTax = !guided && !topic && !!mastery && taxed && taxByNoel(cur, mastery);
    // 復習の時期が来ていない得意な論点は、選択肢を選ぶだけで、記帳はノエルに任せる（消費税を自分で書く分が残っていれば自分で）
    const noel =
      !guided && !topic && !!mastery && settled(lessonOfTemplate(templateId), cur.day, memory ??= memoryOf(cur.practice), mastery) && (noelTax || !taxed);
    choices = choices.map((c) => {
      if (!c.tx) return c;
      const { tx, disabled } = prepareTx(cur, ctx, c.tx, noelTax);
      return { ...c, tx, disabled: c.disabled ?? disabled };
    });
    // 慣れた後始末はノエルが記帳して、次の取引へ進む（閉店時に一覧で見せる）。復習として出した取引は自分で記帳する
    const auto = mastery && !guided && !topic ? autoPostTx(templateId, choices, mastery) : undefined;
    if (auto) {
      cur = postToBooks(cur, templateId, booked(auto), "auto");
      ctx = ctxOf(cur, rand, false);
      continue;
    }
    if (choices.every((c) => c.disabled)) {
      choices.push({
        label: "今は見送る（お金が足りない）",
        reply: "ホーホー「お金が足りんときは、銀行で引き出すか、商品を売って現金を作るのじゃ」",
        effect: { reputation: -1 },
      });
    }
    return { ...cur, queue, phase: { kind: "event", event: { ...built, choices, templateId, guided, ...(noel && { noel }) } } };
  }
  return { ...cur, queue, phase: { kind: "dayEnd" } };
}

/** 講義の早送り：確認問題に正解したら、講義を受けたことにする */
export function skipLesson(state: GameState): GameState {
  if (state.phase.kind !== "lesson") return state;
  return completeLesson(logPractice(state, state.phase.lesson, true));
}

/** 講義を修了する（最後のページまで読んだとき・早送りしたとき） */
function completeLesson(state: GameState): GameState {
  if (state.phase.kind !== "lesson") return state;
  const { lesson, returnTo } = state.phase;
  return {
    ...state,
    lessonsDone: state.lessonsDone.includes(lesson) ? state.lessonsDone : [...state.lessonsDone, lesson],
    phase: { kind: "lessonDone", lesson, returnTo },
  };
}

export function turnLessonPage(state: GameState, delta: number): GameState {
  if (state.phase.kind !== "lesson") return state;
  const lesson = LESSON_BY_ID[state.phase.lesson];
  const page = state.phase.page + delta;
  if (page < 0) return state;
  if (page >= lesson.pages.length) return completeLesson(state);
  return { ...state, phase: { ...state.phase, page } };
}

function applyEffect(state: GameState, effect: Effect | undefined): GameState {
  if (!effect) return state;
  let next = { ...state };
  if (effect.stock) {
    const stock = { ...next.stock };
    const stockValue = { ...next.stockValue };
    for (const id of ITEM_IDS) {
      const d = effect.stock[id] ?? 0;
      if (d === 0) continue;
      // 原価がわからない増減（売上・売上の返品）は、今の平均単価で計算する（移動平均法）
      const average = stock[id] > 0 ? stockValue[id] / stock[id] : ITEMS[id].cost;
      const cost = effect.stockCost?.[id] ?? Math.round(average * Math.abs(d));
      stock[id] = Math.max(0, stock[id] + d);
      stockValue[id] = stock[id] === 0 ? 0 : Math.max(0, stockValue[id] + Math.sign(d) * cost);
    }
    next.stock = stock;
    next.stockValue = stockValue;
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
  if (effect.upgrade && !next.upgrades.includes(effect.upgrade)) next.upgrades = [...next.upgrades, effect.upgrade];
  if (effect.reward !== undefined) next.reward = effect.reward;
  if (effect.festival !== undefined) next.festival = effect.festival;
  if (effect.cashDiff !== undefined) next.cashDiff = effect.cashDiff;
  return next;
}

export function choose(state: GameState, index: number, rand: Rand): GameState {
  if (state.phase.kind !== "event") return state;
  const event = state.phase.event;
  const choice: Choice | undefined = event.choices[index];
  if (!choice || choice.disabled) return state;
  // 得意な論点は、選んだ取引をノエルが記帳する（仕訳は見せる）
  if (choice.tx && event.noel && !choice.tx.offBooks) {
    const tx = booked(choice.tx);
    const posted = postToBooks(state, event.templateId, tx, "auto");
    return { ...posted, phase: { kind: "reply", speaker: "noel", text: "ノエル「記帳しておきました！」", entry: tx.answer } };
  }
  if (choice.tx) {
    return { ...state, phase: { kind: "journal", session: txSession(choice.tx, event.speaker, event.templateId, !!event.guided) } };
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

export function submitEntry(state: GameState, input: Entry, rand: Rand = Math.random): GameState {
  if (state.phase.kind !== "journal") return state;
  const s = state.phase.session;
  const d = diagnose(input, s.tx.answer);
  if (!d.ok) {
    // 書きかけ（空欄・金額なし）は注意だけ。ミスとして数えない
    if (d.kind === "incomplete") {
      return { ...state, phase: { kind: "journal", session: { ...s, feedback: d.messages } } };
    }
    const firstMiss = s.attempts === 0;
    const logged = firstMiss ? logPractice(state, lessonOfTemplate(s.templateId), false) : state;
    return {
      ...logged,
      combo: 0,
      mistakes: firstMiss ? [...state.mistakes, { day: state.day, templateId: s.templateId, exam: s.tx.exam }] : state.mistakes,
      phase: { kind: "journal", session: { ...s, attempts: s.attempts + 1, feedback: d.messages } },
    };
  }

  const paidHints = s.guided ? Math.max(0, s.hints - 1) : s.hints;
  const firstTry = s.attempts === 0 && paidHints === 0;
  // 講義の練習は信用に数えない
  const trust = s.guided ? state.trust : trustAfter(state.trust, firstTry);
  const trustDelta = trust - state.trust;
  const combo = firstTry ? state.combo + 1 : 0;
  const comboMessage = COMBO_MESSAGES[combo];
  const comboRep = combo === 5 ? 3 : combo === 10 ? 5 : 0;

  let next: GameState = {
    ...state,
    trust,
    combo,
    bestCombo: Math.max(state.bestCombo, combo),
    reputation: clamp(state.reputation + comboRep),
    today: {
      ...state.today,
      correct: state.today.correct + 1,
      firstTry: state.today.firstTry + (firstTry ? 1 : 0),
      bestCombo: Math.max(state.today.bestCombo, combo),
    },
  };
  // ギルドの帳簿相談などの練習は、店の帳簿には記入しない
  if (!s.tx.offBooks) next = postToBooks(next, s.templateId, booked(s.tx), s.tx.withTax && "noelTax");
  // 最初の答えで合っていたかを記録する（ヒントを使ったら「合っていた」には数えない）
  if (s.attempts === 0) next = logPractice(next, lessonOfTemplate(s.templateId), firstTry);
  // ノーヒント正解のとき、ときどきレアアイテムが見つかる（連続正解が多いほど見つかりやすい）
  const found = firstTry && !s.guided && rand() < dropRate(combo) ? pickTreasure(rand).id : undefined;
  if (found) next = { ...next, treasures: { ...next.treasures, [found]: (next.treasures[found] ?? 0) + 1 } };
  const info: ResultInfo = { tx: s.tx, templateId: s.templateId, firstTry, trustDelta, combo, comboMessage, ...(found && { treasure: found }) };
  return { ...next, phase: { kind: "result", info, speaker: s.speaker } };
}

/** 店の帳簿に記入する：仕訳帳に載せ、今日の売上・仕入に足し、在庫やツケなどの効果を反映する */
function postToBooks(state: GameState, templateId: string, tx: Transaction, mark?: "auto" | "noelTax"): GameState {
  const sales = sumAmounts(tx.answer.credit.filter((l) => l.account === "売上"));
  const purchases = sumAmounts(tx.answer.debit.filter((l) => l.account === "仕入"));
  const posted: GameState = {
    ...state,
    journal: [...state.journal, { day: state.day, templateId, exam: tx.exam, entry: tx.answer, ...(mark && { [mark]: true as const }) }],
    today: { ...state.today, sales: state.today.sales + sales, purchases: state.today.purchases + purchases },
  };
  return applyEffect(posted, tx.effect);
}

export function isMonthEnd(state: GameState): boolean {
  return dayInMonth(state.day) === DAYS_PER_MONTH;
}

/** 次のLvへの昇格条件と、昇格審査の形式（朝の画面の目標表示と共通） */
export const LEVEL_UP: Record<number, { days: number; sales: number; trust: number; questions: number; minutes: number; requires?: LessonId[] }> = {
  1: { days: 4, sales: 50000, trust: 55, questions: 4, minutes: 12 },
  2: { days: 12, sales: 250000, trust: 60, questions: 5, minutes: 15 },
  3: { days: 22, sales: 600000, trust: 65, questions: 5, minutes: 15 },
  // Lv5 は、最初の決算（開業から30営業日目の3月末）を終えてから
  4: { days: 31, sales: 1500000, trust: 70, questions: 6, minutes: 18, requires: ["closing"] },
};

export const EXAM_PASS = 70;

/** 開業してから何営業日目か（開業日が1） */
export const businessDays = (state: GameState) => state.day - state.openDay + 1;

/** 今のLvの講義をすべて受け、売上累計と帳簿の信用が十分なら昇格審査を受けられる */
export function canLevelUp(state: GameState): boolean {
  const goal = LEVEL_UP[state.level];
  if (!goal) return false;
  const lessonsDone = [...lessonsForLevel(state.level).map((l) => l.id), ...(goal.requires ?? [])].every((id) => state.lessonsDone.includes(id));
  return lessonsDone && businessDays(state) >= goal.days && totalSales(state) >= goal.sales && state.trust >= goal.trust;
}

export function closeDay(state: GameState, rand: Rand = Math.random): GameState {
  // 決算日を終えたら新しい年度へ。初日はまず再振替仕訳から
  if (state.closingFrom !== null) {
    const next = startDay({ ...state, closingFrom: null, day: state.day + 1, today: emptyDay(), reputation: repAfterDay(state) }, rand);
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
  // 月が変わったら、月の依頼書を判定して新しく出す
  const rolled = rollRequests(state);
  const planned = { ...rolled, queue: planDay(rolled, rand) };
  if (canLevelUp(planned) && planned.day >= planned.examRetryDay) return { ...planned, phase: { kind: "exam", exam: makeExam(planned, rand) } };
  return { ...planned, phase: { kind: "dayStart" } };
}

export function nextDay(state: GameState, rand: Rand = Math.random): GameState {
  if (isYearEnd(state.day) && state.closingFrom === null) return startClosing(state);
  return startDay({ ...state, day: state.day + 1, today: emptyDay(), reputation: repAfterDay(state) }, rand);
}

/** 間違えた審査・模試の問題を、苦手として記録する形にする */
const examMistakes = (state: GameState, questions: ExamQuestion[], graded: boolean[]) =>
  questions.filter((_, i) => !graded[i]).map((q) => ({ day: state.day, templateId: `exam:${q.lesson}`, exam: q.text }));

/** 習った論点の問題から n 問。なるべく論点が重ならないようにし、newestFirst なら新しく習った論点を優先する */
export function pickQuestions(state: GameState, n: number, rand: Rand, newestFirst = true): ExamQuestion[] {
  const learned = new Set(state.lessonsDone);
  const shuffled = shuffle(
    EXAM_BANK.filter((q) => learned.has(q.lesson)),
    rand,
  );
  const pool = newestFirst ? shuffled.sort((a, b) => LESSON_BY_ID[b.lesson].level - LESSON_BY_ID[a.lesson].level) : shuffled;
  // 同じ論点の2問目以降は後回しにする
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
  return [...firsts, ...repeats].slice(0, n);
}

/** これまでに習った論点から、なるべく論点が重ならないように出題する（今のLvの論点を優先） */
export function makeExam(state: GameState, rand: Rand): ExamSession {
  const goal = LEVEL_UP[state.level];
  const questions = pickQuestions(state, goal.questions, rand);
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
  const { graded, state: next } = gradeQuestions(state, state.phase.exam.questions, state.phase.exam.answers);
  return updateExam(next, (x) => ({ ...x, graded }));
}

/** 仕訳問題を採点し、正誤を記録して、間違えた問題を苦手に加える（昇格審査と模試の第1問） */
export function gradeQuestions(state: GameState, questions: ExamQuestion[], answers: (Entry | null)[]): { graded: boolean[]; state: GameState } {
  const graded = questions.map((q, i) => {
    const a = answers[i];
    return !!a && sameEntry(a, q.answer);
  });
  const logged = logPractices(state, questions.map((q, i) => ({ lesson: q.lesson, ok: graded[i] })));
  return { graded, state: { ...logged, mistakes: [...state.mistakes, ...examMistakes(state, questions, graded)] } };
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
  return { ...state, trust: trustAfter(state.trust, correct), phase: { ...p, answered } };
}

/** 店の内装を変える（解禁したものだけ） */
export const setDecor = (state: GameState, id: DecorId): GameState => (DECORS[id].unlocked(state) ? { ...state, decor: id } : state);

/** 慣れた決済をノエルに任せるかを切り替える */
export const toggleAutoPost = (state: GameState): GameState => ({ ...state, autoPost: !state.autoPost });
