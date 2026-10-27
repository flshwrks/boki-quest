"use client";

import { useState } from "react";
import { seededRand, shuffle } from "@/game/random";
import { Btn, fmt } from "./ui";

/** 金額を3択で答えるクイズ（月末の試算表、決算日の精算表） */
export interface Quiz {
  q: string;
  options: number[];
  answer: number;
  explain: string;
}

/** 正解と紛らわしい金額から、重ならない3つの選択肢を作る。並びは seed で決まる（描き直しても変わらない） */
export function quizOptions(answer: number, distractors: number[], seed: number): number[] {
  const opts = [answer];
  for (const d of [...distractors, answer + 5000, answer - 3000, answer + 12000]) {
    if (opts.length >= 3) break;
    if (!opts.includes(d) && d >= 0) opts.push(d);
  }
  return shuffle(opts, seededRand(seed));
}

export function QuizList({ quizzes, answered, onAnswer }: { quizzes: Quiz[]; answered: (boolean | null)[]; onAnswer: (i: number, correct: boolean) => void }) {
  const [picked, setPicked] = useState<(number | null)[]>(quizzes.map(() => null));
  return quizzes.map((qz, i) => (
    <div key={i} className="mb-3 rounded-lg border border-white/30 p-2 text-sm">
      <p className="mb-1">
        Q{i + 1}. {qz.q}
      </p>
      <div className="flex flex-wrap gap-2">
        {qz.options.map((o) => {
          const reveal = answered[i] !== null;
          return (
            <Btn
              key={o}
              variant="ghost"
              disabled={reveal}
              className={reveal && o === qz.answer ? "border-ok! text-ok" : picked[i] === o ? "border-ng! text-ng" : ""}
              onClick={() => {
                setPicked((p) => p.map((v, j) => (j === i ? o : v)));
                onAnswer(i, o === qz.answer);
              }}
            >
              {fmt(o)}円
            </Btn>
          );
        })}
      </div>
      {answered[i] !== null && (
        <p className="rise mt-1">
          {answered[i] ? <span className="text-ok">正解！ 信用 +3　</span> : <span className="text-ng">おしい！　</span>}
          {qz.explain}
        </p>
      )}
    </div>
  ));
}
