"use client";

import { useMemo, useState } from "react";
import { explainLine, sumAmounts } from "@/engine/journal";
import { statements } from "@/engine/ledger";
import { LESSONS, LESSON_BY_ID, lessonsForLevel } from "@/content/lessons";
import { ACCOUNT_INFO } from "@/content/accountInfo";
import { LEVELS, dateLabel } from "@/content/world";
import { LEVEL_UP, balance, entriesOf, expectedCustomers, todaysLesson, totalSales } from "@/game/logic";
import type { AccountName } from "@/engine/accounts";
import type { GameEvent, GameState, LessonId, ResultInfo } from "@/game/types";
import { TrialBalanceTable } from "./BookModal";
import { LedgerViz } from "./LedgerViz";
import { AccountChip, Btn, EntryTable, Portrait, Speaker, Win, fmt } from "./ui";

export function DayStartPanel({ state, onOpen }: { state: GameState; onOpen: () => void }) {
  const lesson = todaysLesson(state);
  const lv1 = lessonsForLevel(1);
  return (
    <Win title={`${dateLabel(state.day)} の朝`}>
      <ul className="mb-3 text-sm">
        {lesson && (
          <li>
            📖 今日の講義：<span className="text-gold">{LESSON_BY_ID[lesson].title}</span>
          </li>
        )}
        <li>🧑‍🤝‍🧑 来店予定の冒険者：およそ {expectedCustomers(state)} 人（評判が上がると増える）</li>
      </ul>
      {state.level === 1 && state.day > 1 && (
        <div className="mb-3 rounded border border-white/30 p-2 text-sm">
          <div className="mb-1 text-gold">店を「小さな店舗」に成長させる条件</div>
          <Goal label="Lv1の講義をすべて受ける" now={lv1.filter((l) => state.lessonsDone.includes(l.id)).length} target={lv1.length} />
          <Goal label="売上の累計" now={totalSales(state)} target={LEVEL_UP.sales} unit="円" />
          <Goal label="帳簿の信用" now={state.trust} target={LEVEL_UP.trust} />
          <Goal label="営業日数" now={state.day} target={LEVEL_UP.days} unit="日目" />
        </div>
      )}
      {state.level === 2 && lessonsForLevel(2).every((l) => state.lessonsDone.includes(l.id)) && (
        <p className="mb-3 rounded border border-white/30 p-2 text-sm">
          Lv2の講義はすべて修了！ 次の成長「取引の拡大（手形・電子記録債権など）」は、次のアップデートで解禁予定じゃ。それまで店を回して腕を磨こう。
        </p>
      )}
      <Btn onClick={onOpen}>開店する！</Btn>
    </Win>
  );
}

function Goal({ label, now, target, unit = "" }: { label: string; now: number; target: number; unit?: string }) {
  const done = now >= target;
  return (
    <div className="flex items-center gap-2">
      <span className={done ? "text-ok" : "text-dim"}>{done ? "★" : "☆"}</span>
      <span className="flex-1">{label}</span>
      <span className="tabular-nums">
        {fmt(Math.min(now, target))}/{fmt(target)}
        {unit}
      </span>
    </div>
  );
}

export function LessonDonePanel({ lesson, onNext }: { lesson: LessonId; onNext: () => void }) {
  const l = LESSON_BY_ID[lesson];
  return (
    <Win title={`講義「${l.title}」修了！`}>
      <p className="mb-2 text-sm">簿記の書に講義ノートが追加された。</p>
      {l.accounts.length > 0 && (
        <>
          <p className="mb-2 text-sm">新しい勘定科目カードを手に入れた！</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {l.accounts.map((a, i) => (
              <div key={a} className="pop" style={{ animationDelay: `${i * 120}ms` }}>
                <AccountChip account={a} className="border-2 border-white px-3 py-2 text-base" />
                <div className="mt-1 max-w-36 text-[10px] text-dim">{ACCOUNT_INFO[a]?.desc}</div>
              </div>
            ))}
          </div>
        </>
      )}
      <Btn onClick={onNext}>{l.practice.length > 0 ? "さっそく実践！" : "つぎへ"}</Btn>
    </Win>
  );
}

export function EventPanel({ event, onChoose }: { event: GameEvent; onChoose: (i: number) => void }) {
  return (
    <Win>
      <Speaker id={event.speaker} />
      <div className="mb-3 flex flex-col gap-1">
        {event.lines.map((l, i) => (
          <p key={i} className="rise" style={{ animationDelay: `${i * 80}ms` }}>
            {l}
          </p>
        ))}
      </div>
      {event.guided && <p className="mb-2 text-xs text-gold">✦ 講義の練習：ヒントを1つ無料で見られる</p>}
      <div className="flex flex-col border-t border-white/30 pt-2">
        {event.choices.map((c, i) => (
          <Btn key={c.label} variant="choice" disabled={!!c.disabled} onClick={() => onChoose(i)}>
            {c.label}
            {c.disabled && <span className="ml-2 text-xs text-ng">（{c.disabled}）</span>}
          </Btn>
        ))}
      </div>
    </Win>
  );
}

export function ReplyPanel({ text, onNext }: { text: string; onNext: () => void }) {
  return (
    <Win>
      <p className="mb-3">{text}</p>
      <Btn onClick={onNext}>つぎへ</Btn>
    </Win>
  );
}

export function ResultPanel({
  info,
  state,
  highlight,
  onNext,
}: {
  info: ResultInfo;
  state: GameState;
  highlight: AccountName[];
  onNext: () => void;
}) {
  const { tx } = info;
  const [showViz, setShowViz] = useState(false);
  return (
    <Win>
      <p className="pop mb-2 text-xl text-ok">{info.firstTry ? "◎ ノーヒントで正解！" : "○ 正解！"}</p>
      <EntryTable entry={tx.answer} />
      <ul className="mt-2 text-sm">
        {(["debit", "credit"] as const).flatMap((side) =>
          tx.answer[side].map((l) => <li key={`${side}-${l.account}`}>・{explainLine(l, side)}</li>),
        )}
      </ul>
      {tx.note && (
        <div className="mt-2 flex gap-2 text-sm">
          <Portrait id="hoho" size={32} className="shrink-0" />
          <p>{tx.note}</p>
        </div>
      )}
      <p className="mt-2 text-sm text-dim">
        帳簿の信用 {info.trustDelta > 0 ? <span className="text-ok">+{info.trustDelta}</span> : "±0"}
        {info.combo >= 2 && <span className="ml-3 text-gold">{info.combo}コンボ！</span>}
      </p>
      {info.comboMessage && <p className="pop mt-1 text-sm text-gold">{info.comboMessage}</p>}
      <div className="mt-3 lg:hidden">
        <button type="button" className="text-sm text-dim underline" onClick={() => setShowViz((v) => !v)}>
          {showViz ? "帳簿の変化をとじる" : "帳簿の変化を見る"}
        </button>
        {showViz && (
          <div className="mt-2">
            <LedgerViz entries={entriesOf(state)} highlight={highlight} />
          </div>
        )}
      </div>
      <div className="mt-3">
        <Btn onClick={onNext}>つぎへ</Btn>
      </div>
    </Win>
  );
}

function grade(state: GameState): { mark: string; comment: string } {
  const { correct, firstTry } = state.today;
  if (correct === 0) return { mark: "-", comment: "今日は記帳がなかったのう。" };
  const r = firstTry / correct;
  if (r >= 0.9) return { mark: "S", comment: "見事じゃ！ 王国財務院でも通用する帳簿じゃな。" };
  if (r >= 0.7) return { mark: "A", comment: "よい調子じゃ。迷った取引は簿記の書で見直しておこう。" };
  if (r >= 0.5) return { mark: "B", comment: "半分以上は一発正解。ヒントの考え方をもう一度思い出すのじゃ。" };
  return { mark: "C", comment: "焦らんでよい。間違えた分だけ、試験本番で迷わなくなる。" };
}

export function DayEndPanel({ state, onClose }: { state: GameState; onClose: () => void }) {
  const g = grade(state);
  const tip = useMemo(() => {
    const tips = LESSONS.filter((l) => state.lessonsDone.includes(l.id)).flatMap((l) => l.tips);
    return tips[state.day % tips.length];
  }, [state.day, state.lessonsDone]);
  const t = state.today;
  return (
    <Win title={`${dateLabel(state.day)} 閉店`}>
      <div className="mb-3 flex items-center gap-4">
        <div className="pop text-5xl text-gold">{g.mark}</div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm tabular-nums">
          <dt className="text-dim">今日の売上</dt>
          <dd>{fmt(t.sales)}円</dd>
          <dt className="text-dim">今日の仕入</dt>
          <dd>{fmt(t.purchases)}円</dd>
          <dt className="text-dim">記帳</dt>
          <dd>
            {t.correct}件（ノーヒント正解 {t.firstTry}件）
          </dd>
          <dt className="text-dim">最大コンボ</dt>
          <dd>{t.bestCombo}</dd>
          <dt className="text-dim">現金／普通預金</dt>
          <dd>
            {fmt(balance(state, "現金"))}円／{fmt(balance(state, "普通預金"))}円
          </dd>
        </dl>
      </div>
      <div className="flex gap-3 text-sm">
        <Portrait id="hoho" size={44} className="shrink-0" />
        <div>
          <p>{g.comment}</p>
          {tip && (
            <p className="mt-2 rounded bg-white/5 p-2">
              <span className="text-gold">今日の豆知識：</span>
              {tip}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3">
        <Btn onClick={onClose}>店を閉める</Btn>
      </div>
    </Win>
  );
}

interface Quiz {
  q: string;
  options: number[];
  answer: number;
  explain: string;
}

function shuffle<T>(xs: T[], seed: number): T[] {
  const a = [...xs];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function uniqueOptions(answer: number, distractors: number[]): number[] {
  const opts = [answer];
  for (const d of [...distractors, answer + 5000, answer - 3000, answer + 12000]) {
    if (opts.length >= 3) break;
    if (!opts.includes(d) && d >= 0) opts.push(d);
  }
  return opts;
}

function makeQuizzes(state: GameState): Quiz[] {
  const s = statements(entriesOf(state));
  const rev = sumAmounts(s.revenues);
  const exp = sumAmounts(s.expenses);
  const purchase = s.expenses.find((e) => e.account === "仕入")?.amount ?? 0;
  const q1: Quiz = {
    q: "試算表を見て答えよう。今期ここまでの当期純利益（収益 − 費用）はいくら？",
    answer: s.netIncome,
    options: shuffle(uniqueOptions(s.netIncome, [rev, rev - purchase]), state.day),
    explain:
      `収益の合計 ${fmt(rev)}円 − 費用の合計 ${fmt(exp)}円 = ${fmt(s.netIncome)}円。仕入以外の費用（家賃など）も忘れずに引くのじゃ。` +
      (s.netIncome < 0 && Object.values(state.stock).some((v) => v > 0)
        ? "赤字に見えるのは、まだ棚にある売れ残りの仕入も費用に入っているからじゃ。売れ残りの分は決算でまとめて調整する。それまでは気にせんでよい。"
        : ""),
  };
  const ar = balance(state, "売掛金");
  const cash = balance(state, "現金");
  const dep = balance(state, "普通預金");
  const q2: Quiz =
    ar > 0
      ? {
          q: "まだ回収していないツケ（売掛金）の残高はいくら？",
          answer: ar,
          options: shuffle(uniqueOptions(ar, [cash, balance(state, "買掛金")]), state.day + 1),
          explain: "試算表の売掛金の行（借方残高）を見ればわかる。売掛金は資産だから、残高は借方に出るのじゃ。",
        }
      : {
          q: "普通預金の残高はいくら？",
          answer: dep,
          options: shuffle(uniqueOptions(dep, [cash, 300000]), state.day + 1),
          explain: "試算表の普通預金の行（借方残高）を見ればわかる。資産の残高は借方に出るのじゃ。",
        };
  return [q1, q2];
}

export function MonthEndPanel({
  state,
  answered,
  onAnswer,
  onNext,
}: {
  state: GameState;
  answered: (boolean | null)[];
  onAnswer: (i: number, correct: boolean) => void;
  onNext: () => void;
}) {
  const quizzes = useMemo(() => makeQuizzes(state), [state.day]);
  const [picked, setPicked] = useState<(number | null)[]>([null, null]);
  return (
    <Win title="月末の締め：残高試算表">
      <p className="mb-2 text-sm">
        月末には、すべての勘定の残高を一覧にした「試算表」をつくる。借方の合計と貸方の合計が一致すれば、記帳の左右に漏れがない証拠じゃ。
      </p>
      <div className="mb-3 rounded border border-white/30 p-2">
        <TrialBalanceTable state={state} />
      </div>
      {quizzes.map((qz, i) => (
        <div key={i} className="mb-3 rounded border border-white/30 p-2 text-sm">
          <p className="mb-1">
            Q{i + 1}. {qz.q}
          </p>
          <div className="flex flex-wrap gap-2">
            {qz.options.map((o) => {
              const chosen = picked[i] === o;
              const reveal = answered[i] !== null;
              return (
                <Btn
                  key={o}
                  variant="ghost"
                  disabled={reveal}
                  className={reveal && o === qz.answer ? "border-ok! text-ok" : chosen ? "border-ng! text-ng" : ""}
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
      ))}
      <Btn onClick={onNext} disabled={answered.some((a) => a === null)}>
        翌月へ
      </Btn>
    </Win>
  );
}

export function LevelUpPanel({ level, onNext }: { level: number; onNext: () => void }) {
  return (
    <Win className="text-center">
      <p className="pop text-2xl text-gold">★ 店が成長した！ ★</p>
      <p className="mt-2">
        「{LEVELS[level - 1]?.name}」から「<span className="text-gold">{LEVELS[level].name}</span>」へ！
      </p>
      <ul className="mx-auto mt-3 max-w-sm text-left text-sm">
        <li>・ギルドの審査に合格し、通りに面した店舗を借りた（家賃 {fmt(LEVELS[level].rent)}円）</li>
        <li>・新商品「魔法の巻物」を扱えるようになった</li>
        <li>・取引先が増え、新しい講義が始まる</li>
      </ul>
      <div className="mt-4 flex justify-center gap-3">
        <Portrait id="hoho" size={56} />
        <p className="max-w-xs text-left text-sm">ホッホ、立派になったのう。ここからは「ツケ」の世界じゃ。帳簿の腕がますます試されるぞ。</p>
      </div>
      <div className="mt-4">
        <Btn onClick={onNext}>新しい店で開店する</Btn>
      </div>
    </Win>
  );
}
