"use client";

import { seasonOf } from "@/content/seasons";
import { ITEMS } from "@/content/world";
import { REWARD_LESSON, REWARD_REP, requestProgress } from "@/game/requests";
import type { GameState } from "@/game/types";
import { fmt } from "./ui";

/** 今月の季節のイベントと収穫祭の予約（朝の画面） */
export function SeasonNote({ state }: { state: GameState }) {
  const season = seasonOf(state.day);
  const f = state.festival;
  if (!season && !f) return null;
  return (
    <div className="mb-3 rounded-lg border border-white/30 p-2 text-sm">
      {season && (
        <p>
          {season.icon} 今月は<span className="text-gold">{season.name}</span>：{season.effect}
        </p>
      )}
      {f && (
        <p className={season ? "mt-1" : ""}>
          🧺 収穫祭の予約：{ITEMS[f.item].name}を{fmt(f.qty)}
          {ITEMS[f.item].unit}（在庫 {fmt(state.stock[f.item])}
          {ITEMS[f.item].unit}）。月の4日目から納品できる。代金{fmt(f.price)}円のうち手付金{fmt(f.deposit)}円は受け取り済み
        </p>
      )}
    </div>
  );
}

/** 今月の依頼書。closing なら月末の判定として表示する */
export function RequestList({ state, closing = false }: { state: GameState; closing?: boolean }) {
  const r = state.requests;
  if (!r) return null;
  const rows = r.goals.map((g) => requestProgress(state, r.start, g));
  const done = rows.filter((x) => x.done).length;
  return (
    <div className="mb-3 rounded-lg border border-white/30 p-2 text-sm">
      <div className="mb-1 text-gold">📜 {closing ? `今月の依頼書の結果：${done}/${rows.length} 達成` : "今月の依頼書（商人ギルドから）"}</div>
      <ul className="flex flex-col gap-0.5">
        {rows.map((x) => (
          <li key={x.label} className={x.done ? "text-ok" : ""}>
            {x.done ? "✓" : "・"} {x.label} <span className="text-xs text-dim">（いま {x.now}）</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-dim">
        {closing && done === 0
          ? "今月は達成なし。来月また挑戦しよう"
          : `達成1つにつき、翌月はじめに評判+${REWARD_REP}${state.lessonsDone.includes(REWARD_LESSON) ? "と報奨金（店のLv×3,000円。帳簿の信用80以上なら1.5倍。雑益として記帳）" : "（報奨金は決算の講義で雑益を習うと受け取れる）"}`}
      </p>
    </div>
  );
}
