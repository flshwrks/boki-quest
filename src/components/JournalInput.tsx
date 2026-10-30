"use client";

import { useState } from "react";
import type { AccountName } from "@/engine/accounts";
import { categoryHint, type Entry } from "@/engine/journal";
import type { TxSession } from "@/game/types";
import { Calculator, useCalcResults } from "./Calculator";
import { CardEntryForm } from "./CardEntryForm";
import { CbtEntryForm } from "./CbtEntryForm";
import { VoucherView } from "./VoucherView";
import { Btn, EntryTable, Portrait, Speaker, Win } from "./ui";

/** card：カードを置く入力（序盤向け）／cbt：本番と同じプルダウン入力 */
export type InputMode = "card" | "cbt";

export function JournalInput({
  session,
  accounts,
  mode,
  onToggleMode,
  onSubmit,
  onHint,
}: {
  session: TxSession;
  accounts: AccountName[];
  mode: InputMode;
  onToggleMode: () => void;
  onSubmit: (entry: Entry) => void;
  onHint: () => void;
}) {
  const { tx } = session;
  const [entry, setEntry] = useState<Entry>({ debit: [], credit: [] });
  // 答えは、一度は自分で記帳してみてから見られる
  const canReveal = session.attempts >= 1;
  const [calc, addCalc] = useCalcResults();

  return (
    <div className="flex flex-col gap-3">
      <Win>
        {tx.offBooks && <p className="mb-1 inline-block rounded-full border border-white/40 px-2 text-xs text-dim">練習・ギルドの帳簿相談（店の帳簿には記入しない）</p>}
        <p className="text-sm">{tx.story}</p>
        {tx.withTax && (
          <p className="mt-1 inline-block rounded-full border border-white/40 px-2 text-xs">🧾 消費税はノエルが書き足す：税抜の金額で仕訳しよう</p>
        )}
        <div className="mt-2 rounded-lg border-2 border-gold/70 bg-gold/10 p-2">
          <div className="text-xs text-gold">試験ではこう出る</div>
          <p>{tx.exam}</p>
          {tx.doc && <VoucherView doc={tx.doc} />}
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
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
          <Calculator onResult={addCalc} />
          <button
            type="button"
            onClick={() => {
              // 入力欄は作り直されて空になるので、手元の仕訳も空に戻す
              setEntry({ debit: [], credit: [] });
              onToggleMode();
            }}
            className="text-xs text-dim underline hover:text-white"
          >
            {mode === "cbt" ? "カード式で入力する" : "本番と同じCBT形式で入力する"}
          </button>
        </div>
        {mode === "cbt" ? (
          <CbtEntryForm key="cbt" accounts={accounts} onChange={setEntry} chips={calc} />
        ) : (
          <CardEntryForm key="card" accounts={accounts} examText={tx.exam} onChange={setEntry} extraAmounts={calc} />
        )}
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Btn variant="ghost" onClick={onHint} disabled={session.hints >= 3 || (session.hints >= 2 && !canReveal)}>
            {session.hints === 0 ? "ヒント" : session.hints === 1 ? "もう少しヒント" : "答えを見る"}
          </Btn>
          <Btn onClick={() => onSubmit(entry)} sound={null}>
            記帳する
          </Btn>
        </div>
        {session.hints === 2 && !canReveal && <p className="mt-1 text-right text-xs text-dim">答えは、もう一度挑戦してから見られるよ</p>}
      </Win>
    </div>
  );
}
