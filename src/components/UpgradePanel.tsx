"use client";

import { LESSON_BY_ID } from "@/content/lessons";
import { UPGRADES, UPGRADE_IDS, type UpgradeId, type UpgradePay, hasUpgrade } from "@/content/upgrades";
import { upgradePreview } from "@/game/logic";
import type { GameState } from "@/game/types";
import { Btn, fmt } from "./ui";

const PAYS: { pay: UpgradePay; label: string }[] = [
  { pay: "普通預金", label: "普通預金で買う" },
  { pay: "未払金", label: "月末払いで買う" },
];

/** 朝の画面の「店の設備」。お金を貯めて設備を買うと、店の経営に長く効く。買った設備は決算で減価償却する */
export function UpgradePanel({ state, onBuy }: { state: GameState; onBuy: (id: UpgradeId, pay: UpgradePay) => void }) {
  // 未払金を習ってから（備品の講義のあと）
  if (!state.lessonsDone.includes("payables")) return null;
  return (
    <details className="mb-3 rounded-lg border border-white/30 p-2 text-sm">
      <summary className="cursor-pointer text-gold">
        店の設備（{state.upgrades.length}/{UPGRADE_IDS.length}）
      </summary>
      <p className="mt-1 text-xs text-dim">設備は備品・車両運搬具として帳簿に載り、決算で減価償却する。付随費用（据付費など）は取得原価に含めるぞ。</p>
      <ul className="mt-2 flex flex-col gap-2">
        {UPGRADE_IDS.map((id) => {
          const u = UPGRADES[id];
          const cost = u.price + (u.fee?.amount ?? 0);
          const owned = hasUpgrade(state, id);
          const learned = state.lessonsDone.includes(u.lesson);
          return (
            <li key={id} className="rounded border border-white/20 p-2">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={owned ? "text-ok" : ""}>
                  {owned && "✓ "}
                  {u.name}
                </span>
                <span className="text-xs text-dim">
                  {u.account}・{fmt(u.price)}円{u.fee && `＋${u.fee.label}${fmt(u.fee.amount)}円`}
                </span>
              </div>
              <p className="text-xs">効果：{u.effect}</p>
              {!owned &&
                (learned ? (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {PAYS.map(({ pay, label }) => {
                      const { disabled } = upgradePreview(state, id, pay);
                      return (
                        <Btn key={pay} variant="chip" disabled={!!disabled} onClick={() => onBuy(id, pay)}>
                          {disabled ? `${label}（${disabled}）` : `${label}（${fmt(cost)}円）`}
                        </Btn>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-dim">「{LESSON_BY_ID[u.lesson].title}」を学ぶと買える</p>
                ))}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
