"use client";

import { useEffect, useState } from "react";
import type { AccountName } from "@/engine/accounts";
import { type Entry, isEmptyEntry } from "@/engine/journal";
import { LESSON_BY_ID } from "@/content/lessons";
import { LEVELS } from "@/content/world";
import { EXAM_PASS, examScore } from "@/game/logic";
import type { ExamQuestion, ExamSession } from "@/game/types";
import { CbtEntryForm } from "./CbtEntryForm";
import { MissDetail, QuestionText } from "./Question";
import { play } from "./sfx";
import { Btn, Portrait, Win } from "./ui";


const mmss = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** 残り時間。毎秒の描き直しはここだけで済ませ、時間切れになったら採点する */
export function Countdown({ startedAt, minutes, onTimeUp }: { startedAt: number; minutes: number; onTimeUp: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const left = Math.max(0, startedAt + minutes * 60000 - now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left <= 0) onTimeUp();
  }, [left, onTimeUp]);
  return (
    <span className={`tabular-nums ${left < 60000 ? "text-ng" : ""}`} aria-live="polite">
      残り {mmss(left)}
    </span>
  );
}

function Intro({ exam, onBegin }: { exam: ExamSession; onBegin: () => void }) {
  const level = LEVELS[exam.toLevel];
  return (
    <Win title={level.exam}>
      <div className="flex gap-3">
        <Portrait id="luke" size={56} className="shrink-0" />
        <div className="text-sm">
          <p>昇格の条件がそろいました。「{level.name}」に進むための審査を行います。</p>
          <ul className="mt-2 list-disc pl-5">
            <li>
              仕訳問題 {exam.questions.length}問・制限時間 {exam.minutes}分
            </li>
            <li>{EXAM_PASS}点以上で合格。ヒントはありません</li>
            <li>本試験（CBT）と同じく、勘定科目はプルダウンから選びます</li>
            <li>問題は行き来できます。最後に「提出する」で採点します</li>
          </ul>
          <p className="mt-2 text-dim">不合格でも、2日後にまた受けられます。</p>
        </div>
      </div>
      <div className="mt-4">
        <Btn onClick={onBegin}>審査を始める</Btn>
      </div>
    </Win>
  );
}

/** 採点後の見直し。間違えた問題だけ正解と自分の解答を出す */
export function ExamReview({ questions, answers, graded }: { questions: ExamQuestion[]; answers: (Entry | null)[]; graded: boolean[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {questions.map((q, i) => (
        <li key={i} className="rounded-lg border border-white/30 p-2 text-sm">
          <p>
            <span className={graded[i] ? "text-ok" : "text-ng"}>{graded[i] ? "◯" : "✕"}</span> 第{i + 1}問（{LESSON_BY_ID[q.lesson].title}）
          </p>
          <QuestionText q={q} className="my-1" />
          {!graded[i] && <MissDetail answer={q.answer} mine={answers[i]} />}
        </li>
      ))}
    </ol>
  );
}

/** 本番CBTに似せた明るい画面の枠 */
export function CbtFrame({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] border-2 border-white/85 bg-[#eef0f6] text-[#1d1d2b] shadow-[0_10px_24px_rgb(0_0_0/0.45)]">
      <header className="flex flex-wrap items-center justify-between gap-2 rounded-t-[12px] bg-[#2f3f6f] px-3 py-2 text-white">
        <span>{title}</span>
        {right}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

/** 問題番号のボタン（今の問題・解答済み・未解答で色を変える） */
export function QuestionNav({
  count,
  index,
  answered,
  onSelect,
  label = (i) => String(i + 1),
}: {
  count: number;
  index: number;
  answered: (i: number) => boolean;
  onSelect: (i: number) => void;
  label?: (i: number) => string;
}) {
  return (
    <nav className="mb-3 flex flex-wrap gap-1.5" aria-label="問題の選択">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => {
            play("select");
            onSelect(i);
          }}
          aria-current={i === index}
          className={`h-9 min-w-9 rounded border-2 px-1.5 text-sm ${
            i === index ? "border-[#2f3f6f] bg-[#2f3f6f] text-white" : answered(i) ? "border-[#2f3f6f] bg-[#cfd8ef]" : "border-[#b8bfd3] bg-white"
          }`}
        >
          {label(i)}
        </button>
      ))}
    </nav>
  );
}

/** 前後の問題へ移るボタンと、提出ボタン（押すと確認を出す） */
export function CbtFooter({
  index,
  count,
  onSelect,
  unanswered,
  onGrade,
}: {
  index: number;
  count: number;
  onSelect: (i: number) => void;
  unanswered: number;
  onGrade: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const pager = "rounded border-2 border-[#2f3f6f] px-3 py-1 disabled:opacity-40";
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-2">
        <button type="button" disabled={index === 0} onClick={() => onSelect(index - 1)} className={pager}>
          前の問題
        </button>
        <button type="button" disabled={index === count - 1} onClick={() => onSelect(index + 1)} className={pager}>
          次の問題
        </button>
      </div>
      {confirming ? (
        <div className="flex items-center gap-2 text-sm">
          <span>{unanswered > 0 ? `未解答が${unanswered}問あります。` : ""}提出しますか？</span>
          <button type="button" onClick={onGrade} className="rounded bg-[#c0392b] px-3 py-1 text-white">
            提出する
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="rounded border-2 border-[#2f3f6f] px-3 py-1">
            戻る
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="rounded bg-[#2f3f6f] px-4 py-1.5 text-white">
          提出する
        </button>
      )}
    </div>
  );
}

function Result({ exam, onFinish }: { exam: ExamSession; onFinish: () => void }) {
  const score = examScore(exam);
  const passed = score >= EXAM_PASS;
  return (
    <Win title={`${LEVELS[exam.toLevel].exam} 結果`}>
      <div className="mb-3 flex items-center gap-4">
        <div className={`pop text-5xl tabular-nums ${passed ? "text-gold" : "text-ng"}`}>{score}点</div>
        <div>
          <p className={`text-xl ${passed ? "text-ok" : "text-ng"}`}>{passed ? "合格！" : "不合格…"}</p>
          <p className="text-sm text-dim">合格ライン {EXAM_PASS}点</p>
        </div>
      </div>
      <ExamReview questions={exam.questions} answers={exam.answers} graded={exam.graded ?? []} />
      <div className="mt-3 flex gap-3">
        <Portrait id="hoho" size={44} className="shrink-0" />
        <p className="text-sm">
          {passed
            ? "ホッホ、見事じゃ！ 本番と同じ形式でもちゃんと解けたのう。"
            : "焦らんでよい。間違えた論点は「簿記の書」の講義ノートで復習して、2日後にまた挑もう。"}
        </p>
      </div>
      <div className="mt-4">
        <Btn onClick={onFinish}>{passed ? "昇格する！" : "店にもどる"}</Btn>
      </div>
    </Win>
  );
}

export function ExamPanel({
  exam,
  accounts,
  onBegin,
  onAnswer,
  onGrade,
  onFinish,
}: {
  exam: ExamSession;
  accounts: AccountName[];
  onBegin: (now: number) => void;
  onAnswer: (index: number, entry: Entry) => void;
  onGrade: () => void;
  onFinish: () => void;
}) {
  const [index, setIndex] = useState(0);
  if (exam.graded) return <Result exam={exam} onFinish={onFinish} />;
  if (exam.startedAt === null) return <Intro exam={exam} onBegin={() => onBegin(Date.now())} />;

  const answered = (i: number) => {
    const a = exam.answers[i];
    return !!a && !isEmptyEntry(a);
  };
  const unanswered = exam.questions.filter((_, i) => !answered(i)).length;
  const q = exam.questions[index];

  return (
    <CbtFrame title={LEVELS[exam.toLevel].exam} right={<Countdown startedAt={exam.startedAt} minutes={exam.minutes} onTimeUp={onGrade} />}>
      <QuestionNav count={exam.questions.length} index={index} answered={answered} onSelect={setIndex} />
      <p className="mb-1 text-xs text-[#55607a]">第{index + 1}問　次の取引について仕訳しなさい。</p>
      <QuestionText q={q} className="mb-3 rounded border border-[#b8bfd3] bg-white p-2" />
      <CbtEntryForm key={index} accounts={accounts} initial={exam.answers[index]} onChange={(entry) => onAnswer(index, entry)} />
      <CbtFooter index={index} count={exam.questions.length} onSelect={setIndex} unanswered={unanswered} onGrade={onGrade} />
    </CbtFrame>
  );
}
