"use client";

import type { AccountName } from "@/engine/accounts";
import type { Entry } from "@/engine/journal";
import { type ExamFormat, FORMAT_BY_ID } from "@/content/examFormats";
import { problemPassed, problemScore } from "@/game/training";
import type { FillAnswer, PracticeStep, ProblemPractice } from "@/game/types";
import { Calculator, useCalcResults } from "./Calculator";
import { FillSheet, ProblemContext } from "./MockExamPanel";
import { QuizCard } from "./Question";
import { Btn, EntryTable, Paper, Portrait, ProgressDots, Win } from "./ui";

/** 解き方の手順とよくある間違い。最初の下書きと採点のあとは開いておく */
export function MethodCard({ format, open }: { format: ExamFormat; open?: boolean }) {
  return (
    <details open={open} className="mb-3 rounded-lg border border-gold/40 p-2 text-sm">
      <summary className="cursor-pointer text-gold">解き方の手順</summary>
      <ol className="mt-1 list-decimal space-y-1 pl-5">
        {format.method.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-gold">よくある間違い</p>
      <ul className="list-disc pl-5 text-xs text-dim">
        {format.traps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </details>
  );
}

/** 下書きの仕訳の答えと、金額の計算の解説 */
function StepAnswer({ step }: { step: PracticeStep }) {
  return (
    <>
      <EntryTable entry={step.answer} />
      {step.note && <p className="mt-1 text-xs text-dim">🧮 {step.note}</p>}
    </>
  );
}

/** 第2問・第3問の問題演習：下書きの仕訳を1つずつ答え合わせ → 答案を埋めて採点 */
export function PracticePanel({
  practice,
  accounts,
  onCheck,
  onNext,
  onSkip,
  onFill,
  onGrade,
  onRetry,
  onFinish,
}: {
  practice: ProblemPractice;
  accounts: AccountName[];
  onCheck: (entry: Entry) => void;
  onNext: () => void;
  onSkip: () => void;
  onFill: (blank: number, value: FillAnswer) => void;
  onGrade: () => void;
  onRetry: () => void;
  onFinish: () => void;
}) {
  const [, addCalc] = useCalcResults();
  const format = FORMAT_BY_ID.get(practice.format)!;
  const { problem } = practice;
  const steps = problem.steps ?? [];
  const head = `${format.part} ${format.title}`;

  if (practice.step < steps.length) {
    const step = steps[practice.step];
    const result = practice.stepResults[practice.step];
    return (
      <Win title={`${head}：下書き（${practice.step + 1} / ${steps.length}）`}>
        <ProgressDots results={practice.stepResults} current={practice.step} />
        <MethodCard format={format} open={practice.step === 0} />
        <details open className="mb-3">
          <summary className="cursor-pointer text-sm">問題（{problem.title}）</summary>
          <Paper className="mb-3">
            <ProblemContext problem={problem} />
          </Paper>
        </details>
        <p className="mb-1 text-sm">表を埋める前に、次の取引の仕訳を書いてみよう。</p>
        <QuizCard
          key={practice.step}
          q={{ text: step.text, answer: step.answer, lesson: problem.lesson }}
          accounts={accounts}
          result={result}
          mine={practice.stepAnswer}
          onCheck={onCheck}
          actions={
            <Btn variant="ghost" onClick={onSkip}>
              下書きを飛ばして答案へ
            </Btn>
          }
        >
          <div className="mb-3">{result ? <StepAnswer step={step} /> : step.note && <p className="text-xs text-dim">🧮 {step.note}</p>}</div>
          <Btn onClick={onNext}>{practice.step + 1 < steps.length ? "次の仕訳" : "答案を埋める"}</Btn>
        </QuizCard>
      </Win>
    );
  }

  const results = practice.results ?? undefined;
  const score = results && problemScore(problem, results);
  const full = problemScore(problem);
  const passed = !!results && problemPassed(problem, results);
  return (
    <Win title={head}>
      <MethodCard format={format} open={!!results} />
      {results && (
        <div className="mb-3 flex items-center gap-3">
          <Portrait id="hoho" size={44} className="shrink-0" />
          <div>
            <p className={`pop text-3xl tabular-nums ${passed ? "text-gold" : "text-ng"}`}>
              {score} / {full}点
            </p>
            <p className="text-sm">
              {score === full
                ? "満点じゃ！ 数字を変えてもう1問やれば、手順が体に入るぞ。"
                : passed
                  ? "7割を超えた。✕の欄を、手順のどこで間違えたか確かめておこう。"
                  : "手順を1つずつ確かめながら、もう1問やってみよう。"}
            </p>
          </div>
        </div>
      )}
      <div className="mb-1">
        <Calculator onResult={addCalc} />
      </div>
      <Paper className="mb-3">
        <FillSheet problem={problem} values={practice.fills} onChange={onFill} results={results} />
      </Paper>
      {results && steps.length > 0 && (
        <details className="mb-3">
          <summary className="cursor-pointer text-sm">下書きの仕訳（答え）</summary>
          <ol className="mt-1 space-y-2 text-sm">
            {steps.map((s) => (
              <li key={s.text} className="rounded-lg border border-white/20 p-2">
                <p className="mb-1">{s.text}</p>
                <StepAnswer step={s} />
              </li>
            ))}
          </ol>
        </details>
      )}
      <div className="flex flex-wrap gap-2">
        {results ? (
          <>
            <Btn onClick={onRetry}>数字を変えてもう1問</Btn>
            <Btn variant="ghost" onClick={onFinish}>
              試験対策にもどる
            </Btn>
          </>
        ) : (
          <>
            <Btn onClick={onGrade}>採点する</Btn>
            <Btn variant="ghost" onClick={onFinish}>
              やめる
            </Btn>
          </>
        )}
      </div>
    </Win>
  );
}
