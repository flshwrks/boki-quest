"use client";

import { ITEMS, LEVELS, itemsForLevel } from "@/content/world";
import type { CharacterId, GameState } from "@/game/types";
import { useEffect, useRef, useState } from "react";
import { type Pose, Sprite } from "./Sprite";
import { Portrait, prefersReducedMotion } from "./ui";

const SHELF_MAX = 8;

export type TimeOfDay = "morning" | "day" | "evening";

const SKY: Record<TimeOfDay, string> = {
  morning: "linear-gradient(#f0a878,#f8d8a0 40%,#9ac0e0 54%,#5a8a4a 55%)",
  day: "linear-gradient(#3d5a8a,#7aa0c8 54%,#5a8a4a 55%)",
  evening: "linear-gradient(#2a2050,#c86048 45%,#e89058 54%,#3e5a32 55%)",
};

const TINT: Record<TimeOfDay, string> = {
  morning: "rgb(255 200 140 / 0.12)",
  day: "transparent",
  evening: "rgb(80 30 60 / 0.35)",
};

/** キャラクターの動き。talk は口パク、それ以外は体ごとの動き */
export type Mood = "talk" | "think" | "oops" | "happy" | "cheer" | "sleepy";

export interface SceneFx {
  /** 話し手の頭上に出す感情アイコン */
  emote?: string;
  /** お金の増減などをふわっと浮かべる。key が変わるたびに再生する */
  popup?: { key: string | number; text: string; good: boolean };
  /** 日付のバナー（朝の場面転換） */
  banner?: string;
  /** 話し手（いなければ棚の上の師匠）の動き */
  mood?: Mood;
  /** 変わるたびに動きを最初から再生する（正解のたびに跳ねる、など） */
  moodKey?: string | number;
}

/** コマの列。frames を ms ごとに切り替え、loop でなければ最後のコマ（undefined なら元の絵）で止まる */
type Clip = { frames: (Pose | undefined)[]; ms: number; loop?: boolean };

const CLIPS: Record<Mood, Clip> = {
  happy: { frames: ["crouch", "armsUp", "armsUp", "crouch", undefined], ms: 140 },
  cheer: { frames: ["armsUp", undefined, "crouch"], ms: 220, loop: true },
  oops: { frames: ["sweat"], ms: 0 },
  think: { frames: ["think"], ms: 0 },
  sleepy: { frames: ["sleep"], ms: 0 },
  talk: { frames: ["gesture", undefined, "gesture", undefined], ms: 320 },
};
/** 登場：足を開く・閉じるを交互にして歩いてくる */
const ENTER: Clip = { frames: ["walk", undefined, "walk", undefined], ms: 110 };

/** コマ送り。登場したてなら歩くコマのあとに、場面のコマを続ける。key が変わるたびに最初から再生する */
function usePose(mood: Mood | undefined, key: string): Pose | undefined {
  const entered = useRef(false);
  const [pose, setPose] = useState<Pose | undefined>();
  useEffect(() => {
    const clip = mood ? CLIPS[mood] : undefined;
    const clips = [...(entered.current ? [] : [ENTER]), clip ?? { frames: [undefined], ms: 0 }];
    const steps = clips.flatMap((c) => c.frames.map((frame) => ({ frame, ms: c.ms })));
    entered.current = true;
    // 動きを減らす設定なら、コマ送りせず最後のコマだけ見せる
    if (prefersReducedMotion()) {
      setPose(steps.at(-1)!.frame);
      return;
    }
    const loopFrom = clip?.loop ? steps.length - clip.frames.length : -1;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      const { frame, ms } = steps[i];
      setPose(frame);
      i = i + 1 < steps.length ? i + 1 : loopFrom;
      if (i >= 0 && ms > 0) timer = setTimeout(step, ms);
    };
    step();
    return () => clearTimeout(timer);
    // key には mood も含まれている
  }, [key]);
  return pose;
}

/** 動きと感情アイコンをつけたキャラクター */
function Actor({ id, size, fx }: { id: CharacterId; size: number; fx: SceneFx }) {
  const key = `${fx.mood}:${fx.moodKey ?? ""}`;
  const pose = usePose(fx.mood, key);
  return (
    <div key={key} className={`relative ${fx.mood && fx.mood !== "talk" ? `mood-${fx.mood}` : ""}`}>
      {fx.emote && (
        <span
          key={fx.emote}
          // 小さい師匠（棚の上）は、頭の上だと見切れるので右横に出す
          className={`bubble absolute z-10 rounded-full border-2 border-ink bg-white px-2 text-sm leading-6 text-ink ${
            size < 50 ? "top-0 -right-8" : "-top-6 left-1/2 -translate-x-1/2"
          }`}
        >
          {fx.emote}
        </span>
      )}
      <Portrait id={id} size={size} talking={fx.mood === "talk"} pose={pose} />
    </div>
  );
}

/** 店内の様子。棚の品数が在庫に合わせて増減し、話し手がカウンターに立つ */
export function Scene({ state, speaker, time, fx = {} }: { state: GameState; speaker?: CharacterId; time: TimeOfDay; fx?: SceneFx }) {
  const indoor = state.level >= 2;
  const items = itemsForLevel(state.level);
  return (
    <div
      className="relative h-44 overflow-hidden rounded-[14px] border-2 border-white/85 shadow-[0_10px_24px_rgb(0_0_0/0.45)] sm:h-52"
      style={{
        background: indoor ? "repeating-linear-gradient(90deg,#6b4a2e 0 30px,#5e4027 30px 32px)" : SKY[time],
        transition: "background 0.8s",
      }}
    >
      {/* 店内は時間帯を色味で表す */}
      {indoor && <div className="pointer-events-none absolute inset-0 transition-colors duration-700" style={{ background: TINT[time] }} />}

      {/* 棚 */}
      {/* 棚：商品がふえたら2列にして、店の中に収める */}
      <div className={`absolute top-2 right-2 grid gap-1 sm:top-3 sm:right-3 ${items.length > 3 ? "grid-cols-2" : "grid-cols-1"}`}>
        {items.map((id) => {
          const it = ITEMS[id];
          const stock = state.stock[id];
          return (
            <div key={id} className="w-[6.5rem] rounded-sm border-b-4 border-[#3a2412] bg-black/30 px-1 py-0.5 sm:w-32" title={`${it.name} 在庫${stock}`}>
              <div className="flex items-center gap-1 text-[10px] leading-tight text-white drop-shadow sm:text-xs">
                <Sprite name={it.sprite} palette={it.palette} size={12} />
                <span className="truncate">{it.name}</span>
                <span className={`ml-auto ${stock === 0 ? "text-ng" : "text-gold"}`}>{stock === 0 ? "品切れ" : `×${stock}`}</span>
              </div>
              <div className="flex h-3 gap-px">
                {Array.from({ length: Math.min(stock, SHELF_MAX) }, (_, i) => (
                  <Sprite key={i} name={it.sprite} palette={it.palette} size={9} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 師匠は棚の上から見守る。話し手がいないときは、師匠が場面に合わせて動く */}
      {speaker !== "hoho" && (
        <div className="bob absolute top-1 left-2">
          {speaker ? <Portrait id="hoho" size={36} /> : <Actor id="hoho" size={36} fx={fx} />}
        </div>
      )}

      {/* 話し手 */}
      {speaker && (
        <div key={speaker} className="walk-in absolute bottom-6 left-6 sm:left-10">
          <Actor id={speaker} size={speaker === "pipi" ? 64 : 88} fx={fx} />
        </div>
      )}

      {/* お金の増減 */}
      {fx.popup && (
        <div
          key={fx.popup.key}
          className={`float-up pointer-events-none absolute top-1/3 left-1/2 rounded-full bg-black/60 px-3 py-1 text-lg tabular-nums ${
            fx.popup.good ? "text-gold" : "text-ng"
          }`}
        >
          {fx.popup.text}
        </div>
      )}

      {/* 閉店の看板 */}
      {time === "evening" && (
        <div className="pop absolute top-3 left-1/2 -translate-x-1/2 rounded border-2 border-[#3a2412] bg-parch px-3 py-0.5 text-sm text-[#3a2412] shadow">
          本日閉店
        </div>
      )}

      {/* 朝の日付バナー */}
      {fx.banner && (
        <div key={fx.banner} className="day-banner pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/40 text-2xl text-white drop-shadow sm:text-3xl">
          {fx.banner}
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
