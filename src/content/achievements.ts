// 実績（やり込み要素）。ふだんのプレイの結果から判定し、遊び方は変えない。

import { EXAM_PASS, examScore, totalSales, unlockedAccounts } from "@/game/logic";
import type { GameState } from "@/game/types";
import { ALL_CARDS } from "./accountInfo";
import { LESSONS } from "./lessons";
import { TREASURES } from "./treasures";
import { LEVELS, itemsForLevel } from "./world";

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  /** まだ取れていないときに見せるヒント */
  hint: string;
  test: (state: GameState) => boolean;
}

const did = (state: GameState, templateId: string, times = 1) => state.journal.filter((r) => r.templateId === templateId).length >= times;

/** 店の成長の実績。店の名前は LEVELS から取る */
const growth = ([level, icon, title]: readonly [number, string, string]): Achievement => ({
  id: `lv${level}`,
  icon,
  title,
  hint: `店を「${LEVELS[level].name}」に成長させる`,
  test: (s) => s.level >= level,
});

export const ACHIEVEMENTS: Achievement[] = [
  { id: "founded", icon: "🏪", title: "開業おめでとう", hint: "株式会社を設立する", test: (s) => did(s, "founding") },
  { id: "combo10", icon: "🔥", title: "帳簿の達人", hint: "ノーヒントで10連続正解する", test: (s) => s.bestCombo >= 10 },
  { id: "combo30", icon: "💎", title: "帳簿の神様", hint: "ノーヒントで30連続正解する", test: (s) => s.bestCombo >= 30 },
  { id: "collector", icon: "💰", title: "ツケ回収人", hint: "ツケ（売掛金）を10回回収する", test: (s) => did(s, "collect", 10) },
  { id: "note", icon: "📜", title: "手形デビュー", hint: "約束手形で代金を受け取る", test: (s) => did(s, "customer-note") },
  { id: "staff", icon: "🪄", title: "特注職人", hint: "ミーナに星詠みの杖を届ける", test: (s) => did(s, "deliver-staff") },
  { id: "detective", icon: "🔍", title: "現金過不足探偵", hint: "現金が合わなかった原因を突き止める", test: (s) => did(s, "cashdiff-resolve") },
  { id: "lineup", icon: "🧺", title: "品揃え名人", hint: "扱える商品をすべて同時に在庫に並べる（Lv3以上）", test: (s) => s.level >= 3 && itemsForLevel(s.level).every((i) => s.stock[i] > 0) },
  ...(
    [
      [2, "🏠", "小さな店舗の主"],
      [3, "🏬", "商店街の顔"],
      [4, "🏯", "城下町の大店"],
      [5, "👑", "王都の名店"],
    ] as const
  ).map(growth),
  { id: "treasure", icon: "🎒", title: "お宝発見", hint: "レアアイテムを見つける", test: (s) => Object.keys(s.treasures ?? {}).length > 0 },
  { id: "legend", icon: "🐉", title: "伝説の目撃者", hint: "伝説のレアアイテムを見つける", test: (s) => TREASURES.some((t) => t.rarity === "legendary" && s.treasures?.[t.id]) },
  { id: "perfect", icon: "💯", title: "審査満点", hint: "昇格審査で100点をとる", test: (s) => s.phase.kind === "exam" && !!s.phase.exam.graded && examScore(s.phase.exam) === 100 },
  { id: "closing", icon: "📘", title: "はじめての決算", hint: "決算日を乗り切る", test: (s) => s.lessonsDone.includes("closing") },
  {
    id: "profit",
    icon: "📈",
    title: "黒字決算",
    hint: "当期純利益を出して決算を終える",
    test: (s) => s.journal.some((r) => r.templateId === "closing-transfer" && r.entry.credit.some((l) => l.account === "繰越利益剰余金")),
  },
  { id: "dividend", icon: "🎁", title: "株主に感謝を", hint: "株主総会で配当を決める", test: (s) => did(s, "dividend-decide") },
  { id: "sales1m", icon: "🪙", title: "売上100万円", hint: "売上の累計を100万円にする", test: (s) => totalSales(s) >= 1_000_000 },
  { id: "sales10m", icon: "🏆", title: "売上1,000万円", hint: "売上の累計を1,000万円にする", test: (s) => totalSales(s) >= 10_000_000 },
  {
    id: "cards",
    icon: "🃏",
    title: "勘定科目コンプリート",
    hint: "勘定科目カードをすべて集める",
    test: (s) => {
      const owned = new Set(unlockedAccounts(s));
      return ALL_CARDS.every((a) => owned.has(a));
    },
  },
  { id: "drill", icon: "🩹", title: "苦手克服", hint: "苦手ドリルで、前に間違えた問題を10問克服する", test: (s) => s.mistakes.filter((m) => m.resolved).length >= 10 },
  { id: "mockpass", icon: "📝", title: "模試合格ライン", hint: "模擬試験で70点以上をとる", test: (s) => s.mocks.some((m) => m.score >= EXAM_PASS) },
  { id: "mock90", icon: "🌟", title: "本番も怖くない", hint: "模擬試験で90点以上をとる", test: (s) => s.mocks.some((m) => m.score >= 90) },
  { id: "lessons", icon: "🎓", title: "ホーホー先生の一番弟子", hint: "すべての講義を受ける", test: (s) => LESSONS.every((l) => s.lessonsDone.includes(l.id)) },
];

/** まだ持っていない実績のうち、いま条件を満たしているもの */
export function newAchievements(state: GameState): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !state.achievements.includes(a.id) && a.test(state));
}

/** 進行のたびに通す：新しく取れた実績を state に記録する */
export function withAchievements(state: GameState): GameState {
  const earned = newAchievements(state);
  return earned.length === 0 ? state : { ...state, achievements: [...state.achievements, ...earned.map((a) => a.id)] };
}
