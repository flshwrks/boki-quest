"use client";

import type { AccountName } from "@/engine/accounts";
import type { Entry } from "@/engine/journal";
import { FORMAT_BY_ID } from "@/content/examFormats";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { blankLabel, blankOrder, fillCorrect, guideBlank, problemPassed, problemScore } from "@/game/training";
import type { FillAnswer, PracticeStep, ProblemPractice } from "@/game/types";
import { Calculator, useCalcResults } from "./Calculator";
import { MethodCard } from "./MethodCard";
import { Blank, FillSheet, ProblemContext, WrongBlanks, answerText, filled } from "./MockExamPanel";
import { QuizCard } from "./Question";
import { Trap, Why } from "./Why";
import { Btn, EntryTable, Paper, Portrait, ProgressDots, QuitButton, Win, fmt } from "./ui";

/** 下書きの仕訳の答えと、金額の計算の解説 */
function StepAnswer({ step }: { step: PracticeStep }) {
  return (
    <>
      <EntryTable entry={step.answer} />
      {step.note && <p className="mt-1 text-xs text-dim">🧮 {step.note}</p>}
      {step.trap && <Trap text={step.trap} />}
    </>
  );
}

/** いま解き方のどこをやっているか */
function Stage({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 rounded-lg border-l-4 border-gold bg-gold/10 p-2 text-sm">{children}</p>;
}

const sideText = (e: Entry, side: "debit" | "credit") => e[side].map((l) => `${l.account} ${fmt(l.amount)}`).join("・");

/**
 * 答案を埋めるときに見る下書き（本番の計算用紙にあたる）。自分で書いた仕訳だけを出す。
 * まちがえた仕訳は答え合わせで直したあとの形。飛ばした仕訳は、ガイドつきか採点のあとだけ見せる
 */
function DraftSheet({ steps, results, reveal, link }: { steps: PracticeStep[]; results: (boolean | null)[]; reveal: boolean; link?: string }) {
  const shown = steps.map((s, i) => ({ s, r: results[i] })).filter(({ r }) => r !== null || reveal);
  if (shown.length === 0) return null;
  return (
    <details open className="mb-3 rounded-lg border border-white/20 p-2 text-sm">
      <summary className="cursor-pointer">下書き（計算用紙）</summary>
      {link && <p className="mt-1 text-xs text-dim">{link}</p>}
      <ol className="mt-1 divide-y divide-white/10">
        {shown.map(({ s, r }) => (
          <li key={s.text} className="py-1">
            <p className="truncate text-xs text-dim" title={s.text}>
              <span className={r === null ? "" : r ? "text-ok" : "text-ng"}>{r === null ? "－" : r ? "◯" : "✕"}</span> {s.label ?? s.text}
            </p>
            <p className="tabular-nums">
              {sideText(s.answer, "debit")} ／ {sideText(s.answer, "credit")}
            </p>
          </li>
        ))}
      </ol>
    </details>
  );
}

/** 表のその欄が見える位置までスクロールする（下の案内に隠れないよう、画面の上のほうへ） */
function scrollToBlank(blank: number) {
  const el = document.querySelector(`[data-blank="${blank}"]`);
  if (!el) return;
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
  window.scrollBy({ top: el.getBoundingClientRect().top - window.innerHeight * 0.2, behavior: "smooth" });
}

/** ガイド：画面の下に、今埋める欄の場所・入力・求め方を出す。答え合わせのあとは求め方を見せてから次の欄へ */
type LastCheck = { blank: number; ok: boolean } | null;

function GuideBar({
  practice,
  shown,
  last,
  onCheck,
  onNext,
  onGrade,
}: {
  practice: ProblemPractice;
  /** 案内している欄（答え合わせの直後は、その欄） */
  shown: number | undefined;
  last: LastCheck;
  onCheck: (value: FillAnswer, ok: boolean) => void;
  onNext: () => void;
  onGrade: () => void;
}) {
  const { problem } = practice;
  const [draft, setDraft] = useState<FillAnswer>(null);
  const [why, setWhy] = useState(false);
  const order = blankOrder(problem);

  useEffect(() => {
    if (shown !== undefined) scrollToBlank(shown);
  }, [shown]);

  const blank = shown === undefined ? undefined : problem.blanks[shown];
  // 画面の下に固定する。親に transform があると fixed が効かないので body に出す（電卓と同じ）
  return createPortal(
    <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-gold bg-[#151a33]/95 p-3 backdrop-blur">
      <div className="mx-auto max-h-[42vh] max-w-3xl overflow-y-auto">
        {shown === undefined || !blank ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm">全部の欄を埋めた！ 採点して、まちがえた欄を見直そう。</p>
            <Btn onClick={onGrade}>採点する</Btn>
          </div>
        ) : (
          <>
            <p className="text-xs text-dim">
              ガイド {order.indexOf(shown) + 1} / {order.length} 欄　黄色の欄を埋めよう
            </p>
            <p className="mb-1 font-bold text-gold">
              {blankLabel(problem, shown)}
              {blank.kind === "amount" ? "の金額は？" : blank.kind === "multi" ? "（あてはまるものをすべて）" : "に入るものは？"}
            </p>
            {last ? (
              <>
                <p className={`mb-1 ${last.ok ? "text-ok" : "text-ng"}`}>{last.ok ? "◯ 正解！" : `✕ 正解は ${answerText(blank)}`}</p>
                {blank.why && <Why text={blank.why} className="mb-2 text-sm" />}
                <Btn
                  onClick={() => {
                    setDraft(null);
                    setWhy(false);
                    onNext();
                  }}
                >
                  次の欄へ
                </Btn>
              </>
            ) : (
              <>
                <div className="mb-2 rounded bg-[#eef0f6] p-2 text-[#1d1d2b]">
                  <Blank blank={blank} value={draft} onChange={setDraft} />
                </div>
                {why ? (
                  blank.why && <Why text={blank.why} className="mb-2 text-sm" />
                ) : (
                  <button type="button" className="mb-2 text-sm text-gold underline" onClick={() => setWhy(true)}>
                    求め方を見る（答えも出る）
                  </button>
                )}
                <div>
                  <Btn disabled={!filled(draft)} onClick={() => onCheck(draft, fillCorrect(blank, draft))}>
                    確かめる
                  </Btn>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
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
  onGuideCheck,
  onGuide,
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
  onGuideCheck: (value: FillAnswer) => void;
  onGuide: (on: boolean) => void;
  onGrade: () => void;
  onRetry: () => void;
  onFinish: () => void;
}) {
  const [, addCalc] = useCalcResults();
  const [last, setLast] = useState<LastCheck>(null);
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
        <Stage>
          いまの作業：<b>下書き</b>（本番では計算用紙に自分で書く仕訳）。{format.draft}
        </Stage>
        <MethodCard format={format} />
        <details open className="mb-3">
          <summary className="cursor-pointer text-sm">問題（{problem.title}）</summary>
          <Paper className="mb-3">
            <ProblemContext problem={problem} />
          </Paper>
        </details>
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
          <div className="mb-3">
            <StepAnswer step={step} />
          </div>
          <Btn onClick={onNext}>{practice.step + 1 < steps.length ? "次の仕訳" : "答案を埋める"}</Btn>
        </QuizCard>
        <QuitButton onQuit={onFinish} className="mt-4 block" />
      </Win>
    );
  }

  const results = practice.results ?? undefined;
  const score = results && problemScore(problem, results);
  const full = problemScore(problem);
  const passed = !!results && problemPassed(problem, results);
  const guiding = !!practice.checks && !results;
  const active = guiding ? (last?.blank ?? guideBlank(practice)) : undefined;
  const modes = [
    [true, "ガイドつき（1欄ずつ、求め方つき）"],
    [false, "ガイドなし（本番と同じ）"],
  ] as const;
  return (
    <Win title={head} className={guiding ? "pb-[45vh]" : ""}>
      {!results && (
        <>
          <div className="mb-2 flex flex-wrap gap-2 text-sm" role="group" aria-label="解き方">
            {modes.map(([on, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={!!practice.checks === on}
                onClick={() => {
                  if (!!practice.checks === on) return;
                  setLast(null);
                  onGuide(on);
                }}
                className={`rounded-full border px-3 py-1 ${!!practice.checks === on ? "border-gold bg-gold/20 text-gold" : "border-white/30"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <Stage>
            {guiding ? (
              <>
                いまの作業：<b>下書きを見ながら、表を1欄ずつ埋める</b>。黄色の欄が今の欄。画面の下に入力欄と「求め方」が出る。
              </>
            ) : (
              <>
                いまの作業：<b>下書きを見ながら表を埋めて</b>、「採点する」。
              </>
            )}
          </Stage>
        </>
      )}
      <MethodCard format={format} open={!!results} />
      {results && (
        <div className="mb-3 flex items-center gap-3">
          <Portrait id="hoho" size={48} className="shrink-0" />
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
      <DraftSheet steps={steps} results={practice.stepResults} reveal={guiding || !!results} link={format.draft} />
      <Paper className="mb-3">
        <FillSheet
          problem={problem}
          values={practice.fills}
          onChange={guiding ? undefined : onFill}
          results={results ?? (guiding ? practice.checks : undefined)}
          active={active}
        />
      </Paper>
      {results && <WrongBlanks problem={problem} results={results} />}
      {guiding && (
        <GuideBar
          practice={practice}
          shown={active}
          last={last}
          onCheck={(value, ok) => {
            setLast({ blank: active!, ok });
            onGuideCheck(value);
          }}
          onNext={() => setLast(null)}
          onGrade={onGrade}
        />
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
            {!guiding && <Btn onClick={onGrade}>採点する</Btn>}
            <QuitButton onQuit={onFinish} />
          </>
        )}
      </div>
    </Win>
  );
}
