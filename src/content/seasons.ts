// 季節のイベント：月ごとに、店の商売に一時的な変化が起きる（暦の月で決まる）

import { calendarMonth, monthOfYear } from "./world";

export interface Season {
  name: string;
  icon: string;
  /** 朝の画面の説明 */
  effect: string;
  /** お客さんの注文の数量の倍率 */
  qty?: number;
  /** 大口の注文が起きる確率に足す分 */
  bigOrder?: number;
  /** ガンテツの特価に足す値引き率 */
  wholesale?: number;
  /** 祭りの予約注文が入る（前受金） */
  festival?: true;
}

const SEASONS: Partial<Record<number, Season>> = {
  4: { name: "春の市", icon: "🌸", effect: "ガンテツの特価が、さらに5%安い", wholesale: 0.05 },
  7: { name: "夏の冒険シーズン", icon: "☀", effect: "冒険者が多く、お客さんの注文が1.5倍", qty: 1.5 },
  10: { name: "収穫祭", icon: "🍂", effect: "大口の注文が起きやすい。月はじめに祭りの予約注文が入る（前受金）", bigOrder: 0.15, festival: true },
  12: { name: "冬至祭", icon: "❄", effect: "贈り物の季節。お客さんの注文が1.5倍", qty: 1.5 },
  1: { name: "新年の初売り", icon: "🎍", effect: "大口の注文が起きやすい", bigOrder: 0.1 },
};

/** その日の季節のイベント（なければ undefined） */
export const seasonOf = (day: number): Season | undefined => SEASONS[calendarMonth(monthOfYear(day))];
