"use client";

import { useState } from "react";
import type { AccountName } from "@/engine/accounts";
import { type Entry, isEmptyEntry } from "@/engine/journal";
import { EXAM_PASS } from "@/game/logic";
import { MOCK_QUESTIONS, mockFullParts, mockParts, mockScore, problemScore } from "@/game/training";
import type { FillAnswer, FillBlank, FillCell, FillProblem, FillTable, MockSession } from "@/game/types";
import { Calculator, useCalcResults } from "./Calculator";
import { CbtEntryForm } from "./CbtEntryForm";
import { CbtFooter, CbtFrame, Countdown, ExamReview, QuestionNav } from "./ExamPanel";
import { QuestionText } from "./Question";
import { Btn, Portrait, Win, fmt } from "./ui";

const filled = (v: FillAnswer) => (Array.isArray(v) ? v.length > 0 : !!v && v.trim() !== "");

const answerText = (b: FillBlank) => (Array.isArray(b.answer) ? b.answer.join("・") : typeof b.answer === "number" ? fmt(b.answer) : b.answer);

/** 空欄ひとつ。採点後は自分の答えと正誤、間違いなら正解を出す */
function Blank({
  blank,
  value,
  onChange,
  result,
  prefix,
}: {
  blank: FillBlank;
  value: FillAnswer;
  onChange: (v: FillAnswer) => void;
  result?: boolean;
  prefix?: string;
}) {
  const graded = result !== undefined;
  const mark = graded && <span className={result ? "text-[#1e7a46]" : "text-[#c0392b]"}>{result ? "◯" : "✕"}</span>;
  const fix = graded && !result && <span className="block text-[11px] text-[#c0392b]">正解：{answerText(blank)}</span>;
  if (blank.kind === "multi") {
    const chosen = Array.isArray(value) ? value : [];
    return (
      <div>
        <div className="flex flex-wrap gap-1">
          {blank.options!.map((o) => {
            const on = chosen.includes(o);
            return (
              <button
                key={o}
                type="button"
                disabled={graded}
                aria-pressed={on}
                onClick={() => onChange(on ? chosen.filter((x) => x !== o) : [...chosen, o])}
                className={`rounded border px-1.5 py-0.5 text-[11px] ${on ? "border-[#2f3f6f] bg-[#2f3f6f] text-white" : "border-[#b8bfd3] bg-white"}`}
              >
                {o}
              </button>
            );
          })}
          {mark}
        </div>
        {fix}
      </div>
    );
  }
  const input =
    blank.kind === "select" ? (
      <select
        value={typeof value === "string" ? value : ""}
        disabled={graded}
        onChange={(e) => onChange(e.target.value || null)}
        className="rounded border border-[#8a93ad] bg-[#fffbe6] px-1 py-0.5"
        aria-label="摘要を選ぶ"
      >
        <option value="">（選ぶ）</option>
        {blank.options!.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    ) : (
      <input
        inputMode="numeric"
        value={typeof value === "string" ? value : ""}
        disabled={graded}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 rounded border border-[#8a93ad] bg-[#fffbe6] px-1 py-0.5 text-right tabular-nums"
        aria-label="金額"
      />
    );
  return (
    <span className="inline-block">
      <span className="inline-flex items-center gap-1">
        {prefix}
        {input}
        {mark}
      </span>
      {fix}
    </span>
  );
}

/** 表ひとつ。数字の列は右寄せにする */
function Table({
  table,
  problem,
  values,
  onChange,
  results,
}: {
  table: FillTable;
  problem: FillProblem;
  values: FillAnswer[];
  onChange: (blank: number, v: FillAnswer) => void;
  results?: boolean[];
}) {
  const isNumber = (c: FillCell) => (typeof c === "string" ? /^[△\d,]+$/.test(c) : problem.blanks[c.blank].kind === "amount");
  return (
    <div className="mb-3 overflow-x-auto">
      {table.title && <p className="mb-1 text-sm font-bold">{table.title}</p>}
      <table className="w-full border-collapse bg-white text-xs sm:text-sm">
        {table.head && (
          <thead>
            <tr>
              {table.head.map((h, i) => (
                <th key={i} className="border border-[#b8bfd3] bg-[#dfe4f2] px-1.5 py-1 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {table.rows.map((row, r) => (
            <tr
              key={r}
              className={
                r === table.rows.length - 1 && row.every((c) => typeof c === "string") && row.includes("") ? "border-t-2 border-[#2f3f6f]" : ""
              }
            >
              {row.map((c, i) => (
                <td key={i} className={`border border-[#b8bfd3] px-1.5 py-1 ${isNumber(c) ? "text-right tabular-nums" : ""}`}>
                  {typeof c === "string" ? (
                    c
                  ) : (
                    <Blank
                      blank={problem.blanks[c.blank]}
                      value={values[c.blank]}
                      onChange={(v) => onChange(c.blank, v)}
                      result={results?.[c.blank]}
                      prefix={c.prefix}
                    />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 穴埋め問題（第2問・第3問）の画面 */
export function FillSheet({
  problem,
  values,
  onChange,
  results,
}: {
  problem: FillProblem;
  values: FillAnswer[];
  onChange: (blank: number, v: FillAnswer) => void;
  results?: boolean[];
}) {
  return (
    <div>
      <p className="mb-1 font-bold">
        {problem.title}（{problemScore(problem)}点）
      </p>
      {problem.lead.map((l) => (
        <p key={l} className="mb-1 text-sm">
          {l}
        </p>
      ))}
      {problem.given?.map((t, i) => (
        <Table key={`g${i}`} table={t} problem={problem} values={values} onChange={onChange} />
      ))}
      {problem.items && (
        <div className="mb-3 rounded border border-[#b8bfd3] bg-white p-2 text-sm">
          <p className="mb-1 font-bold">{problem.itemsTitle ?? "決算整理事項"}</p>
          <ol className="list-decimal pl-5">
            {problem.items.map((it) => (
              <li key={it}>{it}</li>
            ))}
          </ol>
        </div>
      )}
      {problem.sheet.map((t, i) => (
        <Table key={`s${i}`} table={t} problem={problem} values={values} onChange={onChange} results={results} />
      ))}
    </div>
  );
}

function Intro({ onBegin }: { onBegin: () => void }) {
  return (
    <Win title="模擬試験（日商簿記3級）">
      <div className="flex gap-3">
        <Portrait id="hoho" size={56} className="shrink-0" />
        <div className="text-sm">
          <p>本試験と同じ配分の模擬試験じゃ。店のことは忘れて、試験会場にいるつもりで解いてみよう。</p>
          <ul className="mt-2 list-disc pl-5">
            <li>第1問：仕訳 {MOCK_QUESTIONS}問（各3点・45点）</li>
            <li>第2問：勘定記入と補助簿（20点）</li>
            <li>第3問：決算整理後の財務諸表（35点）</li>
            <li>制限時間60分・{EXAM_PASS}点以上で合格ライン。ヒントはなし</li>
            <li>問題は行き来できる。最後に「提出する」で採点する</li>
          </ul>
          <p className="mt-2 text-dim">数字は毎回変わるから、何度でも挑戦できるぞ。</p>
        </div>
      </div>
      <div className="mt-4">
        <Btn onClick={onBegin}>試験を始める</Btn>
      </div>
    </Win>
  );
}

function Result({ mock, onFinish }: { mock: MockSession; onFinish: () => void }) {
  const score = mockScore(mock);
  const parts = mockParts(mock);
  const full = mockFullParts(mock);
  const passed = score >= EXAM_PASS;
  const g = mock.graded!;
  const ratios = parts.map((p, i) => p / full[i]);
  const weakest = ratios.indexOf(Math.min(...ratios));
  const advice = [
    "第1問の仕訳で点を落としておる。「苦手ドリル」で間違えた論点を固めるのが近道じゃ。",
    "第2問が弱いのう。試験対策の講義「勘定記入と締め切り」「補助簿の選び方」を読み直そう。",
    "第3問が伸びしろじゃ。決算整理仕訳を1つずつ書いてから、表の数字を埋めるとミスが減るぞ。",
  ][weakest];
  return (
    <Win title="模擬試験の結果">
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <div className={`pop text-5xl tabular-nums ${passed ? "text-gold" : "text-ng"}`}>{score}点</div>
        <div className="text-sm">
          <p className={`text-xl ${passed ? "text-ok" : "text-ng"}`}>
            {passed ? "合格ライン突破！" : score >= 50 ? "あと少し！" : "ここから伸ばそう"}
          </p>
          {parts.map((p, i) => (
            <p key={i} className="tabular-nums">
              第{i + 1}問 {p} / {full[i]}点
            </p>
          ))}
        </div>
      </div>
      <div className="mb-3 flex gap-3 text-sm">
        <Portrait id="hoho" size={44} className="shrink-0" />
        <p>
          {passed && score === 100
            ? "満点じゃと！？ もう教えることはないのう…いや、本番まで油断は禁物じゃ。"
            : passed
              ? `見事じゃ！ ${advice}`
              : advice}
        </p>
      </div>
      <details className="mb-2">
        <summary className="cursor-pointer text-sm">第1問を見直す</summary>
        <div className="mt-2">
          <ExamReview questions={mock.questions} answers={mock.answers} graded={g.questions} />
        </div>
      </details>
      {mock.problems.map((p, i) => (
        <details key={i} className="mb-2">
          <summary className="cursor-pointer text-sm">{p.title}を見直す</summary>
          <div className="mt-2 rounded-lg bg-[#eef0f6] p-2 text-[#1d1d2b]">
            <FillSheet problem={p} values={mock.fills[i]} onChange={() => {}} results={g.fills[i]} />
          </div>
        </details>
      ))}
      <Btn onClick={onFinish}>試験対策にもどる</Btn>
    </Win>
  );
}

/** 第1問（仕訳）は問題ごと、第2問・第3問は大問ごとにページを分ける */
export function MockExamPanel({
  mock,
  accounts,
  onBegin,
  onAnswer,
  onFill,
  onGrade,
  onFinish,
}: {
  mock: MockSession;
  accounts: AccountName[];
  onBegin: (now: number) => void;
  onAnswer: (index: number, entry: Entry) => void;
  onFill: (problem: number, blank: number, value: FillAnswer) => void;
  onGrade: () => void;
  onFinish: () => void;
}) {
  const [page, setPage] = useState(0);
  const [calc, addCalc] = useCalcResults();
  if (mock.graded) return <Result mock={mock} onFinish={onFinish} />;
  if (mock.startedAt === null) return <Intro onBegin={() => onBegin(Date.now())} />;

  const n = mock.questions.length;
  const pages = n + mock.problems.length;
  const answered = (i: number) => {
    if (i < n) {
      const a = mock.answers[i];
      return !!a && !isEmptyEntry(a);
    }
    return mock.fills[i - n].every(filled);
  };
  // 空欄が残っている大問も「未解答」に数える
  const unanswered = Array.from({ length: pages }, (_, i) => i).filter((i) => !answered(i)).length;
  const label = (i: number) => (i < n ? String(i + 1) : mock.problems[i - n].short);

  return (
    <CbtFrame title="模擬試験" right={<Countdown startedAt={mock.startedAt} minutes={mock.minutes} onTimeUp={onGrade} />}>
      <QuestionNav count={pages} index={page} answered={answered} onSelect={setPage} label={label} />
      <div className="mb-1">
        <Calculator onResult={addCalc} />
      </div>
      {page < n ? (
        <>
          <p className="mb-1 text-xs text-[#55607a]">第1問（{page + 1}）　次の取引について仕訳しなさい。（3点）</p>
          <QuestionText q={mock.questions[page]} className="mb-3 rounded border border-[#b8bfd3] bg-white p-2" />
          <CbtEntryForm key={page} accounts={accounts} initial={mock.answers[page]} onChange={(entry) => onAnswer(page, entry)} chips={calc} />
        </>
      ) : (
        <FillSheet problem={mock.problems[page - n]} values={mock.fills[page - n]} onChange={(b, v) => onFill(page - n, b, v)} />
      )}
      <CbtFooter index={page} count={pages} onSelect={setPage} unanswered={unanswered} onGrade={onGrade} />
    </CbtFrame>
  );
}
