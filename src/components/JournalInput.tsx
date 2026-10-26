"use client";

import { useState } from "react";
import { ACCOUNTS, type AccountName, type Category, type Side, CATEGORY_LABEL, SIDE_LABEL, categoryOf, isAccountName, sideWithPos } from "@/engine/accounts";
import { categoryHint, type Entry } from "@/engine/journal";
import type { TxSession } from "@/game/types";
import { AccountChip, Btn, CATEGORY_BG, EntryTable, Portrait, Speaker, Win, fmt } from "./ui";
import { play } from "./sfx";

interface Row {
  side: Side;
  account: AccountName | null;
  amount: string;
}

// 凡例に出す5つの区分（仮勘定は除く）
const LEGEND = (Object.keys(CATEGORY_LABEL) as Category[]).filter((c) => c !== "suspense");

/** 試験文に出てくる金額を拾い、タップで入力できるようにする */
function amountsIn(text: string): number[] {
  const nums = [...text.matchAll(/([\d,]+)円/g)].map((m) => Number(m[1].replaceAll(",", "")));
  return [...new Set(nums)].filter((v) => v > 0);
}

export function JournalInput({
  session,
  accounts,
  onSubmit,
  onHint,
}: {
  session: TxSession;
  accounts: AccountName[];
  onSubmit: (entry: Entry) => void;
  onHint: () => void;
}) {
  const { tx } = session;
  const [rows, setRows] = useState<Row[]>([
    { side: "debit", account: null, amount: "" },
    { side: "credit", account: null, amount: "" },
  ]);
  const [focus, setFocus] = useState(0);
  const [activeSide, setActiveSide] = useState<Side>("debit");
  const [shakeKey, setShakeKey] = useState(0);

  // 勘定科目マスタは区分順に並んでいるので、その順に絞り込むだけでよい
  const ordered = (Object.keys(ACCOUNTS) as AccountName[]).filter((a) => accounts.includes(a));

  const placeCard = (account: AccountName, side: Side) => {
    play("card");
    const empty = rows.findIndex((r) => r.side === side && r.account === null);
    if (empty >= 0) {
      setRows(rows.map((r, i) => (i === empty ? { ...r, account } : r)));
      setFocus(empty);
    } else {
      setRows([...rows, { side, account, amount: "" }]);
      setFocus(rows.length);
    }
  };

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));

  const submit = () => {
    const toLines = (side: Side) =>
      rows
        .filter((r) => r.side === side && r.account)
        .map((r) => ({ account: r.account!, amount: Number(r.amount.replaceAll(",", "")) || 0 }));
    onSubmit({ debit: toLines("debit"), credit: toLines("credit") });
    setShakeKey((k) => k + 1);
  };

  const chips = amountsIn(tx.exam);
  // 答えは、一度は自分で記帳してみてから見られる
  const canReveal = session.attempts >= 1;

  return (
    <div className="flex flex-col gap-3">
      <Win>
        <p className="text-sm">{tx.story}</p>
        <div className="mt-2 rounded border-2 border-gold/70 bg-gold/10 p-2">
          <div className="text-xs text-gold">試験ではこう出る</div>
          <p>{tx.exam}</p>
        </div>
      </Win>

      {/* ヒント・指摘 */}
      {(session.hints > 0 || session.feedback) && (
        <Win key={`${session.attempts}-${session.hints}`} className={session.feedback && session.hints < 3 ? "shake" : "rise"}>
          <div className="flex gap-3">
            <Portrait id="hoho" size={44} className="shrink-0" />
            <div className="min-w-0 flex-1 text-sm">
              <Speaker id="hoho" />
              {session.feedback && (
                <ul className="mb-2 list-none text-ng">
                  {session.feedback.map((m) => (
                    <li key={m}>✗ {m}</li>
                  ))}
                </ul>
              )}
              {session.hints >= 1 && <p>💡 {tx.idea}</p>}
              {session.hints >= 2 && <p className="mt-1">💡 {categoryHint(tx.answer)}</p>}
              {session.hints >= 3 && (
                <div className="mt-2">
                  <p className="mb-1">正解はこうじゃ。同じように入力してみよう。</p>
                  <EntryTable entry={tx.answer} highlight />
                </div>
              )}
            </div>
          </div>
        </Win>
      )}

      {/* 仕訳の入力欄 */}
      <Win>
        <div className="grid grid-cols-2 gap-2">
          {(["debit", "credit"] as const).map((side) => (
            <div
              key={side}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const acc = e.dataTransfer.getData("text/plain");
                if (isAccountName(acc)) placeCard(acc, side);
              }}
              className={`min-h-28 rounded border-2 p-1.5 ${activeSide === side ? "border-gold bg-gold/5" : "border-white/40"}`}
            >
              <button
                type="button"
                onClick={() => setActiveSide(side)}
                className="mb-1 w-full text-left text-sm"
                aria-pressed={activeSide === side}
              >
                <span className={activeSide === side ? "text-gold" : "text-dim"}>
                  {sideWithPos(side)}
                </span>
                {activeSide === side && <span className="ml-1 text-xs text-gold">← カードの置き場所</span>}
              </button>
              <ul className="flex flex-col gap-1.5">
                {rows.map((r, i) =>
                  r.side !== side ? null : (
                    <li key={i} className={`rounded p-1 ${focus === i ? "bg-white/10" : ""}`}>
                      <div className="flex items-center gap-1">
                        {r.account ? (
                          <button type="button" onClick={() => update(i, { account: null })} aria-label={`${r.account}を外す`}>
                            <AccountChip account={r.account} className="text-sm" />
                          </button>
                        ) : (
                          <span className="rounded border border-dashed border-white/50 px-2 py-0.5 text-xs text-dim">科目</span>
                        )}
                        {rows.filter((x) => x.side === side).length > 1 && (
                          <button type="button" onClick={() => remove(i)} className="ml-auto px-1 text-dim" aria-label="この行を消す">
                            ×
                          </button>
                        )}
                      </div>
                      <input
                        inputMode="numeric"
                        value={r.amount}
                        onFocus={() => {
                          setFocus(i);
                          setActiveSide(side);
                        }}
                        onChange={(e) => update(i, { amount: e.target.value.replace(/[^\d,]/g, "") })}
                        placeholder="金額"
                        aria-label={`${SIDE_LABEL[side]}の金額`}
                        className="mt-1 w-full rounded border border-white/40 bg-black/30 px-2 py-1 text-right tabular-nums"
                      />
                    </li>
                  ),
                )}
              </ul>
              <button
                type="button"
                onClick={() => {
                  setRows((rs) => [...rs, { side, account: null, amount: "" }]);
                  setActiveSide(side);
                }}
                className="mt-1 w-full rounded border border-dashed border-white/30 text-xs text-dim hover:bg-white/5"
              >
                ＋ 行を追加
              </button>
            </div>
          ))}
        </div>

        {chips.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-dim">金額をタップで入力：</span>
            {chips.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => update(focus, { amount: fmt(v) })}
                className="rounded border border-white/50 px-2 py-0.5 tabular-nums hover:bg-white/10"
              >
                {fmt(v)}
              </button>
            ))}
          </div>
        )}

        {/* 勘定科目カード */}
        <div className="mt-3 border-t border-white/30 pt-2">
          <div className="mb-1 text-xs text-dim">勘定科目カード（タップで{SIDE_LABEL[activeSide]}へ。PCはドラッグもOK）</div>
          <div className="flex flex-wrap gap-1.5">
            {ordered.map((acc) => (
              <button
                key={acc}
                type="button"
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", acc)}
                onClick={() => placeCard(acc, activeSide)}
                className={`${CATEGORY_BG[categoryOf(acc)]} rounded border-2 border-white/30 px-2 py-1 text-sm hover:border-white active:scale-95`}
                title={CATEGORY_LABEL[categoryOf(acc)]}
              >
                {acc}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] text-dim">
            {LEGEND.map((c) => (
              <span key={c} className="flex items-center gap-1">
                <span className={`${CATEGORY_BG[c]} inline-block h-2.5 w-2.5 rounded-sm`} />
                {CATEGORY_LABEL[c]}
              </span>
            ))}
          </div>
        </div>

        <div key={shakeKey} className="mt-3 flex flex-wrap justify-end gap-2">
          <Btn variant="ghost" onClick={onHint} disabled={session.hints >= 3 || (session.hints >= 2 && !canReveal)}>
            {session.hints === 0 ? "ヒント" : session.hints === 1 ? "もう少しヒント" : "答えを見る"}
          </Btn>
          <Btn onClick={submit} sound={null}>
            記帳する
          </Btn>
        </div>
        {session.hints === 2 && !canReveal && <p className="mt-1 text-right text-xs text-dim">答えは、もう一度挑戦してから見られるよ</p>}
      </Win>
    </div>
  );
}
