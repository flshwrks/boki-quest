import type { UpgradeId } from "@/content/upgrades";
import type { Entry } from "@/engine/journal";

export type ItemId = "potion" | "herb" | "antidote" | "scroll" | "ether" | "elixir";

export type CharacterId =
  | "hoho"
  | "cecil"
  | "gantetsu"
  | "allen"
  | "mina"
  | "gord"
  | "lily"
  | "pipi"
  | "rose"
  | "luke"
  | "noel";

export type LessonId =
  | "basics"
  | "founding"
  | "trade"
  | "expenses"
  | "credit"
  | "returns"
  | "advances"
  | "charges"
  | "cashdiff"
  | "notes"
  | "erecords"
  | "creditcard"
  | "giftcert"
  | "payables"
  | "pettycash"
  | "deposit"
  | "loans"
  | "fixedassets"
  | "payroll"
  | "suspense"
  | "kessan"
  | "allowance"
  | "depreciation"
  | "accruals"
  | "closing"
  | "salestax"
  | "interimtax"
  | "dividends"
  // 出題範囲を網羅するために追加した講義
  | "taxes"
  | "voucher"
  | "deposits"
  | "notesloan"
  | "fixedsale"
  | "rentals"
  | "advanced"
  // 試験対策（模擬試験の第2問で使う）
  | "ledgerclose"
  | "subbooks"
  | "inventorybook"
  | "slips";

/** 証ひょう（請求書・領収書など）。仕訳のもとになる書類 */
export interface Voucher {
  /** 書類の名前（「納品書兼請求書」「領収書」など） */
  title: string;
  /** 宛名・発行者・日付など、表の上に書く行 */
  lines: string[];
  head: string[];
  rows: string[][];
  /** 合計や支払期限など、表の下に書く行 */
  notes: string[];
}

/** 相手ごとに追跡する債権・債務の科目。合計は帳簿の残高と一致させる（通しプレイのテストで検証） */
export const CREDIT_KINDS = [
  "売掛金",
  "買掛金",
  "受取手形",
  "支払手形",
  "電子記録債権",
  "電子記録債務",
  "クレジット売掛金",
  "受取商品券",
  "未払金",
  "借入金",
  "手形借入金",
  "貸付金",
  "立替金",
  "所得税預り金",
  "社会保険料預り金",
  "仮払金",
  "仮受金",
] as const;
export type CreditKind = (typeof CREDIT_KINDS)[number];

/** 相手ごとの未決済残高（ゲーム進行用） */
export interface Credit {
  id: string;
  kind: CreditKind;
  who: CharacterId;
  amount: number;
  item?: ItemId;
  qty?: number;
  /** 掛けで仕入れた商品の仕入単価（特価で仕入れた分を返品するときに使う） */
  unit?: number;
  /** 借入金・貸付金の年利と期間（月）。返済のときに利息を計算する */
  rate?: number;
  months?: number;
  /** 仮受金が、どの売掛金の入金と思われるか（その売掛金はほかの取引で使わない） */
  against?: string;
  /** 消費税込みの金額で発生した債権・債務（返品のときに消費税も取り消す） */
  taxed?: boolean;
  day: number;
}

/** 前払金・前受金を体験する「特注の杖」クエスト */
export interface Quest {
  stage: "ordered" | "advanced" | "received";
  day: number;
}

/** 月の依頼書の目標：今月の売上・苦手な論点を★3に・今月の正答率 */
export interface GuildRequest {
  kind: "sales" | "mastery" | "clean";
  target: number;
  lesson?: LessonId;
}

/** 収穫祭の予約注文（月はじめに手付金を受け取り、4日目以降に納品する） */
export interface Festival {
  item: ItemId;
  qty: number;
  price: number;
  deposit: number;
}

export interface Effect {
  stock?: Partial<Record<ItemId, number>>;
  /** 在庫の増減にともなう原価（仕入なら運び賃を含む仕入値、仕入の返品なら返品額）。省くと平均単価で計算する */
  stockCost?: Partial<Record<ItemId, number>>;
  reputation?: number;
  addCredits?: Omit<Credit, "id" | "day">[];
  settleCredits?: { id: string; amount: number }[];
  quest?: Quest | null;
  /** 店の設備を買った */
  upgrade?: UpgradeId;
  /** 月の依頼書の報奨金を受け取った（null） */
  reward?: null;
  /** 収穫祭の予約を受けた／納品した（null） */
  festival?: Festival | null;
  /** 正なら現金不足、負なら現金過剰。null で解消 */
  cashDiff?: { amount: number; day: number } | null;
}

export interface Transaction {
  /** ゲーム世界で起きたこと */
  story: string;
  /** 試験での言い回し */
  exam: string;
  answer: Entry;
  /** 最初のヒント（考え方の糸口） */
  idea: string;
  /** 正解後に師匠が添える補足 */
  note?: string;
  /** 商品の売買（返品を含む）。消費税を習ったあとは、税抜方式の消費税を自動で加える */
  taxable?: boolean;
  /** 仕訳のもとになる書類（証ひょう） */
  doc?: Voucher;
  /** 店の帳簿には記入しない練習の仕訳（ギルドの帳簿相談） */
  offBooks?: boolean;
  /** 消費税をノエルに任せるとき、帳簿に載せる税込の取引（プレイヤーは税抜の answer で答える） */
  withTax?: Transaction;
  effect?: Effect;
}

export interface Choice {
  label: string;
  tx?: Transaction;
  /** 仕訳がない選択肢の結果 */
  effect?: Effect;
  reply?: string;
  /** 選べない理由（現金不足など） */
  disabled?: string;
}

export interface GameEvent {
  templateId: string;
  speaker: CharacterId;
  lines: string[];
  choices: Choice[];
  guided?: boolean;
  /** 得意な論点なので、選んだ取引はノエルが記帳する */
  noel?: true;
}

export interface JournalRecord {
  day: number;
  templateId: string;
  exam: string;
  entry: Entry;
  /** 見習いのノエルが代わりに記帳した取引 */
  auto?: true;
  /** 税抜で記帳し、消費税の行はノエルが書き足した取引 */
  noelTax?: true;
}

export interface Mistake {
  day: number;
  templateId: string;
  exam: string;
  /** 苦手ドリルで正解したら克服済み */
  resolved?: boolean;
}

/** 論点ごとの正誤の記録（習熟度マップのもと）。最初の答えが合っていたかを1件ずつ残す */
export interface PracticeRecord {
  day: number;
  lesson: LessonId;
  ok: boolean;
}

export interface TxSession {
  tx: Transaction;
  speaker: CharacterId;
  templateId: string;
  guided: boolean;
  attempts: number;
  hints: number;
  feedback: string[] | null;
}

export interface ResultInfo {
  tx: Transaction;
  templateId: string;
  firstTry: boolean;
  trustDelta: number;
  combo: number;
  comboMessage?: string;
}

export type Phase =
  | { kind: "dayStart" }
  // returnTo：試験対策の画面から開いた講義は、終わったらそこへ戻る
  | { kind: "lesson"; lesson: LessonId; page: number; returnTo?: "training" }
  | { kind: "lessonDone"; lesson: LessonId; returnTo?: "training" }
  | { kind: "event"; event: GameEvent }
  | { kind: "reply"; speaker: CharacterId; text: string; /** ノエルが記帳した仕訳（見せるだけ） */ entry?: Entry }
  | { kind: "journal"; session: TxSession }
  | { kind: "result"; info: ResultInfo; speaker: CharacterId }
  | { kind: "dayEnd" }
  | { kind: "monthEnd"; answered: (boolean | null)[] }
  | { kind: "exam"; exam: ExamSession }
  | { kind: "worksheet"; answered: (boolean | null)[] }
  | { kind: "report" }
  | { kind: "levelUp"; level: number }
  // 試験対策（朝の画面から入り、終わったら朝に戻る）
  | { kind: "training" }
  | { kind: "drill"; drill: DrillSession }
  | { kind: "mock"; mock: MockSession };

/** 苦手ドリル。1問ずつ答え合わせする */
export interface DrillSession {
  /** 論点を選んで始めたときの論点。おまかせなら null */
  lesson: LessonId | null;
  questions: ExamQuestion[];
  index: number;
  /** 答え合わせした問題の正誤 */
  results: (boolean | null)[];
  answer: Entry | null;
}

/** 模擬試験の穴埋め問題（第2問・第3問）。表の一部が空欄になっている */
export type FillCell = string | { blank: number; prefix?: string };

export interface FillTable {
  title?: string;
  head?: string[];
  rows: FillCell[][];
}

export interface FillBlank {
  /** amount：金額を入力／select：選択肢から1つ／multi：あてはまるものをすべて */
  kind: "amount" | "select" | "multi";
  options?: string[];
  answer: number | string | string[];
  points: number;
}

export type FillAnswer = string | string[] | null;

export interface FillProblem {
  title: string;
  /** 問題番号のボタンに出す短い名前 */
  short: string;
  /** どの論点の練習として記録するか */
  lesson: LessonId;
  lead: string[];
  /** 決算整理事項などの番号つきの一覧 */
  items?: string[];
  /** items の見出し（省くと「決算整理事項」） */
  itemsTitle?: string;
  /** 問題として与える表（決算整理前残高試算表など） */
  given?: FillTable[];
  /** 答案用紙 */
  sheet: FillTable[];
  blanks: FillBlank[];
}

/** 模擬試験。第1問は仕訳15問（各3点）、第2問・第3問は穴埋め */
export interface MockSession {
  questions: ExamQuestion[];
  answers: (Entry | null)[];
  problems: FillProblem[];
  fills: FillAnswer[][];
  startedAt: number | null;
  minutes: number;
  /** 採点後に入る。第1問の各問、穴埋めの各空欄の正誤 */
  graded: { questions: boolean[]; fills: boolean[][] } | null;
}

export interface MockResult {
  day: number;
  score: number;
  /** 第1問・第2問・第3問の得点 */
  parts: number[];
}

export interface ExamQuestion {
  text: string;
  answer: Entry;
  lesson: LessonId;
  /** 証ひょうを見て仕訳する問題 */
  doc?: Voucher;
}

/** 昇格審査。本番CBTと同じく、問題を行き来して最後にまとめて採点する */
export interface ExamSession {
  toLevel: number;
  questions: ExamQuestion[];
  answers: (Entry | null)[];
  /** 試験開始の時刻（ミリ秒）。案内を読んでいる間は null。再読み込みしても残り時間が続くように保存する */
  startedAt: number | null;
  minutes: number;
  /** 採点後に入る。各問の正誤 */
  graded: boolean[] | null;
}

export interface DayStats {
  sales: number;
  purchases: number;
  correct: number;
  firstTry: number;
  bestCombo: number;
}

/** 一日の予定。講義か取引イベントのどちらか */
export type QueueItem =
  | { kind: "lesson"; id: LessonId }
  // topic：復習のために入れた論点。その取引が起こせなければ、同じ論点のギルドの帳簿相談にする
  // fallback：その取引が今日は起こせないときに代わりに出す取引（お客さんの来店なら、いつものお客さん）
  | { kind: "event"; id: string; guided?: boolean; topic?: LessonId; fallback?: string }
  // 決算日の最後に見る精算表と財務諸表
  | { kind: "worksheet" }
  | { kind: "report" };

export interface GameState {
  version: 2;
  shopName: string;
  level: number;
  day: number;
  /** 開業した日（営業日数はここから数える） */
  openDay: number;
  trust: number;
  reputation: number;
  combo: number;
  stock: Record<ItemId, number>;
  /** 在庫の原価の合計（移動平均で管理する。決算の棚卸高に使う） */
  stockValue: Record<ItemId, number>;
  journal: JournalRecord[];
  lessonsDone: LessonId[];
  queue: QueueItem[];
  credits: Credit[];
  creditSeq: number;
  quest: Quest | null;
  /** 買った店の設備 */
  upgrades: UpgradeId[];
  /** 今月の依頼書（start は月の初日） */
  requests: { start: number; goals: GuildRequest[] } | null;
  /** 先月の依頼書の報奨金（翌月はじめに振り込まれる） */
  reward: { amount: number; count: number } | null;
  /** 収穫祭の予約 */
  festival: Festival | null;
  cashDiff: { amount: number; day: number } | null;
  mistakes: Mistake[];
  /** 昇格審査に落ちたとき、次に受けられる日 */
  examRetryDay: number;
  /** 獲得した実績のID */
  achievements: string[];
  /** ノーヒント連続正解の最高記録 */
  bestCombo: number;
  /** 論点ごとの正誤の記録 */
  practice: PracticeRecord[];
  /** 模擬試験の成績 */
  mocks: MockResult[];
  /** 慣れた決済（習熟度★3の論点の後始末）を、見習いのノエルに記帳してもらう */
  autoPost: boolean;
  /** 決算日の間だけ、決算整理を始めた時点の仕訳の件数（精算表の「修正記入」をここから数える） */
  closingFrom: number | null;
  today: DayStats;
  phase: Phase;
}
