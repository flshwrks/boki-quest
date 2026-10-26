import type { Entry } from "@/engine/journal";

export type ItemId = "potion" | "herb" | "antidote" | "scroll";

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
  | "luke";

export type LessonId =
  | "basics"
  | "founding"
  | "trade"
  | "expenses"
  | "credit"
  | "returns"
  | "advances"
  | "charges"
  | "cashdiff";

/** 掛け取引の相手ごとの未決済残高（ゲーム進行用。金額は帳簿の売掛金・買掛金と一致させる） */
export interface Credit {
  id: string;
  kind: "売掛金" | "買掛金";
  who: CharacterId;
  amount: number;
  item?: ItemId;
  qty?: number;
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
  | { kind: "levelUp"; level: number };

export interface DayStats {
  sales: number;
  purchases: number;
  correct: number;
  firstTry: number;
  bestCombo: number;
}

export interface GameState {
  version: 1;
  shopName: string;
  level: number;
  day: number;
  trust: number;
  reputation: number;
  combo: number;
  stock: Record<ItemId, number>;
  journal: JournalRecord[];
  lessonsDone: LessonId[];
  queue: string[];
  credits: Credit[];
  creditSeq: number;
  quest: Quest | null;
  cashDiff: { amount: number; day: number } | null;
  mistakes: Mistake[];
  today: DayStats;
  phase: Phase;
}
