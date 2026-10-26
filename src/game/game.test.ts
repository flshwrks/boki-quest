import { describe, expect, it } from "vitest";
import { isBalanced } from "@/engine/journal";
import { trialBalance } from "@/engine/ledger";
import { LESSONS } from "@/content/lessons";
import { ITEM_IDS } from "@/content/world";
import { advance, balance, choose, closeDay, entriesOf, newGame, nextDay, submitEntry, turnLessonPage, unlockedAccounts } from "./logic";
import type { GameState } from "./types";

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function checkInvariants(s: GameState) {
  for (const id of ITEM_IDS) expect(s.stock[id]).toBeGreaterThanOrEqual(0);
  expect(balance(s, "現金")).toBeGreaterThanOrEqual(0);
  expect(balance(s, "普通預金")).toBeGreaterThanOrEqual(0);
  const sum = (kind: string) => s.credits.filter((c) => c.kind === kind).reduce((a, c) => a + c.amount, 0);
  expect(sum("売掛金")).toBe(balance(s, "売掛金"));
  expect(sum("買掛金")).toBe(balance(s, "買掛金"));
  const tb = trialBalance(entriesOf(s));
  expect(tb.reduce((a, r) => a + r.debit, 0)).toBe(tb.reduce((a, r) => a + r.credit, 0));
}

/** ランダムに選択しながら、正解を入力して days 日間プレイする */
function play(seed: number, days: number, mistakeRate = 0) {
  const rand = mulberry32(seed);
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
        s = closeDay(s);
        break;
      case "monthEnd":
        s = nextDay(s, rand);
        break;
    }
  }
  return { s, seenTemplates };
}

describe("採点", () => {
  function atFirstJournal() {
    const rand = mulberry32(1);
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
  it.each([1, 2, 3, 4, 5, 6, 7, 8])("seed %i：60日間、帳簿とゲーム状態が矛盾しない", (seed) => {
    const { s } = play(seed, 60, 0.2);
    checkInvariants(s);
  });

  it("全講義を受け、主要な取引がひととおり登場する", () => {
    const seen = new Set<string>();
    let last: GameState | undefined;
    for (let seed = 1; seed <= 8; seed++) {
      const r = play(seed, 60);
      r.seenTemplates.forEach((t) => seen.add(t));
      last = r.s;
    }
    expect(last!.level).toBe(2);
    expect(last!.lessonsDone).toEqual(LESSONS.map((l) => l.id));
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
    ]) {
      expect(seen.has(t), `${t} が一度も登場しない`).toBe(true);
    }
  });
});
