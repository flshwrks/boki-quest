import type { GameState } from "./types";

// Phase 2 でクラウド保存に置き換える。それまでは端末内に保存する。
const KEY = "boki-quest-save-v1";

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    return s.version === 1 ? s : null;
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
