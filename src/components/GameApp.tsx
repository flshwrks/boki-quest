"use client";

import { useEffect, useState } from "react";
import type { AccountName } from "@/engine/accounts";
import { sumAmounts } from "@/engine/journal";
import { LEVELS, dateLabel } from "@/content/world";
import {
  advance,
  answerMonthQuiz,
  balance,
  choose,
  closeDay,
  entriesOf,
  newGame,
  nextDay,
  submitEntry,
  turnLessonPage,
  unlockedAccounts,
  takeHint,
} from "@/game/logic";
import { clearGame, loadGame, saveGame } from "@/game/save";
import type { CharacterId, GameState } from "@/game/types";
import { BookModal } from "./BookModal";
import { JournalInput } from "./JournalInput";
import { LedgerViz } from "./LedgerViz";
import { LessonView } from "./LessonView";
import {
  DayEndPanel,
  DayStartPanel,
  EventPanel,
  LessonDonePanel,
  LevelUpPanel,
  MonthEndPanel,
  ReplyPanel,
  ResultPanel,
} from "./Panels";
import { Scene, type SceneFx, type TimeOfDay } from "./Scene";
import { play, setSoundEnabled } from "./sfx";
import { AnimatedNumber, Btn, Modal, Portrait, Win, fmt } from "./ui";

const SOUND_KEY = "boki-quest-sound";
const DEFAULT_SHOP = "星のしずく";
const rand = Math.random;

/** 場面に合わせた時間帯・感情アイコン・お金のポップアップ */
function sceneOf(state: GameState): { time: TimeOfDay; fx: SceneFx } {
  const p = state.phase;
  switch (p.kind) {
    case "dayStart":
      return { time: "morning", fx: { banner: dateLabel(state.day) } };
    case "dayEnd":
    case "monthEnd":
      return { time: "evening", fx: {} };
    case "event":
      return { time: "day", fx: { emote: p.event.speaker === "hoho" ? undefined : "！" } };
    case "journal":
      return { time: "day", fx: { emote: "…" } };
    case "reply":
      return { time: "day", fx: { emote: "💭" } };
    case "result": {
      const { debit, credit } = p.info.tx.answer;
      const isMoney = (a: AccountName) => a === "現金" || a === "普通預金";
      const delta = sumAmounts(debit.filter((l) => isMoney(l.account))) - sumAmounts(credit.filter((l) => isMoney(l.account)));
      const popup =
        delta === 0 ? undefined : { key: state.journal.length, text: `${delta > 0 ? "+" : "−"}${fmt(Math.abs(delta))}円`, good: delta > 0 };
      return { time: "day", fx: { emote: "♪", popup } };
    }
    default:
      return { time: "day", fx: {} };
  }
}

function speakerOf(state: GameState): CharacterId | undefined {
  const p = state.phase;
  switch (p.kind) {
    case "event":
      return p.event.speaker;
    case "reply":
      return p.speaker;
    case "journal":
      return p.session.speaker;
    case "result":
      return p.speaker;
    case "lesson":
      return "hoho";
    default:
      return undefined;
  }
}

function Title({ saved, onContinue, onNew }: { saved: GameState | null; onContinue: () => void; onNew: (name: string) => void }) {
  const [name, setName] = useState(DEFAULT_SHOP);
  const submitName = () => onNew(name.trim() || DEFAULT_SHOP);
  const [confirming, setConfirming] = useState(false);
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <div className="mb-3 flex items-end justify-center gap-3">
          <Portrait id="gantetsu" size={56} />
          <Portrait id="hoho" size={72} className="bob" />
          <Portrait id="allen" size={56} />
        </div>
        <h1 className="text-4xl text-gold sm:text-5xl">ボキクエ</h1>
        <p className="mt-1 text-dim">〜 道具屋の帳簿 〜</p>
        <p className="mt-3 text-sm">道具屋を経営しながら、日商簿記3級を身につけよう</p>
      </div>
      <Win className="w-full">
        {saved && !confirming && (
          <div className="mb-4">
            <Btn className="w-full" onClick={onContinue}>
              つづきから（{saved.shopName}・{dateLabel(saved.day)}）
            </Btn>
          </div>
        )}
        {confirming ? (
          <div className="text-sm">
            <p className="mb-3">いまのセーブデータは消えてしまうぞ。本当にはじめからにするかの？</p>
            <div className="flex gap-2">
              <Btn onClick={submitName}>はじめからにする</Btn>
              <Btn variant="ghost" onClick={() => setConfirming(false)}>
                やめる
              </Btn>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (saved) setConfirming(true);
              else submitName();
            }}
          >
            <label className="mb-1 block text-sm" htmlFor="shop">
              お店の名前
            </label>
            <input
              id="shop"
              value={name}
              maxLength={12}
              onChange={(e) => setName(e.target.value)}
              className="mb-3 w-full rounded border-2 border-white/60 bg-black/30 px-3 py-2"
            />
            <button type="submit" className="w-full rounded border-2 border-gold px-4 py-2 text-gold hover:bg-gold/10">
              はじめから
            </button>
          </form>
        )}
      </Win>
    </main>
  );
}

export default function GameApp() {
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<GameState | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [book, setBook] = useState(false);
  const [ledger, setLedger] = useState(false);
  const [sound, setSound] = useState(true);

  useEffect(() => {
    setSaved(loadGame());
    try {
      const on = localStorage.getItem(SOUND_KEY) !== "off";
      setSound(on);
      setSoundEnabled(on);
    } catch {
      // 既定値（音あり）のまま
    }
    setLoaded(true);
  }, []);

  // 操作のたびに書き込まず、少し待ってからまとめて保存する。タブを閉じる前には必ず保存する
  useEffect(() => {
    if (!state) return;
    const timer = setTimeout(() => saveGame(state), 400);
    const flush = () => saveGame(state);
    window.addEventListener("pagehide", flush);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pagehide", flush);
    };
  }, [state]);

  const prevPhase = state?.phase.kind;
  useEffect(() => {
    if (prevPhase === "result") play("correct");
    if (prevPhase === "levelUp") play("fanfare");
  }, [prevPhase]);

  if (!loaded) return null;
  if (!state) {
    return (
      <Title
        saved={saved}
        onContinue={() => setState(saved)}
        onNew={(name) => {
          clearGame();
          setState(newGame(name, rand));
        }}
      />
    );
  }

  const update = (f: (s: GameState) => GameState) => setState((s) => (s ? f(s) : s));
  const toggleSound = () => {
    const on = !sound;
    setSound(on);
    setSoundEnabled(on);
    try {
      localStorage.setItem(SOUND_KEY, on ? "on" : "off");
    } catch {
      // 保存できなくても切り替えは効く
    }
  };

  const p = state.phase;
  const highlight =
    p.kind === "result" ? [...p.info.tx.answer.debit, ...p.info.tx.answer.credit].map((l) => l.account) : [];

  let panel: React.ReactNode;
  switch (p.kind) {
    case "dayStart":
      panel = <DayStartPanel state={state} onOpen={() => update((s) => advance(s, rand))} />;
      break;
    case "lesson":
      panel = <LessonView lessonId={p.lesson} page={p.page} onTurn={(d) => update((s) => turnLessonPage(s, d))} />;
      break;
    case "lessonDone":
      panel = <LessonDonePanel lesson={p.lesson} onNext={() => update((s) => advance(s, rand))} />;
      break;
    case "event":
      panel = <EventPanel key={state.journal.length + p.event.templateId} event={p.event} onChoose={(i) => update((s) => choose(s, i, rand))} />;
      break;
    case "reply":
      panel = <ReplyPanel text={p.text} onNext={() => update((s) => advance(s, rand))} />;
      break;
    case "journal":
      panel = (
        <JournalInput
          key={state.journal.length}
          session={p.session}
          accounts={unlockedAccounts(state)}
          onHint={() => update(takeHint)}
          onSubmit={(entry) => {
            const next = submitEntry(state, entry);
            if (next.phase.kind === "journal") play("wrong");
            setState(next);
          }}
        />
      );
      break;
    case "result":
      panel = <ResultPanel info={p.info} state={state} highlight={highlight} onNext={() => update((s) => advance(s, rand))} />;
      break;
    case "dayEnd":
      panel = <DayEndPanel state={state} onClose={() => update(closeDay)} />;
      break;
    case "monthEnd":
      panel = (
        <MonthEndPanel
          state={state}
          answered={p.answered}
          onAnswer={(i, ok) => {
            play(ok ? "correct" : "wrong");
            update((s) => answerMonthQuiz(s, i, ok));
          }}
          onNext={() => update((s) => nextDay(s, rand))}
        />
      );
      break;
    case "levelUp":
      panel = <LevelUpPanel level={p.level} onNext={() => update((s) => ({ ...s, phase: { kind: "dayStart" } }))} />;
      break;
  }

  const stars = "★".repeat(Math.round(state.reputation / 20)).padEnd(5, "☆");

  return (
    <div className="mx-auto max-w-6xl px-3 pb-10 sm:px-4">
      <header className="sticky top-0 z-40 -mx-3 mb-3 border-b-2 border-white/20 bg-night/95 px-3 py-2 backdrop-blur sm:-mx-4 sm:px-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <button
            type="button"
            className="text-gold"
            onClick={() => {
              saveGame(state);
              setSaved(state);
              setState(null);
            }}
            title="タイトルへ（自動保存済み）"
          >
            {LEVELS[state.level].name}「{state.shopName}」
          </button>
          <span className="text-sm">{dateLabel(state.day)}</span>
          <div className="ml-auto flex gap-1.5">
            <Btn variant="ghost" className="text-sm" onClick={() => setBook(true)}>
              📖 簿記の書
            </Btn>
            <Btn variant="ghost" className="text-sm lg:hidden" onClick={() => setLedger(true)}>
              📊 帳簿
            </Btn>
            <Btn variant="ghost" className="text-sm" onClick={toggleSound} sound={null}>
              {sound ? "♪" : "×♪"}
              <span className="sr-only">{sound ? "音を消す" : "音を出す"}</span>
            </Btn>
          </div>
        </div>
        <dl className="mt-1 flex flex-wrap gap-x-4 text-xs tabular-nums sm:text-sm">
          <div className="flex gap-1">
            <dt className="text-dim">現金</dt>
            <dd>
              <AnimatedNumber value={balance(state, "現金")} />円
            </dd>
          </div>
          <div className="flex gap-1">
            <dt className="text-dim">普通預金</dt>
            <dd>
              <AnimatedNumber value={balance(state, "普通預金")} />円
            </dd>
          </div>
          <div className="flex gap-1">
            <dt className="text-dim">信用</dt>
            <dd>{state.trust}</dd>
          </div>
          <div className="flex gap-1">
            <dt className="text-dim">評判</dt>
            <dd className="text-gold" aria-label={`評判${state.reputation}`}>
              {stars}
            </dd>
          </div>
          {state.combo >= 2 && (
            <div key={state.combo} className="pop text-gold">
              🔥{state.combo}コンボ中
            </div>
          )}
        </dl>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <main className="flex min-w-0 flex-col gap-3">
          <Scene state={state} speaker={speakerOf(state)} {...sceneOf(state)} />
          <div key={p.kind} className="rise">
            {panel}
          </div>
        </main>
        <aside className="hidden lg:block">
          <Win title="帳簿のすがた" className="sticky top-28">
            <LedgerViz entries={entriesOf(state)} highlight={highlight} />
          </Win>
        </aside>
      </div>

      {book && <BookModal state={state} onClose={() => setBook(false)} />}
      {ledger && (
        <Modal title="帳簿のすがた" onClose={() => setLedger(false)}>
          <LedgerViz entries={entriesOf(state)} highlight={highlight} />
        </Modal>
      )}
    </div>
  );
}
