import { DAYS_PER_MONTH, DAYS_PER_YEAR, ITEMS, OPEN_DAY, perItem } from "@/content/world";
import { initialState, practiceFromHistory } from "./logic";
import type { GameState, LessonId, QueueItem } from "./types";

type Saved = Record<string, unknown> & { version: number };

/** 形の変わった版ごとの移行。古い版から順に当てていく */
const MIGRATIONS: Record<number, (s: Saved) => Saved> = {
  // v1 の予定は "lesson:id" / "!id"（練習） / "id" の文字列だった
  1: (s) => ({
    ...s,
    version: 2,
    queue: (s.queue as string[]).map(
      (q): QueueItem =>
        q.startsWith("lesson:")
          ? { kind: "lesson", id: q.slice(7) as LessonId }
          : { kind: "event", id: q.replace(/^!/, ""), guided: q.startsWith("!") },
    ),
  }),
};

/** 古い形式のセーブを今の形式に直し、後から増えた項目は初期値で補う */
function migrate(raw: Saved): GameState | null {
  let s = raw;
  while (MIGRATIONS[s.version]) s = MIGRATIONS[s.version](s);
  if (s.version !== 2) return null;
  const saved = s as unknown as GameState;
  const shifted = saved.openDay === undefined ? shortenFirstYear(saved) : saved;
  const base = initialState(saved.shopName);
  const stock = { ...base.stock, ...shifted.stock };
  // 在庫の原価は後から増えた項目。古いセーブでは、いつもの仕入値で数え直す
  const stockValue = shifted.stockValue ?? perItem((id) => stock[id] * ITEMS[id].cost);
  const merged = { ...base, ...shifted, stock, stockValue };
  // 正誤の記録は後から増えた項目。古いセーブでは、これまでの記帳から作り直す
  return shifted.practice ? merged : { ...merged, practice: practiceFromHistory(merged) };
}

/**
 * 最初の年度を短くする前のセーブ（開業日が4月1日）。最初の決算をまだ迎えていなければ、
 * 決算までの残りが数日になるよう、日付をすべて同じだけ進める（月の何日目かは変えない）。
 * 取引の順番・ツケや借入の期日までの日数・帳簿の残高は変わらない
 */
function shortenFirstYear(saved: GameState): GameState {
  // 決算の月（3月）に入っていたら、もうずらさない（決算を終えたセーブもここに入る）
  const room = DAYS_PER_YEAR - DAYS_PER_MONTH - saved.day;
  const by = Math.max(0, Math.min(OPEN_DAY - 1, Math.floor(room / DAYS_PER_MONTH) * DAYS_PER_MONTH));
  const at = <T extends { day: number }>(x: T): T => ({ ...x, day: x.day + by });
  return {
    ...saved,
    day: saved.day + by,
    openDay: 1 + by,
    examRetryDay: saved.examRetryDay + by,
    journal: saved.journal.map(at),
    credits: saved.credits.map(at),
    mistakes: saved.mistakes.map(at),
    // 正誤の記録・模試の成績がない古いセーブは、ないまま（あとで記帳の記録から作り直す）
    practice: saved.practice?.map(at),
    mocks: saved.mocks?.map(at),
    quest: saved.quest && at(saved.quest),
    cashDiff: saved.cashDiff && at(saved.cashDiff),
  };
}

// ───────── 端末内の保存 ─────────

/** localStorage の読み書き。使えない環境（プライベートモード等）でも、ゲームは止めずに続ける */
export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 保存できなくても、この画面を開いている間は遊べる
  }
}

function storageRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // 同上
  }
}

// キー名は最初の版のまま（変えると既存のセーブが読めなくなる）
const KEY = "boki-quest-save-v1";
const SAVED_AT_KEY = "boki-quest-saved-at";
const PASSCODE_KEY = "boki-quest-passcode";

export interface LocalSave {
  state: GameState;
  savedAt: number;
}

function parse(raw: string | null): GameState | null {
  try {
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function loadGame(): LocalSave | null {
  const state = parse(storageGet(KEY));
  return state ? { state, savedAt: Number(storageGet(SAVED_AT_KEY)) || 0 } : null;
}

/** 端末に保存し、保存した時刻を返す（クラウドと新しさを比べるのに使う） */
export function saveGame(state: GameState): number {
  const savedAt = Date.now();
  storageSet(KEY, JSON.stringify(state));
  storageSet(SAVED_AT_KEY, String(savedAt));
  return savedAt;
}

export function clearGame() {
  storageRemove(KEY);
  storageRemove(SAVED_AT_KEY);
}

// ───────── クラウド保存（合言葉を知っている本人だけが使える） ─────────

export const getPasscode = () => storageGet(PASSCODE_KEY) ?? "";
export const setPasscode = (passcode: string) => storageSet(PASSCODE_KEY, passcode);

/** セーブを gzip で圧縮して文字列にする（日本語の多い仕訳帳が数分の1になる） */
async function pack(state: GameState): Promise<string> {
  const stream = new Blob([JSON.stringify(state)]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function unpack(data: string): Promise<GameState | null> {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return parse(await new Response(stream).text());
}

export type CloudSyncStatus = "ok" | "conflict" | "unauthorized" | "offline";

async function cloudRequest(passcode: string, init?: RequestInit): Promise<Response | "unauthorized" | "offline"> {
  try {
    const res = await fetch("/api/save", { cache: "no-store", ...init, headers: { ...init?.headers, "x-passcode": passcode } });
    return res.status === 401 ? "unauthorized" : res;
  } catch {
    return "offline";
  }
}

/** クラウドのセーブを読む。savedAt はクラウドの版で、次に保存するときの base になる */
export async function fetchCloud(passcode: string): Promise<{ status: "ok"; save: LocalSave | null; savedAt: number } | { status: Exclude<CloudSyncStatus, "ok"> }> {
  const res = await cloudRequest(passcode);
  if (typeof res === "string") return { status: res };
  if (!res.ok) return { status: "offline" };
  const body = (await res.json()) as { savedAt: number; data: string | null };
  const state = body.data ? await unpack(body.data) : null;
  return { status: "ok", save: state ? { state, savedAt: body.savedAt } : null, savedAt: body.savedAt };
}

/** クラウドへ保存する。base より新しいセーブが別の端末から保存されていたら conflict */
export async function pushCloud(passcode: string, state: GameState, base: number): Promise<{ status: CloudSyncStatus; savedAt?: number }> {
  const res = await cloudRequest(passcode, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ base, data: await pack(state) }),
  });
  if (typeof res === "string") return { status: res };
  if (res.status === 409) return { status: "conflict" };
  if (!res.ok) return { status: "offline" };
  const { savedAt } = (await res.json()) as { savedAt: number };
  return { status: "ok", savedAt };
}
