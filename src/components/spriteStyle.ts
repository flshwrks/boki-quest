import type { SpriteStyle } from "@/content/sprites";
import { storageGet, storageSet } from "@/game/save";
import { useSyncExternalStore } from "react";

const KEY = "boki-quest-sprites";

const listeners = new Set<() => void>();
let current: SpriteStyle | undefined;

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  return () => void listeners.delete(onChange);
};

/** キャラクターの絵（細かい絵か、前の粗い絵か）。この端末に覚える。サーバーでの描画と最初の表示は、細かい絵 */
export function useSpriteStyle(): SpriteStyle {
  return useSyncExternalStore(
    subscribe,
    () => (current ??= storageGet(KEY) === "classic" ? "classic" : "fine"),
    () => "fine",
  );
}

export function setSpriteStyle(style: SpriteStyle) {
  current = style;
  storageSet(KEY, style);
  listeners.forEach((onChange) => onChange());
}
