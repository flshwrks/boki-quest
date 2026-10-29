"use client";

import type { UpgradeId, UpgradePay } from "@/content/upgrades";
import { useMemo, useState } from "react";
import { sumAmounts } from "@/engine/journal";
import { statements } from "@/engine/ledger";
import { LESSONS, LESSON_BY_ID, isMakeUp, lessonsForLevel } from "@/content/lessons";
import { ACCOUNT_INFO } from "@/content/accountInfo";
import { LEVELS, dateLabel, fiscalYear } from "@/content/world";
import { LEVEL_UP, autoPostedToday, balance, businessDays, canAutoPost, entriesOf, expectedCustomers, reviewTopics, todaysLesson, totalSales } from "@/game/logic";
import type { PurchasePay } from "@/content/events";
import type { AccountName } from "@/engine/accounts";
import type { GameEvent, GameState, ItemId, LessonId, ResultInfo } from "@/game/types";
import { OrderPanel } from "./OrderPanel";
import { UpgradePanel } from "./UpgradePanel";
import { TrialBalanceTable } from "./BookModal";
import { type Quiz, QuizList, quizOptions } from "./Quiz";
import { LedgerViz } from "./LedgerViz";
import { AccountChip, AnswerExplain, Btn, Dialogue, EntryTable, Portrait, Speaker, Win, fmt } from "./ui";

export function DayStartPanel({
  state,
  onOpen,
  onOrder,
  onTraining,
  onToggleAutoPost,
  onUpgrade,
}: {
  state: GameState;
  onOpen: () => void;
  onOrder: (item: ItemId, qty: number, pay: PurchasePay) => void;
  onTraining: () => void;
  onToggleAutoPost: () => void;
  onUpgrade: (id: UpgradeId, pay: UpgradePay) => void;
}) {
  const lesson = todaysLesson(state);
  const lessons = lessonsForLevel(state.level);
  const review = reviewTopics(state);
  const days = businessDays(state);
  const goal = LEVEL_UP[state.level];
  const next = LEVELS[state.level + 1];
  if (state.closingFrom !== null) {
    return (
      <Win title={`${fiscalYear(state.day)}年目の決算日`}>
        <div className="mb-3 flex gap-3 text-sm">
          <Portrait id="hoho" size={48} className="shrink-0" />
          <p>
            1年間おつかれさまじゃった。今日はお店を休んで、1年分の帳簿を整理する「決算」をするぞ。売上原価、貸倒れの見込み、設備の目減り、まだ払っていない利息…。最後に精算表と財務諸表で、この1年の成績を確かめよう。
          </p>
        </div>
        <Btn onClick={onOpen}>決算を始める</Btn>
      </Win>
    );
  }
  return (
    <Win title={`${dateLabel(state.day)} の朝`}>
      <ul className="mb-3 text-sm">
        {lesson && (
          <li>
            📖 今日の講義：<span className="text-gold">{LESSON_BY_ID[lesson].title}</span>
            {isMakeUp(LESSON_BY_ID[lesson], state.level) && <span className="ml-1 text-xs text-dim">（補講：あとから追加された内容）</span>}
          </li>
        )}
        <li>🧑‍🤝‍🧑 来店予定の冒険者：およそ {expectedCustomers(state)} 人（評判が上がると増える）</li>
        {review.length > 0 && (
          <li>
            🔁 今日の復習：<span className="text-gold">{review.map((id) => LESSON_BY_ID[id].title).join("・")}</span>
          </li>
        )}
      </ul>
      {goal && next && days > 1 && (
        <div className="mb-3 rounded-lg border border-white/30 p-2 text-sm">
          <div className="mb-1 text-gold">
            「{next.name}」へ成長する条件（そろうと翌朝{next.exam}）
          </div>
          <Goal label={`Lv${state.level}の講義をすべて受ける`} now={lessons.filter((l) => state.lessonsDone.includes(l.id)).length} target={lessons.length} />
          {goal.requires?.map((id) => (
            <Goal key={id} label={`「${LESSON_BY_ID[id].title}」を学ぶ`} now={state.lessonsDone.includes(id) ? 1 : 0} target={1} unit="回" />
          ))}
          <Goal label="売上の累計" now={totalSales(state)} target={goal.sales} unit="円" />
          <Goal label="帳簿の信用" now={state.trust} target={goal.trust} />
          <Goal label="営業日数" now={days} target={goal.days} unit="日目" />
          {state.examRetryDay > state.day && <p className="mt-1 text-xs text-dim">審査の再挑戦は {dateLabel(state.examRetryDay)} から</p>}
        </div>
      )}
      {!goal && lessons.every((l) => state.lessonsDone.includes(l.id)) && (
        <p className="mb-3 rounded-lg border border-white/30 p-2 text-sm">
          {state.level >= 5
            ? "3級の講義はすべて修了じゃ！ 「試験対策」の講義2つを受けたら、模擬試験に挑戦してみよう。店を回して仕訳を体に覚えさせるのも大事じゃぞ。"
            : `Lv${state.level}の講義はすべて修了！ 次の成長は、次のアップデートで解禁予定じゃ。それまで店を回して腕を磨こう。`}
        </p>
      )}
      {state.lessonsDone.includes("trade") && <OrderPanel state={state} onOrder={onOrder} />}
      <UpgradePanel state={state} onBuy={onUpgrade} />
      {canAutoPost(state) && (
        <label className="mb-3 flex cursor-pointer items-start gap-2 rounded-lg border border-white/30 p-2 text-sm">
          <input type="checkbox" checked={state.autoPost} onChange={onToggleAutoPost} className="mt-1" />
          <span>
            慣れた決済は、見習いのノエルに記帳してもらう
            <span className="block text-xs text-dim">
              期日の決済・ツケの回収・給料の支払いなど、習熟度が★3の論点の決まった取引と、朝の仕入れ（商品売買が★3のとき。掛けなら掛け取引も★3）。消費税は1日2件（消費税が★3なら1件）自分で書いたら、残りはノエルが書き足す。復習の取引は自分で記帳する。ノエルが書いた仕訳は閉店のときに見せてくれる（正誤の記録には数えない）
            </span>
          </span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Btn onClick={onOpen}>開店する！</Btn>
        {days > 1 && (
          <Btn variant="ghost" onClick={onTraining}>
            📚 試験対策
          </Btn>
        )}
      </div>
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
      <Dialogue text={event.lines.join("\n")}>
        {event.guided && <p className="mt-2 text-xs text-gold">✦ 講義の練習：ヒントを1つ無料で見られる</p>}
        <div className="rise mt-3 flex flex-col gap-1.5 border-t border-white/20 pt-3">
          {event.choices.map((c, i) => (
            <Btn key={c.label} variant="choice" disabled={!!c.disabled} onClick={() => onChoose(i)}>
              {c.label}
              {c.disabled && <span className="ml-2 text-xs text-ng">（{c.disabled}）</span>}
            </Btn>
          ))}
        </div>
      </Dialogue>
    </Win>
  );
}

export function ReplyPanel({ text, onNext }: { text: string; onNext: () => void }) {
  return (
    <Win>
      <Dialogue text={text}>
        <div className="mt-3">
          <Btn onClick={onNext}>つぎへ</Btn>
        </div>
      </Dialogue>
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
      <div className="mb-2 flex items-center gap-3">
        <span className="stamp h-14 w-14 shrink-0 text-lg" aria-hidden>
          記帳
        </span>
        <p className="pop text-xl text-ok">{info.firstTry ? "ノーヒントで正解！" : "正解！"}</p>
      </div>
      <AnswerExplain entry={tx.answer} />
      {tx.note && (
        <div className="mt-2 flex gap-2 text-sm">
          <Portrait id="hoho" size={32} className="shrink-0" />
          <p>{tx.note}</p>
        </div>
      )}
      {tx.withTax && (
        <div className="mt-2 flex gap-2 text-sm">
          <Portrait id="noel" size={32} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p>ノエル「消費税の行は、ぼくが書き足しておきました！ 帳簿にはこう載ります」</p>
            <EntryTable entry={tx.withTax.answer} />
          </div>
        </div>
      )}
      <p className="mt-2 text-sm text-dim">
        帳簿の信用 {info.trustDelta > 0 ? <span className="text-ok">+{info.trustDelta}</span> : info.trustDelta < 0 ? <span className="text-ng">{info.trustDelta}</span> : "±0"}
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
  const auto = useMemo(() => autoPostedToday(state), [state.journal, state.day]);
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
      {auto.length > 0 && (
        <details className="mb-3 rounded-lg border border-white/30 p-2 text-sm" open>
          <summary className="cursor-pointer">
            <Portrait id="noel" size={24} className="mr-1 inline-block align-middle" still />
            ノエルが記帳した取引（{auto.length}件）。仕訳を確かめておこう
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {auto.map((r) => (
              <li key={`${r.templateId}-${r.exam}`}>
                <p className="mb-1 text-xs">{r.exam}</p>
                <EntryTable entry={r.entry} />
              </li>
            ))}
          </ul>
        </details>
      )}
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

function makeQuizzes(state: GameState): Quiz[] {
  const s = statements(entriesOf(state));
  const rev = sumAmounts(s.revenues);
  const exp = sumAmounts(s.expenses);
  const purchase = s.expenses.find((e) => e.account === "仕入")?.amount ?? 0;
  const q1: Quiz = {
    q: "試算表を見て答えよう。今期ここまでの当期純利益（収益 − 費用）はいくら？",
    answer: s.netIncome,
    options: quizOptions(s.netIncome, [rev, rev - purchase], state.day),
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
          options: quizOptions(ar, [cash, balance(state, "買掛金")], state.day + 1),
          explain: "試算表の売掛金の行（借方残高）を見ればわかる。売掛金は資産だから、残高は借方に出るのじゃ。",
        }
      : {
          q: "普通預金の残高はいくら？",
          answer: dep,
          options: quizOptions(dep, [cash, 300000], state.day + 1),
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
  return (
    <Win title="月末の締め：残高試算表">
      <p className="mb-2 text-sm">
        月末には、すべての勘定の残高を一覧にした「試算表」をつくる。借方の合計と貸方の合計が一致すれば、記帳の左右に漏れがない証拠じゃ。
      </p>
      <div className="mb-3 rounded border border-white/30 p-2">
        <TrialBalanceTable state={state} />
      </div>
      <QuizList quizzes={quizzes} answered={answered} onAnswer={onAnswer} />
      <Btn onClick={onNext} disabled={answered.some((a) => a === null)}>
        翌月へ
      </Btn>
    </Win>
  );
}

export function LevelUpPanel({ level, onNext }: { level: number; onNext: () => void }) {
  return (
    <Win className="text-center">
      <p className="pop text-2xl text-gold">
        <span className="twinkle inline-block">✦</span> 店が成長した！ <span className="twinkle inline-block" style={{ animationDelay: "0.7s" }}>✦</span>
      </p>
      <p className="mt-2">
        「{LEVELS[level - 1]?.name}」から「<span className="text-gold">{LEVELS[level].name}</span>」へ！
      </p>
      <ul className="mx-auto mt-3 max-w-sm text-left text-sm">
        {LEVELS[level].perks.map((p) => (
          <li key={p}>・{p}</li>
        ))}
        <li>・家賃は月{fmt(LEVELS[level].rent)}円になる</li>
      </ul>
      <div className="mt-4 flex justify-center gap-3">
        <Portrait id="hoho" size={56} />
        <p className="max-w-xs text-left text-sm">{LEVELS[level].hoho}</p>
      </div>
      <div className="mt-4">
        <Btn onClick={onNext}>新しい店で開店する</Btn>
      </div>
    </Win>
  );
}
