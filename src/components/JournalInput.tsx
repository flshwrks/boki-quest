"use client";

import { useState } from "react";
import { ACCOUNTS, type AccountName, type Category, type Side, CATEGORY_LABEL, SIDE_LABEL, categoryOf, isAccountName, sideWithPos } from "@/engine/accounts";
import { categoryHint, type Entry } from "@/engine/journal";
import type { TxSession } from "@/game/types";
import { AccountChip, Btn, CATEGORY_BG, EntryTable, Portrait, Speaker, Win, fmt } from "./ui";
import { play } from "./sfx";

interface Row {
  id: number;
  side: Side;
  account: AccountName | null;
  amount: string;
}

const SIDES: Side[] = ["debit", "credit"];

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
    { id: 0, side: "debit", account: null, amount: "" },
    { id: 1, side: "credit", account: null, amount: "" },
  ]);
  const [nextId, setNextId] = useState(2);
  // カードの置き場所と、金額チップの入力先になる行
  const [focusId, setFocusId] = useState(0);
  const [activeSide, setActiveSide] = useState<Side>("debit");
  const [shakeKey, setShakeKey] = useState(0);

  // 勘定科目マスタは区分順に並んでいるので、その順に絞り込むだけでよい
  const ordered = (Object.keys(ACCOUNTS) as AccountName[]).filter((a) => accounts.includes(a));

  /** 側を切り替えると、金額の入力先もその側の行へ移す */
  const selectSide = (side: Side) => {
    if (side === activeSide) return;
    play("select");
    setActiveSide(side);
    const sideRows = rows.filter((r) => r.side === side);
    const target = sideRows.find((r) => r.account === null) ?? sideRows.find((r) => r.amount === "") ?? sideRows[0];
    if (target) setFocusId(target.id);
    // 反対側の金額欄にカーソルが残らないようにする
    if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
  };

  const placeCard = (account: AccountName, side: Side) => {
    play("card");
    const focused = rows.find((r) => r.id === focusId && r.side === side && r.account === null);
    const target = focused ?? rows.find((r) => r.side === side && r.account === null);
    let next: Row[];
    let placedId: number;
    if (target) {
      next = rows.map((r) => (r.id === target.id ? { ...r, account } : r));
      placedId = target.id;
    } else {
      placedId = nextId;
      next = [...rows, { id: nextId, side, account, amount: "" }];
      setNextId(nextId + 1);
    }
    setRows(next);
    setFocusId(placedId);
    // 借方を置き終えたら、空いている貸方へ自動で移る
    if (side === "debit" && !next.some((r) => r.side === "debit" && r.account === null)) {
      const emptyCredit = next.find((r) => r.side === "credit" && r.account === null);
      if (emptyCredit) {
        setActiveSide("credit");
        setFocusId(emptyCredit.id);
      }
    } else {
      setActiveSide(side);
    }
  };

  const update = (id: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: number) => setRows((rs) => rs.filter((r) => r.id !== id));
  const addRow = (side: Side) => {
    setRows((rs) => [...rs, { id: nextId, side, account: null, amount: "" }]);
    setFocusId(nextId);
    setNextId(nextId + 1);
    setActiveSide(side);
  };

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
        <div className="mt-2 rounded-lg border-2 border-gold/70 bg-gold/10 p-2">
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
          {SIDES.map((side) => {
            const active = activeSide === side;
            const sideRows = rows.filter((r) => r.side === side);
            return (
              <div
                key={side}
                onClick={() => selectSide(side)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const acc = e.dataTransfer.getData("text/plain");
                  if (isAccountName(acc)) placeCard(acc, side);
                }}
                className={`min-h-28 cursor-pointer rounded-lg border-2 p-1.5 transition-colors ${
                  active ? "border-gold bg-gold/10 shadow-[0_0_12px_rgb(240_200_80/0.35)]" : "border-white/30 hover:border-white/60"
                }`}
              >
                <div className={`mb-1 flex items-center justify-between text-sm ${active ? "text-gold" : "text-dim"}`}>
                  <span>{sideWithPos(side)}</span>
                  {active && <span className="rounded bg-gold px-1.5 text-[10px] text-ink">ここに置く</span>}
                </div>
                <ul className="flex flex-col gap-1.5">
                  {sideRows.map((r) => (
                    <li
                      key={r.id}
                      className={`rounded p-1 ${focusId === r.id ? "outline-2 outline-gold/70" : ""}`}
                      onClick={(e) => {
                        // 枠全体のクリック（最初の空き行へ移る）より、押した行を優先する
                        e.stopPropagation();
                        setFocusId(r.id);
                        setActiveSide(side);
                      }}
                    >
                      <div className="flex items-center gap-1">
                        {r.account ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              update(r.id, { account: null });
                              setFocusId(r.id);
                              setActiveSide(side);
                            }}
                            aria-label={`${r.account}を外す`}
                          >
                            <AccountChip account={r.account} className="text-sm" />
                          </button>
                        ) : (
                          <span className="rounded border border-dashed border-white/50 px-2 py-0.5 text-xs text-dim">科目をえらぶ</span>
                        )}
                        {sideRows.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              remove(r.id);
                            }}
                            className="ml-auto px-1 text-dim"
                            aria-label="この行を消す"
                          >
                            ×
                          </button>
                        )}
                      </div>
                      <input
                        inputMode="numeric"
                        value={r.amount}
                        onFocus={() => {
                          setFocusId(r.id);
                          setActiveSide(side);
                        }}
                        onChange={(e) => update(r.id, { amount: e.target.value.replace(/[^\d,]/g, "") })}
                        placeholder="金額"
                        aria-label={`${SIDE_LABEL[side]}の金額`}
                        className="mt-1 w-full rounded border border-white/40 bg-black/30 px-2 py-1 text-right tabular-nums"
                      />
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    addRow(side);
                  }}
                  className="mt-1 w-full rounded border border-dashed border-white/30 text-xs text-dim hover:bg-white/5"
                >
                  ＋ 行を追加
                </button>
              </div>
            );
          })}
        </div>

        {chips.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-dim">金額をタップで入力（枠で囲まれた行へ）：</span>
            {chips.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => update(focusId, { amount: fmt(v) })}
                className="rounded-full border border-white/50 px-2.5 py-0.5 tabular-nums hover:bg-white/10"
              >
                {fmt(v)}
              </button>
            ))}
          </div>
        )}

        {/* 勘定科目カード */}
        <div className="mt-3 border-t border-white/20 pt-3">
          <p className="mb-1.5 text-xs text-dim">
            カードをタップすると、<span className="text-gold">金色の枠</span>（{sideWithPos(activeSide)}）に置かれる。左右の枠をタップで切り替え
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ordered.map((acc) => (
              <button
                key={acc}
                type="button"
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", acc)}
                onClick={() => placeCard(acc, activeSide)}
                className={`${CATEGORY_BG[categoryOf(acc)]} rounded-md border-2 border-white/25 px-2 py-1 text-sm shadow-[0_2px_0_rgb(0_0_0/0.4)] transition-transform hover:-translate-y-0.5 hover:border-white active:translate-y-0 active:scale-95`}
                title={CATEGORY_LABEL[categoryOf(acc)]}
              >
                {acc}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-dim">
            {LEGEND.map((c) => (
              <span key={c} className="flex items-center gap-1">
                <span className={`${CATEGORY_BG[c]} inline-block h-2.5 w-2.5 rounded-sm`} />
                {CATEGORY_LABEL[c]}
              </span>
            ))}
            <span className="ml-auto">PCはドラッグでも置ける</span>
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
