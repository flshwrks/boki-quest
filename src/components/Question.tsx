"use client";

import { useState } from "react";
import type { AccountName } from "@/engine/accounts";
import { type Entry, isEmptyEntry } from "@/engine/journal";
import type { ExamQuestion } from "@/game/types";
import { Calculator, useCalcResults } from "./Calculator";
import { CbtEntryForm } from "./CbtEntryForm";
import { VoucherView } from "./VoucherView";
import { AnswerExplain, Btn, EntryTable } from "./ui";

// 審査・模試・ドリル・講義の確認問題で共通に使う、仕訳問題の部品

/** 問題文。証ひょうつきの問題なら、書類もいっしょに出す */
export function QuestionText({ q, className = "" }: { q: ExamQuestion; className?: string }) {
  return (
    <div className={className}>
      <p>{q.text}</p>
      {q.doc && <VoucherView doc={q.doc} />}
    </div>
  );
}

/** 間違えた問題の正解と、自分の解答（開くと見える） */
export function MissDetail({ answer, mine }: { answer: Entry; mine: Entry | null }) {
  return (
    <>
      <p className="text-xs text-dim">正解</p>
      <AnswerExplain entry={answer} highlight />
      {mine && !isEmptyEntry(mine) && (
        <details className="mt-1 text-xs text-dim">
          <summary className="cursor-pointer">自分の解答</summary>
          <EntryTable entry={mine} />
        </details>
      )}
    </>
  );
}

/**
 * 1問ずつ答え合わせする仕訳問題（ドリル・講義の確認問題）。
 * result が null の間は入力欄、答え合わせのあとは正誤と（間違いなら）正解を出す。
 * actions は答え合わせボタンの横に、children は答え合わせのあとに出す
 */
export function QuizCard({
  q,
  accounts,
  result,
  mine,
  onCheck,
  actions,
  children,
}: {
  q: ExamQuestion;
  accounts: AccountName[];
  result: boolean | null;
  mine: Entry | null;
  onCheck: (entry: Entry) => void;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [draft, setDraft] = useState<Entry | null>(null);
  const [calc, addCalc] = useCalcResults();
  return (
    <>
      <QuestionText q={q} className="mb-3 rounded-lg border border-white/30 p-2" />
      {result === null ? (
        <>
          <div className="rounded-lg bg-[#eef0f6] p-2 text-[#1d1d2b]">
            <div className="mb-1">
              <Calculator onResult={addCalc} />
            </div>
            <CbtEntryForm accounts={accounts} initial={null} onChange={setDraft} chips={calc} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn onClick={() => draft && onCheck(draft)} disabled={!draft || isEmptyEntry(draft)}>
              答え合わせ
            </Btn>
            {actions}
          </div>
        </>
      ) : (
        <>
          <p className={`stamp mb-2 text-2xl ${result ? "text-ok" : "text-ng"}`}>{result ? "◯ 正解！" : "✕ ざんねん"}</p>
          {!result && <MissDetail answer={q.answer} mine={mine} />}
          <div className="mt-3">{children}</div>
        </>
      )}
    </>
  );
}
