import { initialState } from "./logic";
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
  const base = initialState(saved.shopName);
  return { ...base, ...saved, stock: { ...base.stock, ...saved.stock } };
}

// 端末内の保存。キー名は最初の版のまま（変えると既存のセーブが読めなくなる）
const KEY = "boki-quest-save-v1";
const SAVED_AT_KEY = "boki-quest-saved-at";
const PASSCODE_KEY = "boki-quest-passcode";

export interface LocalSave {
  state: GameState;
  savedAt: number;
}

export function loadGame(): LocalSave | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const state = migrate(JSON.parse(raw));
    return state ? { state, savedAt: Number(localStorage.getItem(SAVED_AT_KEY)) || 0 } : null;
  } catch {
    return null;
  }
}

/** 端末に保存し、保存した時刻を返す（クラウドと新しさを比べるのに使う） */
export function saveGame(state: GameState): number {
  const savedAt = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    localStorage.setItem(SAVED_AT_KEY, String(savedAt));
  } catch {
    // 保存できない環境（プライベートモード等）でもプレイは続けられる
  }
  return savedAt;
}

export function clearGame() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(SAVED_AT_KEY);
  } catch {
    // 同上
  }
}

// ───────── クラウド保存（合言葉を知っている本人だけが使える） ─────────

export function getPasscode(): string {
  try {
    return localStorage.getItem(PASSCODE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setPasscode(passcode: string) {
  try {
    if (passcode) localStorage.setItem(PASSCODE_KEY, passcode);
    else localStorage.removeItem(PASSCODE_KEY);
  } catch {
    // 保存できなくても、この画面を開いている間は使える
  }
}

export type CloudResult = { status: "ok"; save: LocalSave | null } | { status: "unauthorized" } | { status: "offline" };

export async function fetchCloud(passcode: string): Promise<CloudResult> {
  try {
    const res = await fetch("/api/save", { headers: { "x-passcode": passcode }, cache: "no-store" });
    if (res.status === 401) return { status: "unauthorized" };
    if (!res.ok) return { status: "offline" };
    const body = (await res.json()) as { savedAt: number; state: Saved | null };
    const state = body.state ? migrate(body.state) : null;
    return { status: "ok", save: state ? { state, savedAt: body.savedAt } : null };
  } catch {
    return { status: "offline" };
  }
}

/** クラウドへ送る。別の端末のほうが新しいときは送らずに "conflict" を返す */
export async function pushCloud(passcode: string, save: LocalSave): Promise<"ok" | "conflict" | "unauthorized" | "offline"> {
  try {
    const res = await fetch("/api/save", {
      method: "PUT",
      headers: { "content-type": "application/json", "x-passcode": passcode },
      body: JSON.stringify(save),
    });
    if (res.status === 401) return "unauthorized";
    if (res.status === 409) return "conflict";
    return res.ok ? "ok" : "offline";
  } catch {
    return "offline";
  }
}
