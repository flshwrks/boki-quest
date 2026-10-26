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

// Phase 2 でクラウド保存に置き換える。それまでは端末内に保存する。
const KEY = "boki-quest-save-v1";

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveGame(state: GameState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 保存できない環境（プライベートモード等）でもプレイは続けられる
  }
}

export function clearGame() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 同上
  }
}
