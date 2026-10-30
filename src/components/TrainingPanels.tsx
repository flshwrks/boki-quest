"use client";

import type { AccountName } from "@/engine/accounts";
import type { Entry } from "@/engine/journal";
import { LESSONS, LESSON_BY_ID, PREP_LEVEL, type Lesson } from "@/content/lessons";
import { LEVELS } from "@/content/world";
import { EXAM_PASS } from "@/game/logic";
import { type Memory, memoryOf, retention } from "@/game/memory";
import { DRILL_SIZE, LESSONS_WITH_QUESTIONS, type Mastery, lessonsLeft, masteryOf, weakLessons } from "@/game/training";
import type { DrillSession, GameState, LessonId } from "@/game/types";
import { QuizCard } from "./Question";
import { Btn, Portrait, Win } from "./ui";

/** 習熟度マップの段（店の成長の順、決算、試験対策） */
const GROUPS: [string, (l: Lesson) => boolean][] = [
  ...[1, 2, 3, 4, 5].map((lv): [string, (l: Lesson) => boolean] => [`Lv${lv} ${LEVELS[lv].name}`, (l) => l.level === lv]),
  ["決算", (l) => l.level === 0],
];

const STAR_STYLE: Record<Mastery["stars"], string> = {
  1: "border-ng/70 bg-ng/10",
  2: "border-gold/60 bg-gold/10",
  3: "border-ok/70 bg-ok/15",
};

/** まだ練習していない論点は ☆☆☆ */
const stars = (m?: Mastery) => "★".repeat(m?.stars ?? 0).padEnd(3, "☆");

/** 記憶の残りぐあいと、次の復習まで（復習の時期が来ていれば「復習どき」） */
function memoryLabel(mem: Memory | undefined, day: number): string {
  if (!mem) return "";
  const left = mem.due - day;
  return `記憶${Math.round(retention(mem, day) * 100)}%・${left <= 0 ? "復習どき" : `あと${left}日`}`;
}

function Tile({ lesson, learned, m, mem, day, onClick }: { lesson: Lesson; learned: boolean; m?: Mastery; mem?: Memory; day: number; onClick?: () => void }) {
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      className={`flex min-h-14 flex-col justify-between rounded-lg border p-1.5 text-left text-xs transition-colors hover:brightness-125 disabled:cursor-default disabled:opacity-40 ${m ? STAR_STYLE[m.stars] : "border-white/30"}`}
    >
      <span className="leading-tight">{lesson.title}</span>
      <span className="flex justify-between gap-1 text-[10px]">
        <span className="text-gold">{learned ? stars(m) : "未習得"}</span>
        {m && <span className="text-dim">{m.tries}回</span>}
      </span>
      {learned && mem && <span className={`text-[10px] ${mem.due <= day ? "text-gold" : "text-dim"}`}>{memoryLabel(mem, day)}</span>}
    </button>
  );
}

export function TrainingHub({
  state,
  onClose,
  onDrill,
  onMock,
  onLesson,
}: {
  state: GameState;
  onClose: () => void;
  onDrill: (lesson: LessonId | null) => void;
  onMock: () => void;
  onLesson: (lesson: LessonId) => void;
}) {
  const mastery = masteryOf(state);
  const memory = memoryOf(state.practice);
  const learned = (id: LessonId) => state.lessonsDone.includes(id);
  const open = state.mistakes.filter((m) => !m.resolved).length;
  const weakest = weakLessons(state, mastery, memory)[0];
  const left = lessonsLeft(state);
  const best = state.mocks.reduce((a, m) => Math.max(a, m.score), 0);
  const advice =
    open > 0
      ? `まだ克服していないミスが${open}問ある。ドリルで片付けてしまおう。`
      : weakest
        ? `今いちばん不安なのは「${LESSON_BY_ID[weakest].title}」じゃな。マップから選んで練習できるぞ。`
        : "まずは店を開いて、仕訳に慣れるところからじゃ。";

  return (
    <Win title="試験対策">
      <div className="mb-3 flex gap-3 text-sm">
        <Portrait id="hoho" size={48} className="shrink-0" />
        <p>{advice}</p>
      </div>

      <section className="mb-4">
        <h3 className="mb-1 text-gold">苦手ドリル</h3>
        <p className="mb-2 text-xs text-dim">
          間違えた問題と、正答率の低い論点から{DRILL_SIZE}
          問。本番と同じプルダウン形式で、1問ずつ答え合わせする。
        </p>
        <Btn onClick={() => onDrill(null)} disabled={!state.lessonsDone.some((id) => LESSONS_WITH_QUESTIONS.has(id))}>
          おまかせドリル（{DRILL_SIZE}問）
        </Btn>
      </section>

      <section className="mb-4">
        <h3 className="mb-1 text-gold">習熟度マップ</h3>
        <p className="mb-2 text-xs text-dim">
          直近10回の正答率。★3 は5回以上で9割正解。「記憶」は忘却曲線で見積もった覚えている度合いで、間をおいて正解するほど次の復習までの間隔がのびる（1→2→4→8→15日）。マスを押すと、その論点だけのドリルになる。
        </p>
        {GROUPS.map(([name, test]) => {
          const ls = LESSONS.filter((l) => test(l) && LESSONS_WITH_QUESTIONS.has(l.id));
          return (
            <div key={name} className="mb-2">
              <p className="mb-1 text-xs text-dim">{name}</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {ls.map((l) => (
                  <Tile
                    key={l.id}
                    lesson={l}
                    learned={learned(l.id)}
                    m={mastery.get(l.id)}
                    mem={memory.get(l.id)}
                    day={state.day}
                    onClick={learned(l.id) ? () => onDrill(l.id) : undefined}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section className="mb-4">
        <h3 className="mb-1 text-gold">試験対策の講義</h3>
        <p className="mb-2 text-xs text-dim">模擬試験の第2問で出る内容。店の営業では出てこないので、ここで学ぶ。</p>
        <div className="grid grid-cols-2 gap-1.5">
          {LESSONS.filter((l) => l.level === PREP_LEVEL).map((l) => (
            <Tile key={l.id} lesson={l} learned={learned(l.id)} m={mastery.get(l.id)} day={state.day} onClick={() => onLesson(l.id)} />
          ))}
        </div>
      </section>

      <section className="mb-4">
        <h3 className="mb-1 text-gold">模擬試験（60分・100点）</h3>
        {left.length > 0 ? (
          <p className="text-xs text-dim">
            すべての講義を受けると挑戦できる（あと{left.length}つ：
            {left
              .slice(0, 3)
              .map((l) => l.title)
              .join("、")}
            {left.length > 3 ? " ほか" : ""}）
          </p>
        ) : (
          <Btn onClick={onMock}>模擬試験に挑戦する</Btn>
        )}
        {state.mocks.length > 0 && (
          <div className="mt-2 text-xs">
            <p>
              自己ベスト <span className={`text-base ${best >= EXAM_PASS ? "text-gold" : ""}`}>{best}点</span>（{state.mocks.length}回受験）
            </p>
            <ul className="text-dim">
              {state.mocks
                .slice(-5)
                .reverse()
                .map((m, i) => (
                  <li key={i} className="tabular-nums">
                    {m.score}点（第1問 {m.parts[0]}・第2問 {m.parts[1]}・第3問 {m.parts[2]}）
                  </li>
                ))}
            </ul>
          </div>
        )}
      </section>

      <Btn variant="ghost" onClick={onClose}>
        店にもどる
      </Btn>
    </Win>
  );
}

export function DrillPanel({
  drill,
  accounts,
  onCheck,
  onNext,
}: {
  drill: DrillSession;
  accounts: AccountName[];
  onCheck: (entry: Entry) => void;
  onNext: () => void;
}) {
  const total = drill.questions.length;
  const title = drill.lesson ? `ドリル：${LESSON_BY_ID[drill.lesson].title}` : "苦手ドリル";

  if (drill.index >= total) {
    const correct = drill.results.filter(Boolean).length;
    return (
      <Win title={`${title} 結果`}>
        <p className="pop mb-2 text-4xl text-gold tabular-nums">
          {correct} / {total}
        </p>
        <div className="mb-3 flex gap-3 text-sm">
          <Portrait id="hoho" size={44} className="shrink-0" />
          <p>
            {correct === total ? "全問正解！ 苦手が得意に変わる瞬間じゃ。" : "間違えた問題は、次のドリルでまた出す。何度でも挑めば、必ず手が覚える。"}
          </p>
        </div>
        <Btn onClick={onNext}>試験対策にもどる</Btn>
      </Win>
    );
  }

  const q = drill.questions[drill.index];
  const result = drill.results[drill.index];
  return (
    <Win title={`${title}（${drill.index + 1} / ${total}）`}>
      <div className="mb-2 flex gap-1" aria-hidden>
        {drill.results.map((r, i) => (
          <span
            key={i}
            className={`h-2 flex-1 rounded-full ${r === null ? (i === drill.index ? "bg-white/60" : "bg-white/20") : r ? "bg-ok" : "bg-ng"}`}
          />
        ))}
      </div>
      <p className="mb-1 text-xs text-dim">{LESSON_BY_ID[q.lesson].title}</p>
      <QuizCard key={drill.index} q={q} accounts={accounts} result={result} mine={drill.answer} onCheck={onCheck}>
        <Btn onClick={onNext}>{drill.index + 1 < total ? "次の問題" : "結果を見る"}</Btn>
      </QuizCard>
    </Win>
  );
}
