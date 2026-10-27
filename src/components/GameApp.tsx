"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { balanceIn, netBalances } from "@/engine/ledger";
import type { AccountName } from "@/engine/accounts";
import { sumAmounts } from "@/engine/journal";
import { LEVELS, dateLabel } from "@/content/world";
import {
  advance,
  beginExam,
  examScore,
  finishExam,
  gradeExam,
  setExamAnswer,
  EXAM_PASS,
  answerMonthQuiz,
  choose,
  closeDay,
  newGame,
  nextDay,
  submitEntry,
  turnLessonPage,
  unlockedAccounts,
  takeHint,
} from "@/game/logic";
import {
  type CloudSyncStatus,
  type LocalSave,
  clearGame,
  fetchCloud,
  getPasscode,
  loadGame,
  pushCloud,
  saveGame,
  setPasscode,
  storageGet,
  storageSet,
} from "@/game/save";
import type { CharacterId, GameState } from "@/game/types";
import { BookModal } from "./BookModal";
import { ExamPanel } from "./ExamPanel";
import { type InputMode, JournalInput } from "./JournalInput";
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
const INPUT_KEY = "boki-quest-input";
const CLOUD_CHECKPOINTS = new Set(["dayStart", "dayEnd", "monthEnd", "levelUp"]);
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
    case "exam":
      return "luke";
    default:
      return undefined;
  }
}

type CloudStatus = CloudSyncStatus | "off" | "checking";

const CLOUD_LABEL: Record<CloudStatus, string> = {
  off: "未接続（この端末だけに保存）",
  checking: "確認中…",
  ok: "接続中（ほかの端末と同期）",
  unauthorized: "合言葉が違います",
  offline: "つながりません（この端末には保存されています）",
  conflict: "別の端末に新しいセーブがあります。タイトルから読み込み直してください",
};

function CloudPanel({ status, onConnect }: { status: CloudStatus; onConnect: (passcode: string) => void }) {
  const [passcode, setPasscodeInput] = useState("");
  return (
    <div className="mt-4 border-t border-white/20 pt-3 text-sm">
      <p className="mb-1">
        ☁ クラウド保存：<span className={status === "ok" ? "text-ok" : status === "off" ? "text-dim" : "text-ng"}>{CLOUD_LABEL[status]}</span>
      </p>
      {status !== "ok" && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (passcode.trim()) onConnect(passcode.trim());
          }}
        >
          <input
            value={passcode}
            onChange={(e) => setPasscodeInput(e.target.value)}
            placeholder="合言葉"
            aria-label="クラウド保存の合言葉"
            autoComplete="off"
            className="min-w-0 flex-1 rounded border-2 border-white/60 bg-black/30 px-3 py-1.5"
          />
          <Btn variant="ghost" type="submit">
            接続
          </Btn>
        </form>
      )}
    </div>
  );
}

function Title({
  saved,
  cloud,
  onContinue,
  onNew,
  onConnect,
}: {
  saved: LocalSave | null;
  cloud: CloudStatus;
  onContinue: () => void;
  onNew: (name: string) => void;
  onConnect: (passcode: string) => void;
}) {
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
              つづきから（{saved.state.shopName}・{LEVELS[saved.state.level].name}・{dateLabel(saved.state.day)}）
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
        <CloudPanel status={cloud} onConnect={onConnect} />
      </Win>
    </main>
  );
}

export default function GameApp() {
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<LocalSave | null>(null);
  const [cloud, setCloud] = useState<CloudStatus>("off");
  const passcodeRef = useRef("");
  // クラウドの版。保存するときに「この版から変更した」と伝え、別の端末の新しいセーブを上書きしないようにする
  const cloudRevRef = useRef(0);
  const [state, setState] = useState<GameState | null>(null);
  const [book, setBook] = useState(false);
  const [ledger, setLedger] = useState(false);
  const [sound, setSound] = useState(true);
  // 仕訳の入力方式。null なら Lv に合わせて自動（Lv3から本番と同じCBT形式）
  const [inputPref, setInputPref] = useState<InputMode | null>(null);

  /** クラウドにつなぎ、端末よりクラウドのセーブが新しければ「つづきから」をそちらにする */
  const connectCloud = async (passcode: string) => {
    setCloud("checking");
    const res = await fetchCloud(passcode);
    if (res.status !== "ok") {
      setCloud(res.status);
      return;
    }
    passcodeRef.current = passcode;
    cloudRevRef.current = res.savedAt;
    setPasscode(passcode);
    setCloud("ok");
    const remote = res.save;
    if (remote) setSaved((local) => (!local || remote.savedAt > local.savedAt ? remote : local));
  };

  useEffect(() => {
    setSaved(loadGame());
    const passcode = getPasscode();
    if (passcode) void connectCloud(passcode);
    const on = storageGet(SOUND_KEY) !== "off";
    setSound(on);
    setSoundEnabled(on);
    const pref = storageGet(INPUT_KEY);
    if (pref === "card" || pref === "cbt") setInputPref(pref);
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

  const pushToCloud = async (s: GameState) => {
    const res = await pushCloud(passcodeRef.current, s, cloudRevRef.current);
    if (res.savedAt) cloudRevRef.current = res.savedAt;
    if (res.status !== "ok") setCloud(res.status);
  };

  // クラウドへは、一日の始まりと終わり・月末・昇格・審査の採点のときだけ送る。細かな進み具合は端末に保存されている
  const checkpoint =
    state && (CLOUD_CHECKPOINTS.has(state.phase.kind) || (state.phase.kind === "exam" && state.phase.exam.graded))
      ? `${state.day}:${state.phase.kind}`
      : null;
  useEffect(() => {
    if (!state || !checkpoint || cloud !== "ok") return;
    const timer = setTimeout(() => void pushToCloud(state), 1000);
    return () => clearTimeout(timer);
    // 区切り（checkpoint）が変わったときだけ送るので、state そのものは依存に入れない
  }, [checkpoint, cloud]);

  // 帳簿の集計は仕訳が増えたときだけやり直す（審査の入力中などは使い回す）
  const journal = state?.journal;
  const entries = useMemo(() => (journal ?? []).map((r) => r.entry), [journal]);
  const net = useMemo(() => netBalances(entries), [entries]);
  const phase = state?.phase;
  const highlight = useMemo(
    () => (phase?.kind === "result" ? [...phase.info.tx.answer.debit, ...phase.info.tx.answer.credit].map((l) => l.account) : []),
    [phase],
  );

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
        cloud={cloud}
        onConnect={(passcode) => void connectCloud(passcode)}
        onContinue={() => saved && setState(saved.state)}
        onNew={(name) => {
          clearGame();
          setState(newGame(name, rand));
        }}
      />
    );
  }

  const inputMode: InputMode = inputPref ?? (LEVELS[state.level].cbt ? "cbt" : "card");
  const update = (f: (s: GameState) => GameState) => setState((s) => (s ? f(s) : s));
  const grade = () => {
    const graded = gradeExam(state);
    if (graded === state || graded.phase.kind !== "exam") return;
    play(examScore(graded.phase.exam) >= EXAM_PASS ? "correct" : "wrong");
    setState(graded);
  };
  const toggleInputMode = () => {
    const next: InputMode = inputMode === "cbt" ? "card" : "cbt";
    setInputPref(next);
    storageSet(INPUT_KEY, next);
  };
  const toggleSound = () => {
    const on = !sound;
    setSound(on);
    setSoundEnabled(on);
    storageSet(SOUND_KEY, on ? "on" : "off");
  };

  const p = state.phase;
  const cloudHealthy = cloud === "ok" || cloud === "checking";

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
          mode={inputMode}
          onToggleMode={toggleInputMode}
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
    case "exam":
      panel = (
        <ExamPanel
          exam={p.exam}
          accounts={unlockedAccounts(state)}
          onBegin={(now) => update((s) => beginExam(s, now))}
          onAnswer={(i, entry) => update((s) => setExamAnswer(s, i, entry))}
          onGrade={grade}
          onFinish={() => update((s) => finishExam(s, rand))}
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
              setSaved({ state, savedAt: saveGame(state) });
              if (cloud === "ok") void pushToCloud(state);
              setState(null);
            }}
            title="タイトルへ（自動保存済み）"
          >
            {LEVELS[state.level].name}「{state.shopName}」
          </button>
          <span className="text-sm">{dateLabel(state.day)}</span>
          <div className="ml-auto flex items-center gap-1.5">
            {cloud !== "off" && (
              <span className={`text-sm ${cloudHealthy ? "text-dim" : "text-ng"}`} title={CLOUD_LABEL[cloud]}>
                {cloudHealthy ? "☁" : "☁!"}
                <span className="sr-only">{CLOUD_LABEL[cloud]}</span>
              </span>
            )}
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
              <AnimatedNumber value={balanceIn(net, "現金")} />円
            </dd>
          </div>
          <div className="flex gap-1">
            <dt className="text-dim">普通預金</dt>
            <dd>
              <AnimatedNumber value={balanceIn(net, "普通預金")} />円
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
            <LedgerViz entries={entries} highlight={highlight} />
          </Win>
        </aside>
      </div>

      {book && <BookModal state={state} onClose={() => setBook(false)} />}
      {ledger && (
        <Modal title="帳簿のすがた" onClose={() => setLedger(false)}>
          <LedgerViz entries={entries} highlight={highlight} />
        </Modal>
      )}
    </div>
  );
}
