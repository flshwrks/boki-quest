"use client";

import { useState } from "react";
import { type AccountName, CATEGORY_LABEL, categoryOf, homeSide, sideWithPos } from "@/engine/accounts";
import { trialBalance, trialBalanceTotals } from "@/engine/ledger";
import { ACCOUNT_INFO } from "@/content/accountInfo";
import { LESSONS, LESSON_BY_ID } from "@/content/lessons";
import { dateLabel } from "@/content/world";
import { entriesOf, unlockedAccounts } from "@/game/logic";
import type { GameState, LessonId } from "@/game/types";
import { LessonView } from "./LessonView";
import { AccountChip, Btn, CATEGORY_BG, EntryTable, Modal, fmt } from "./ui";

type Tab = "cards" | "notes" | "journal" | "tb";
const TABS: [Tab, string][] = [
  ["cards", "勘定科目"],
  ["notes", "講義ノート"],
  ["journal", "仕訳帳"],
  ["tb", "試算表"],
];

const ALL_CARDS = Object.keys(ACCOUNT_INFO) as AccountName[];

function Cards({ state }: { state: GameState }) {
  const owned = new Set(unlockedAccounts(state));
  const [open, setOpen] = useState<AccountName | null>(null);
  const info = open ? ACCOUNT_INFO[open] : null;
  return (
    <div>
      <p className="mb-2 text-sm text-dim">
        集めたカード {owned.size} / {ALL_CARDS.length}（3級の範囲はまだまだ続く！）
      </p>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
        {ALL_CARDS.map((acc) =>
          owned.has(acc) ? (
            <button
              key={acc}
              type="button"
              onClick={() => setOpen(acc)}
              className={`${CATEGORY_BG[categoryOf(acc)]} rounded border-2 p-2 text-sm ${open === acc ? "border-gold" : "border-white/30"}`}
            >
              {acc}
            </button>
          ) : (
            <div key={acc} className="rounded border-2 border-dashed border-white/20 p-2 text-center text-sm text-dim">
              ？？？
            </div>
          ),
        )}
      </div>
      {open && info && (
        <div className="rise mt-3 rounded border-2 border-white/40 p-3 text-sm">
          <div className="mb-1 flex items-center gap-2">
            <AccountChip account={open} />
            <span className="text-dim">{CATEGORY_LABEL[categoryOf(open)]}</span>
          </div>
          <p>{info.desc}</p>
          <p className="mt-1">
            増えたら：
            <span className="text-gold">
              {(() => {
                const h = homeSide(categoryOf(open));
                return h ? sideWithPos(h) : "決まった側はない（仮の科目）";
              })()}
            </span>
          </p>
          <p className="mt-1 text-dim">試験での言い回し：{info.exam}</p>
        </div>
      )}
    </div>
  );
}

function Notes({ state }: { state: GameState }) {
  const [replay, setReplay] = useState<{ id: LessonId; page: number } | null>(null);
  if (replay) {
    const pages = LESSON_BY_ID[replay.id].pages.length;
    return (
      <LessonView
        lessonId={replay.id}
        page={replay.page}
        finishLabel="ノートにもどる"
        onTurn={(d) => {
          const page = replay.page + d;
          if (page >= pages) setReplay(null);
          else if (page >= 0) setReplay({ ...replay, page });
        }}
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {LESSONS.map((l) =>
        state.lessonsDone.includes(l.id) ? (
          <li key={l.id} className="rounded border-2 border-white/30 p-3">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-gold">{l.title}</h3>
              <Btn variant="ghost" className="text-xs" onClick={() => setReplay({ id: l.id, page: 0 })}>
                もう一度聞く
              </Btn>
            </div>
            <ul className="list-disc pl-5 text-sm">
              {l.summary.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </li>
        ) : (
          <li key={l.id} className="rounded border-2 border-dashed border-white/20 p-3 text-sm text-dim">
            ？？？（Lv{l.level}で解禁）
          </li>
        ),
      )}
    </ul>
  );
}

const JOURNAL_PAGE = 50;

function Journal({ state }: { state: GameState }) {
  const [shown, setShown] = useState(JOURNAL_PAGE);
  const total = state.journal.length;
  if (total === 0) return <p className="text-sm text-dim">まだ記録はない。</p>;
  // 新しい順に、まず最新の分だけ描く
  const recent = state.journal.slice(Math.max(0, total - shown)).reverse();
  return (
    <>
      <ol className="flex flex-col gap-2">
        {recent.map((r, i) => (
          <li key={total - i} className="rounded border border-white/30 p-2">
            <div className="text-xs text-dim">
              No.{total - i}　{dateLabel(r.day)}
            </div>
            <p className="mb-1 text-sm">{r.exam}</p>
            <EntryTable entry={r.entry} />
          </li>
        ))}
      </ol>
      {shown < total && (
        <div className="mt-3 text-center">
          <Btn variant="ghost" onClick={() => setShown((n) => n + JOURNAL_PAGE)}>
            もっと見る（残り {total - shown} 件）
          </Btn>
        </div>
      )}
    </>
  );
}

export function TrialBalanceTable({ state }: { state: GameState }) {
  const rows = trialBalance(entriesOf(state));
  const { debit: d, credit: c } = trialBalanceTotals(rows);
  return (
    <table className="w-full border-collapse text-sm tabular-nums">
      <thead>
        <tr className="text-xs text-dim">
          <th className="border-b border-white/40 py-1 text-right font-normal">借方残高</th>
          <th className="border-b border-white/40 py-1 text-center font-normal">勘定科目</th>
          <th className="border-b border-white/40 py-1 text-right font-normal">貸方残高</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.account} className="border-b border-white/10">
            <td className="py-1 text-right">{r.debit ? fmt(r.debit) : ""}</td>
            <td className="py-1 text-center">
              <AccountChip account={r.account} className="text-xs" />
            </td>
            <td className="py-1 text-right">{r.credit ? fmt(r.credit) : ""}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="text-gold">
          <td className="border-t-2 border-double border-white py-1 text-right">{fmt(d)}</td>
          <td className="border-t-2 border-double border-white py-1 text-center">合計</td>
          <td className="border-t-2 border-double border-white py-1 text-right">{fmt(c)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

export function BookModal({ state, onClose }: { state: GameState; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("cards");
  return (
    <Modal title="簿記の書" onClose={onClose}>
      <div role="tablist" className="mb-3 flex flex-wrap gap-1.5">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded px-3 py-1 text-sm ${tab === t ? "bg-gold text-ink" : "border border-white/40"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "cards" && <Cards state={state} />}
      {tab === "notes" && <Notes state={state} />}
      {tab === "journal" && <Journal state={state} />}
      {tab === "tb" && <TrialBalanceTable state={state} />}
    </Modal>
  );
}
