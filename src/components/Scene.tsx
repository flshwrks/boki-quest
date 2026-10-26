"use client";

import { ITEMS, ITEM_IDS, LEVELS } from "@/content/world";
import type { CharacterId, GameState } from "@/game/types";
import { Sprite } from "./Sprite";
import { Portrait } from "./ui";

const SHELF_MAX = 10;

/** 店内の様子。棚の品数が在庫に合わせて増減し、話し手がカウンターに立つ */
export function Scene({ state, speaker }: { state: GameState; speaker?: CharacterId }) {
  const items = ITEM_IDS.filter((id) => ITEMS[id].level <= state.level);
  return (
    <div
      className="relative h-44 overflow-hidden rounded-lg border-3 border-white sm:h-52"
      style={{
        background:
          state.level >= 2
            ? "repeating-linear-gradient(90deg,#6b4a2e 0 30px,#5e4027 30px 32px)"
            : "linear-gradient(#3d5a8a,#7aa0c8 55%,#5a8a4a 55%)",
      }}
    >
      {/* 棚 */}
      <div className="absolute top-2 right-2 flex flex-col gap-1 sm:top-3 sm:right-3">
        {items.map((id) => {
          const it = ITEMS[id];
          const shown = Math.min(state.stock[id], SHELF_MAX);
          return (
            <div key={id} className="flex h-8 items-end gap-0.5 border-b-4 border-[#3a2412] bg-black/20 px-1 sm:h-9" title={`${it.name} 在庫${state.stock[id]}`}>
              <span className="mr-1 w-14 self-center text-[10px] leading-tight text-white drop-shadow sm:w-16 sm:text-xs">
                {it.name}
                <br />
                <span className="text-gold">×{state.stock[id]}</span>
              </span>
              {Array.from({ length: shown }, (_, i) => (
                <Sprite key={i} name={it.sprite} palette={it.palette} size={14} />
              ))}
              {state.stock[id] === 0 && <span className="self-center text-[10px] text-ng">品切れ</span>}
            </div>
          );
        })}
      </div>

      {/* 師匠は棚の上から見守る */}
      {speaker !== "hoho" && (
        <div className="absolute top-1 left-2 bob">
          <Portrait id="hoho" size={36} />
        </div>
      )}

      {/* 話し手 */}
      {speaker && (
        <div key={speaker} className="pop absolute bottom-6 left-6 sm:left-10">
          <Portrait id={speaker} size={speaker === "pipi" ? 64 : 88} />
        </div>
      )}

      {/* カウンター */}
      <div className="absolute inset-x-0 bottom-0 h-7 border-t-4 border-[#2a180a] bg-[#7a4e28]">
        <span className="absolute right-2 bottom-1 text-[10px] text-parch/80 sm:text-xs">
          {LEVELS[state.level].name}「{state.shopName}」
        </span>
      </div>
    </div>
  );
}
