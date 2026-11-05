import { DAYS_PER_MONTH, DAYS_PER_YEAR, ITEMS, OPEN_DAY, perItem } from "@/content/world";
import { UPGRADES, UPGRADE_IDS, type UpgradeId } from "@/content/upgrades";
import { isLegacyTaxSplit } from "@/content/salesTax";
import { initialState, practiceFromHistory } from "./logic";
import { rollRequests } from "./requests";
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
  // 店の設備は後から増えた項目。古いセーブでは、ガンテツの売り込みで買った設備を拾う
  const upgrades = shifted.upgrades ?? upgradesFromHistory(shifted);
  const merged = { ...base, ...shifted, stock, stockValue, upgrades, mistakes: (shifted.mistakes ?? base.mistakes).filter((m) => !unfairTaxMistake(shifted, m)) };
  // 正誤の記録は後から増えた項目。古いセーブでは、これまでの記帳から作り直す
  const withPractice = shifted.practice ? merged : { ...merged, practice: practiceFromHistory(merged) };
  // 月の依頼書も後から増えた項目。読み込んだ月の分をすぐ出す
  return withPractice.requests ? withPractice : rollRequests(withPractice);
}

/**
 * 2026-10-30 より前の、代金を分けて受け払いする取引の問題文には「消費税をどちらに含めるか」がなく、答えが決まらなかった。
 * そこでのミスは本人のせいではないので、ミスの記録から外す（苦手ドリルに出さない）。
 * 正誤の記録（practice）は問題文を持たず特定できないうえ、件数が同期の目印（progressOf）なので残す
 */
function unfairTaxMistake(saved: GameState, m: GameState["mistakes"][number]): boolean {
  const record = saved.journal.find((r) => r.templateId === m.templateId && r.exam === m.exam);
  return !!record && isLegacyTaxSplit(m.exam, record.entry);
}

function upgradesFromHistory(saved: GameState): UpgradeId[] {
  const bought = saved.journal.filter((r) => r.templateId === "buy-fixture" || r.templateId === "buy-wagon");
  return UPGRADE_IDS.filter((id) => bought.some((r) => r.exam.startsWith(UPGRADES[id].exam)));
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
const CLOUD_BASE_KEY = "boki-quest-cloud-base";

export interface LocalSave {
  state: GameState;
  savedAt: number;
}

export function parseSave(raw: string | null): GameState | null {
  try {
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function loadGame(): LocalSave | null {
  const state = parseSave(storageGet(KEY));
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

/**
 * この端末のセーブが、クラウドのどの版から進めたものか（rev）と、そのときの進み具合（progress）。
 * 保存した時刻は操作のたびに新しくなるので、どちらが進んでいるかの比較には使わない
 */
export interface CloudBase {
  rev: number;
  progress: string;
}

/** 進み具合の目印：日付・記帳の数・正誤の記録の数がすべて同じなら、同じところまで進んでいる */
export const progressOf = (s: GameState) => `${s.day}:${s.journal.length}:${s.practice.length}`;

/** クラウドとそろえた記録がない */
export const EMPTY_BASE: CloudBase = { rev: 0, progress: "" };

export function getCloudBase(): CloudBase {
  try {
    const base = JSON.parse(storageGet(CLOUD_BASE_KEY) ?? "null") as CloudBase | null;
    return base && typeof base.rev === "number" ? base : EMPTY_BASE;
  } catch {
    return EMPTY_BASE;
  }
}

/** クラウドとそろえたことを記録する。state を省くと「この端末のセーブで続ける」（次の保存でクラウドを上書きする） */
export function setCloudBase(rev: number, state?: GameState) {
  storageSet(CLOUD_BASE_KEY, JSON.stringify({ rev, progress: state ? progressOf(state) : "" }));
}

/**
 * 端末とクラウドのセーブのどちらで続けるか。
 * local：クラウドがこの端末の元の版のまま（または空）／remote：この端末はそろえたあと進めていない／ask：両方で進めて分かれた
 */
export function reconcile(local: GameState | null, remote: GameState | null, rev: number, base: CloudBase): "local" | "remote" | "ask" {
  if (!remote) return "local";
  if (!local) return "remote";
  if (rev === base.rev) return "local";
  const here = progressOf(local);
  if (here === base.progress || here === progressOf(remote)) return "remote";
  return "ask";
}

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
  return parseSave(await new Response(stream).text());
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
