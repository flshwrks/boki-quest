// 月の依頼書：毎月はじめにギルドから3つの目標が届き、翌月はじめに達成した数だけ報奨金と評判がもらえる

import { REWARD_LESSON } from "@/content/events";
import { n } from "@/content/eventKit";
import { LESSON_BY_ID } from "@/content/lessons";
import { sumOf } from "@/engine/journal";
import { TRUSTED } from "@/content/upgrades";
import { DAYS_PER_MONTH, dayInMonth } from "@/content/world";
import { masteryOf } from "./logic";
import type { GameState, GuildRequest, LessonId } from "./types";

/** 正答率の目標と、判定に必要な問題数 */
const CLEAN_RATE = 85;
const CLEAN_MIN = 10;
/** 1つ達成するごとの報奨金（店の Lv をかける）と評判 */
const REWARD_PER_GOAL = 3000;
export const REWARD_REP = 4;

export { REWARD_LESSON };

export const monthStartOf = (day: number) => day - dayInMonth(day) + 1;
const inMonth = (start: number, day: number) => day >= start && day < start + DAYS_PER_MONTH;

/** その月（start から5営業日）の売上（返品は差し引く。決算の損益振替は除く） */
export function salesIn(state: GameState, start: number): number {
  return state.journal
    .filter((r) => inMonth(start, r.day) && r.templateId !== "closing-transfer")
    .reduce((total, r) => total + sumOf(r.entry.credit, "売上") - sumOf(r.entry.debit, "売上"), 0);
}

/** 新しい月の依頼書：先月より1割多い売上・いちばん苦手な論点を★3に・正答率85% */
export function makeRequests(state: GameState, start: number): GuildRequest[] {
  const prev = salesIn(state, start - DAYS_PER_MONTH);
  const goals: GuildRequest[] = [{ kind: "sales", target: Math.max(Math.ceil(Math.round(prev * 1.1) / 10000) * 10000, 50000 * state.level) }];
  const mastery = masteryOf(state);
  // 記録のある論点のうち、★がいちばん少なく正答率の低いもの
  const weak = state.lessonsDone
    .map((id) => ({ id, m: mastery.get(id) }))
    .filter((x): x is { id: LessonId; m: NonNullable<typeof x.m> } => !!x.m && x.m.stars < 3)
    .sort((a, b) => a.m.stars - b.m.stars || a.m.correct / a.m.tries - b.m.correct / b.m.tries)[0];
  if (weak) goals.push({ kind: "mastery", target: 3, lesson: weak.id });
  goals.push({ kind: "clean", target: CLEAN_RATE });
  return goals;
}

/** 依頼書の目標の進み具合 */
export function requestProgress(state: GameState, start: number, g: GuildRequest): { label: string; now: string; done: boolean } {
  switch (g.kind) {
    case "sales": {
      const now = salesIn(state, start);
      return { label: `今月の売上 ${n(g.target)}円`, now: `${n(now)}円`, done: now >= g.target };
    }
    case "mastery": {
      const stars = masteryOf(state).get(g.lesson!)?.stars ?? 0;
      return { label: `「${LESSON_BY_ID[g.lesson!].title}」を習熟度★3に（苦手ドリルも使える）`, now: `★${stars}`, done: stars >= 3 };
    }
    case "clean": {
      const recs = state.practice.filter((r) => inMonth(start, r.day));
      const rate = recs.length ? Math.round((recs.filter((r) => r.ok).length / recs.length) * 100) : 0;
      return { label: `今月の正答率 ${g.target}%以上（${CLEAN_MIN}問以上）`, now: `${rate}%（${recs.length}問）`, done: recs.length >= CLEAN_MIN && rate >= g.target };
    }
  }
}

/**
 * 月が変わったら：先月の依頼書を判定して報奨金を決め、今月の依頼書を出す。
 * 報奨金は達成1つにつき 3,000円×店のLv（帳簿の信用が高ければ1.5倍）と評判+4
 */
export function rollRequests(state: GameState): GameState {
  const start = monthStartOf(state.day);
  if (state.requests?.start === start) return state;
  let next = state;
  const old = state.requests;
  if (old) {
    const count = old.goals.filter((g) => requestProgress(state, old.start, g).done).length;
    if (count > 0) {
      const amount = Math.round((REWARD_PER_GOAL * state.level * count * (state.trust >= TRUSTED ? 1.5 : 1)) / 1000) * 1000;
      next = {
        ...next,
        reputation: Math.min(100, next.reputation + REWARD_REP * count),
        reward: state.lessonsDone.includes(REWARD_LESSON) ? { amount, count } : null,
      };
    }
  }
  return { ...next, requests: { start, goals: makeRequests(next, start) } };
}
