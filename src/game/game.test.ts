import { describe, expect, it } from "vitest";
import { isBalanced } from "@/engine/journal";
import { trialBalance } from "@/engine/ledger";
import { LESSONS, PREP_LEVEL } from "@/content/lessons";
import { ITEM_IDS } from "@/content/world";
import { ACCOUNTS, type AccountName, categoryOf } from "@/engine/accounts";
import { EXAM_BANK } from "@/content/examBank";
import { newAchievements } from "@/content/achievements";
import { LESSON_BY_ID } from "@/content/lessons";
import {
  advance,
  balance,
  beginExam,
  choose,
  closeDay,
  entriesOf,
  finishExam,
  finishReport,
  afterResult,
  startOrder,
  gradeExam,
  newGame,
  nextDay,
  setExamAnswer,
  submitEntry,
  turnLessonPage,
  unlockedAccounts,
} from "./logic";
import { seededRand } from "./random";
import { CREDIT_KINDS, type GameState } from "./types";

function checkInvariants(s: GameState) {
  for (const id of ITEM_IDS) expect(s.stock[id]).toBeGreaterThanOrEqual(0);
  expect(balance(s, "現金")).toBeGreaterThanOrEqual(0);
  expect(balance(s, "普通預金")).toBeGreaterThanOrEqual(0);
  for (const kind of CREDIT_KINDS) {
    const sum = s.credits.filter((c) => c.kind === kind).reduce((a, c) => a + c.amount, 0);
    expect(sum, `${kind} の追跡額と帳簿が食い違う`).toBe(balance(s, kind));
  }
  const tb = trialBalance(entriesOf(s));
  expect(tb.reduce((a, r) => a + r.debit, 0)).toBe(tb.reduce((a, r) => a + r.credit, 0));
}

/** ランダムに選択しながら、正解を入力して days 日間プレイする */
function play(seed: number, days: number, mistakeRate = 0) {
  const rand = seededRand(seed);
  let s = newGame("テスト商店", rand);
  const seenTemplates = new Set<string>();
  let steps = 0;
  while (s.day <= days) {
    if (++steps > 20000) throw new Error("進行が止まった");
    const p = s.phase;
    switch (p.kind) {
      case "dayStart":
      case "lessonDone":
      case "reply":
      case "result":
        s = advance(s, rand);
        break;
      case "levelUp":
        s = { ...s, phase: { kind: "dayStart" } };
        break;
      case "lesson":
        s = turnLessonPage(s, 1);
        break;
      case "event": {
        const enabled = p.event.choices.map((c, i) => [c, i] as const).filter(([c]) => !c.disabled);
        expect(enabled.length, `${p.event.templateId} に選べる選択肢がない`).toBeGreaterThan(0);
        const [, idx] = enabled[Math.floor(rand() * enabled.length)];
        s = choose(s, idx, rand);
        break;
      }
      case "journal": {
        const { tx, templateId } = p.session;
        seenTemplates.add(templateId);
        expect(isBalanced(tx.answer), `${templateId}: ${tx.exam}`).toBe(true);
        const unlocked = new Set(unlockedAccounts(s));
        for (const l of [...tx.answer.debit, ...tx.answer.credit]) {
          expect(unlocked.has(l.account), `${templateId} が未習得の科目 ${l.account} を使う`).toBe(true);
          expect(Number.isInteger(l.amount) && l.amount > 0).toBe(true);
        }
        if (p.session.attempts === 0 && rand() < mistakeRate) {
          s = submitEntry(s, { debit: tx.answer.credit, credit: tx.answer.debit });
        } else {
          s = submitEntry(s, tx.answer);
          checkInvariants(s);
        }
        break;
      }
      case "dayEnd":
        s = closeDay(s, rand);
        break;
      case "monthEnd":
        s = nextDay(s, rand);
        break;
      case "worksheet":
        s = advance(s, rand);
        break;
      case "report": {
        s = finishReport(s, rand);
        // 損益振替のあと、収益・費用の残高はすべてゼロになる
        for (const a of Object.keys(ACCOUNTS) as AccountName[]) {
          const cat = categoryOf(a);
          if (cat === "revenue" || cat === "expense") expect(balance(s, a), `${a} が振替後に残っている`).toBe(0);
        }
        expect(balance(s, "損益")).toBe(0);
        break;
      }
      case "exam": {
        // 審査はすべて正解して進む
        const e = p.exam;
        if (e.startedAt === null) s = beginExam(s, 0);
        else if (!e.graded) {
          e.questions.forEach((q, i) => (s = setExamAnswer(s, i, q.answer)));
          s = gradeExam(s);
        } else s = finishExam(s, rand);
        break;
      }
    }
  }
  return { s, seenTemplates };
}

describe("採点", () => {
  function atFirstJournal() {
    const rand = seededRand(1);
    let s = newGame("テスト商店", rand);
    while (s.phase.kind !== "journal") {
      s = s.phase.kind === "lesson" ? turnLessonPage(s, 1) : s.phase.kind === "event" ? choose(s, 0, rand) : advance(s, rand);
    }
    // 練習扱いを外して、通常の取引として採点する
    return { ...s, phase: { ...s.phase, session: { ...s.phase.session, guided: false, hints: 0 } } } as GameState;
  }

  it("空欄のまま記帳しても減点しない", () => {
    const s = atFirstJournal();
    const next = submitEntry(s, { debit: [], credit: [] });
    expect(next.trust).toBe(s.trust);
    expect(next.mistakes).toHaveLength(0);
    expect(next.phase.kind === "journal" && next.phase.session.attempts).toBe(0);
  });

  it("間違えると信用−2、自力で直すと+1", () => {
    const s = atFirstJournal();
    if (s.phase.kind !== "journal") throw new Error();
    const { answer } = s.phase.session.tx;
    const miss = submitEntry(s, { debit: answer.credit, credit: answer.debit });
    expect(miss.trust).toBe(s.trust - 2);
    const fixed = submitEntry(miss, answer);
    expect(fixed.trust).toBe(s.trust - 1);
  });
});

describe("通しプレイ", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])("seed %i：200日間、帳簿とゲーム状態が矛盾しない", (seed) => {
    const { s } = play(seed, 200, 0.2);
    checkInvariants(s);
  }, 60000);

  it("全講義を受け、主要な取引がひととおり登場する", () => {
    const seen = new Set<string>();
    let last: GameState | undefined;
    for (let seed = 1; seed <= 8; seed++) {
      const r = play(seed, 200);
      r.seenTemplates.forEach((t) => seen.add(t));
      last = r.s;
    }
    expect(last!.level).toBe(5);
    // 試験対策の講義は、朝の「試験対策」から自分で受ける
    expect([...last!.lessonsDone].sort()).toEqual(LESSONS.filter((l) => l.level !== PREP_LEVEL).map((l) => l.id).sort());
    for (const t of [
      "founding",
      "withdraw",
      "wholesale",
      "wholesale-credit",
      "wholesale-freight",
      "customer",
      "customer-credit",
      "supplies",
      "rent",
      "utility",
      "collect",
      "pay-supplier",
      "purchase-return",
      "sales-return",
      "order-staff",
      "advance-dwarf",
      "receive-staff",
      "deliver-staff",
      "cashdiff",
      "cashdiff-resolve",
      "open-checking",
      "customer-note",
      "note-due",
      "pay-by-note",
      "note-pay-due",
      "erecord-receive",
      "erecord-due",
      "erecord-pay",
      "erecord-pay-due",
      "card-sale",
      "card-collect",
      "giftcert-sale",
      "giftcert-redeem",
      "buy-fixture",
      "pay-payable",
      "petty-advance",
      "petty-report",
      "petty-replenish",
      "bank-loan",
      "loan-repay",
      "lend-allen",
      "loan-collect",
      "move-in",
      "buy-wagon",
      "buy-register",
      "noel-advance",
      "payday",
      "pay-income-tax",
      "pay-insurance",
      "trip-advance",
      "trip-settle",
      "unknown-deposit",
      "unknown-resolve",
      "close-cogs-open",
      "close-cogs-end",
      "close-allowance",
      "close-dep-fixture",
      "close-dep-vehicle",
      "close-prepaid",
      "close-unpaid-interest",
      "close-accrued-interest",
      "close-supplies",
      "close-cashdiff",
      "close-tax",
      "bad-debt",
      "insurance",
      "pay-corp-tax",
      "reverse-prepaid",
      "reverse-unpaid-interest",
      "reverse-accrued-interest",
      "reverse-supplies",
      "close-salestax",
      "pay-sales-tax",
      "interim-tax",
      "dividend-decide",
      "dividend-pay",
      "repair",
      "invoice-purchase",
      "time-deposit",
      "time-deposit-mature",
      "attic-rent",
      "close-unearned-rent",
      "reverse-unearned-rent",
      "guild-notesloan",
      "guild-fixedsale",
      "guild-advanced",
    ]) {
      expect(seen.has(t), `${t} が一度も登場しない`).toBe(true);
    }
  }, 120000);
});

describe("審査の問題", () => {
  it("すべての正解が貸借一致し、出題する講義までに習う科目だけを使う", () => {
    for (const q of EXAM_BANK) {
      expect(isBalanced(q.answer), q.text).toBe(true);
      // 決算の講義（Lv0）は決算日に受けるので、それまでのすべての科目を使える
      const level = LESSON_BY_ID[q.lesson].level || Infinity;
      const learned = new Set(
        Object.values(LESSON_BY_ID)
          .filter((l) => l.level <= level)
          .flatMap((l) => l.accounts),
      );
      for (const l of [...q.answer.debit, ...q.answer.credit]) expect(learned.has(l.account), `${q.text} → ${l.account}`).toBe(true);
    }
  });
});

describe("朝の仕入れ注文", () => {
  it("注文して記帳すると在庫がふえ、朝の画面に戻る", () => {
    const rand = seededRand(1);
    let s = newGame("テスト商店", rand);
    // 2日目の朝まで進める
    while (!(s.day === 2 && s.phase.kind === "dayStart")) {
      const p = s.phase;
      if (p.kind === "lesson") s = turnLessonPage(s, 1);
      else if (p.kind === "event") s = choose(s, p.event.choices.findIndex((c) => !c.disabled), rand);
      else if (p.kind === "journal") s = submitEntry(s, p.session.tx.answer);
      else if (p.kind === "dayEnd") s = closeDay(s, rand);
      else s = advance(s, rand);
    }
    const before = s.stock.potion;
    s = startOrder(s, "potion", 10, "普通預金");
    if (s.phase.kind !== "journal") throw new Error("注文の記帳に進まない");
    s = submitEntry(s, s.phase.session.tx.answer);
    s = afterResult(s, rand);
    expect(s.phase.kind).toBe("dayStart");
    expect(s.stock.potion).toBe(before + 10);
    expect(s.journal.at(-1)?.entry).toEqual({ debit: [{ account: "仕入", amount: 6000 }], credit: [{ account: "普通預金", amount: 6000 }] });
  });
});

describe("実績", () => {
  it("通しプレイで、店の成長や決算の実績が取れる", () => {
    const { s } = play(1, 130);
    const ids = newAchievements(s).map((a) => a.id);
    for (const id of ["founded", "lv2", "lv5", "closing", "sales1m"]) expect(ids, id).toContain(id);
  }, 60000);
});
