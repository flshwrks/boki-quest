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
  | "dividends";

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

export interface Effect {
  stock?: Partial<Record<ItemId, number>>;
  reputation?: number;
  addCredits?: Omit<Credit, "id" | "day">[];
  settleCredits?: { id: string; amount: number }[];
  quest?: Quest | null;
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
}

export interface JournalRecord {
  day: number;
  templateId: string;
  exam: string;
  entry: Entry;
}

export interface Mistake {
  day: number;
  templateId: string;
  exam: string;
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
  firstTry: boolean;
  trustDelta: number;
  combo: number;
  comboMessage?: string;
}

export type Phase =
  | { kind: "dayStart" }
  | { kind: "lesson"; lesson: LessonId; page: number }
  | { kind: "lessonDone"; lesson: LessonId }
  | { kind: "event"; event: GameEvent }
  | { kind: "reply"; speaker: CharacterId; text: string }
  | { kind: "journal"; session: TxSession }
  | { kind: "result"; info: ResultInfo; speaker: CharacterId }
  | { kind: "dayEnd" }
  | { kind: "monthEnd"; answered: (boolean | null)[] }
  | { kind: "exam"; exam: ExamSession }
  | { kind: "worksheet"; answered: (boolean | null)[] }
  | { kind: "report" }
  | { kind: "levelUp"; level: number };

export interface ExamQuestion {
  text: string;
  answer: Entry;
  lesson: LessonId;
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
  | { kind: "event"; id: string; guided?: boolean }
  // 決算日の最後に見る精算表と財務諸表
  | { kind: "worksheet" }
  | { kind: "report" };

export interface GameState {
  version: 2;
  shopName: string;
  level: number;
  day: number;
  trust: number;
  reputation: number;
  combo: number;
  stock: Record<ItemId, number>;
  journal: JournalRecord[];
  lessonsDone: LessonId[];
  queue: QueueItem[];
  credits: Credit[];
  creditSeq: number;
  quest: Quest | null;
  cashDiff: { amount: number; day: number } | null;
  mistakes: Mistake[];
  /** 昇格審査に落ちたとき、次に受けられる日 */
  examRetryDay: number;
  /** 決算日の間だけ、決算整理を始めた時点の仕訳の件数（精算表の「修正記入」をここから数える） */
  closingFrom: number | null;
  today: DayStats;
  phase: Phase;
}
