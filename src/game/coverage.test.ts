import { describe, expect, it } from "vitest";
import { parseAmount } from "@/engine/format";
import { EXAM_BANK } from "@/content/examBank";
import { LESSONS, PREP_LEVEL } from "@/content/lessons";
import {
  THEORY,
  inventoryProblem,
  receivableLedgerProblem,
  slipsProblem,
  theoryProblem,
  totalsTrialProblem,
  trialAfterProblem,
  worksheetProblem,
} from "@/content/mockExam";
import { TEMPLATES, purchaseTx } from "@/content/events";
import { withLegacyTaxNote, withSalesTax } from "@/content/salesTax";
import { advance, afterResult, choose, newGame, nextLesson, planDay, skipLesson, startOrder, startUpgrade, submitEntry, upgradePreview } from "./logic";
import { seededRand } from "./random";
import { rollRequests } from "./requests";
import { makeMock, mockFullParts } from "./training";
import type { FillCell, FillProblem, GameState } from "./types";

/** 表のセルを、空欄なら正解の値で読む */
const value = (p: FillProblem, c: FillCell): number =>
  typeof c === "string" ? parseAmount(c.replace("△", "")) : (p.blanks[c.blank].answer as number);
const points = (p: FillProblem) => p.blanks.reduce((a, b) => a + b.points, 0);
/** 空のセルは 0 として読む */
const v = (p: FillProblem, c: FillCell) => (c === "" ? 0 : value(p, c));
/** 表の本体（最後の合計行を除く）の、ある列の合計 */
const colSum = (p: FillProblem, rows: FillCell[][], col: number) => rows.slice(0, -1).reduce((a, r) => a + v(p, r[col]), 0);

describe("模擬試験の追加形式", () => {
  it("商品有高帳：各行の金額＝数量×単価、売上原価＝払出金額の合計、配点は10点", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const p = inventoryProblem(seededRand(seed));
      expect(points(p)).toBe(10);
      const [book, answers] = p.sheet;
      let out = 0;
      for (const r of book.rows) {
        for (const at of [2, 5, 8]) {
          if (r[at] === "") continue;
          const qty = value(p, r[at]);
          const price = value(p, r[at + 1]);
          expect(value(p, r[at + 2]), `${p.title} ${JSON.stringify(r)}`).toBe(qty * price);
          expect(Number.isInteger(price)).toBe(true);
        }
        if (r[5] !== "") out += value(p, r[7]);
      }
      expect(value(p, answers.rows[0][1])).toBe(out);
      expect(value(p, answers.rows[1][1])).toBeGreaterThan(0);
    }
  });

  it("仕訳日計表：借方の合計と貸方の合計が一致し、配点は10点", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const p = slipsProblem(seededRand(seed));
      expect(points(p)).toBe(10);
      const rows = p.sheet[0].rows;
      const total = value(p, rows.at(-1)![0]);
      expect(colSum(p, rows, 0)).toBe(total);
      expect(colSum(p, rows, 2)).toBe(total);
    }
  });

  it("語群選択：答えは語群の中にあり、文には空欄が1つ", () => {
    for (const [word, text] of THEORY) expect(text.split("（　）").length, word).toBe(2);
    for (let seed = 1; seed <= 20; seed++) {
      const p = theoryProblem(seededRand(seed));
      expect(points(p)).toBe(10);
      for (const b of p.blanks) expect(b.options).toContain(b.answer);
    }
  });

  it("決算整理後残高試算表：借方と貸方の合計が一致し、配点は35点", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const p = trialAfterProblem(seededRand(seed));
      expect(points(p)).toBe(35);
      const rows = p.sheet[0].rows;
      const total = value(p, rows.at(-1)![0]);
      expect(colSum(p, rows, 0)).toBe(total);
      expect(colSum(p, rows, 2)).toBe(total);
    }
  });

  it("精算表：各欄の左右の合計が一致し、合計の行と等しい", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const p = worksheetProblem(seededRand(seed));
      expect(points(p)).toBe(35);
      const rows = p.sheet[0].rows;
      const total = rows.at(-1)!;
      for (let col = 1; col <= 8; col++) expect(colSum(p, rows, col), `${col}列目`).toBe(value(p, total[col]));
      for (const pair of [1, 3, 5, 7]) expect(value(p, total[pair])).toBe(value(p, total[pair + 1]));
    }
  });

  it("合計残高試算表：合計の列どうし・残高の列どうしが一致し、各行の残高は合計の差", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const p = totalsTrialProblem(seededRand(seed));
      expect(points(p)).toBe(35);
      const rows = p.sheet[0].rows;
      for (const r of rows.slice(0, -1)) {
        expect(v(p, r[0]) - v(p, r[4]), String(r[2])).toBe(v(p, r[1]) - v(p, r[3]));
        expect(v(p, r[0]) * v(p, r[4])).toBe(0);
      }
      const total = rows.at(-1)!;
      for (const col of [0, 1, 3, 4]) expect(colSum(p, rows, col)).toBe(v(p, total[col]));
      expect(colSum(p, rows, 1)).toBe(colSum(p, rows, 3));
      expect(colSum(p, rows, 0)).toBe(colSum(p, rows, 4));
    }
  });

  it("売掛金元帳：残高は借方−貸方の累計で、締め切りの左右が一致する", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const p = receivableLedgerProblem(seededRand(seed));
      expect(points(p)).toBe(10);
      const rows = p.sheet[0].rows;
      let bal = 0;
      for (const r of rows.slice(0, 4)) {
        bal += v(p, r[2]) - v(p, r[3]);
        expect(v(p, r[5])).toBe(bal);
        expect(bal).toBeGreaterThan(0);
      }
      expect(v(p, rows[4][3])).toBe(bal);
      const total = rows.at(-1)!;
      expect(colSum(p, rows, 2)).toBe(v(p, total[2]));
      expect(colSum(p, rows, 3)).toBe(v(p, total[3]));
    }
  });

  it("どの組み合わせでも、模擬試験は100点満点", () => {
    const s = { ...newGame("テスト商店", seededRand(1)), lessonsDone: LESSONS.map((l) => l.id) };
    for (let seed = 1; seed <= 200; seed++) {
      const m = makeMock(s, seededRand(seed));
      expect(mockFullParts(m)).toEqual([45, 20, 35]);
      for (const p of m.problems) for (const b of p.blanks) expect(b.points, p.title).toBeGreaterThan(0);
    }
  });
});

describe("カリキュラム", () => {
  it("店の講義と決算の講義には、すべて問題集の問題がある（ドリル・模試・早送りで出せる）", () => {
    const withQuestions = new Set(EXAM_BANK.map((q) => q.lesson));
    for (const l of LESSONS.filter((x) => x.level !== PREP_LEVEL && x.id !== "basics")) expect(withQuestions.has(l.id), l.title).toBe(true);
  });

  it("講義の練習取引は、すべて取引の一覧にある", () => {
    for (const l of LESSONS) for (const t of l.practice) expect(TEMPLATES[t], `${l.title} の ${t}`).toBeDefined();
  });

  it("後から追加された前の Lv の講義は、補講として次に受ける", () => {
    const s = newGame("テスト商店", seededRand(1));
    const done = LESSONS.filter((l) => l.level >= 1 && l.level <= 5 && l.id !== "taxes").map((l) => l.id);
    expect(nextLesson({ ...s, level: 5, lessonsDone: done })?.id).toBe("taxes");
  });

  it("講義の早送り：確認問題に正解すると、講義を受けたことになる", () => {
    const s: GameState = { ...newGame("テスト商店", seededRand(1)), phase: { kind: "lesson", lesson: "taxes", page: 0 } };
    const next = skipLesson(s);
    expect(next.lessonsDone).toContain("taxes");
    expect(next.phase.kind).toBe("lessonDone");
  });
});

describe("お客さんの来店", () => {
  it("講義を受けると、いつもの現金・ツケのお客さんより、習った払い方や用件のお客さんが多くなる", () => {
    const base = newGame("テスト商店", seededRand(1));
    const learned = LESSONS.filter((l) => l.level >= 1 && l.level <= 4).map((l) => l.id);
    const s: GameState = { ...base, day: 30, level: 4, lessonsDone: learned };
    const count = new Map<string, number>();
    const rand = seededRand(7);
    for (let i = 0; i < 100; i++) {
      for (const q of planDay(s, rand)) {
        if (q.kind === "event" && (q.id === "customer" || q.fallback === "customer")) count.set(q.id, (count.get(q.id) ?? 0) + 1);
      }
    }
    const total = [...count.values()].reduce((a, b) => a + b, 0);
    expect((count.get("customer") ?? 0) / total).toBeLessThan(0.5);
    for (const id of ["card-sale", "customer-note", "giftcert-sale", "sales-return", "customer-split"]) expect(count.get(id), id).toBeGreaterThan(0);
  });
});

describe("見習いのノエルに任せる", () => {
  /** 月の2日目（ツケの回収の日）。先月のツケが1件あり、掛け取引の習熟度は★3 */
  const collectDay = (autoPost: boolean): GameState => {
    const base = newGame("テスト商店", seededRand(1));
    const learned = LESSONS.filter((l) => l.level >= 1 && l.level <= 4).map((l) => l.id);
    return {
      ...base,
      day: 7,
      level: 4,
      lessonsDone: learned,
      autoPost,
      credits: [{ id: "c1", kind: "売掛金", who: "allen", amount: 12000, day: 3 }],
      practice: Array.from({ length: 10 }, () => ({ day: 6, lesson: "credit" as const, ok: true })),
      queue: [{ kind: "event", id: "collect" }],
      phase: { kind: "dayStart" },
    };
  };

  it("オンなら、習熟度★3の論点の後始末をノエルが記帳し、閉店時に見せる（正誤の記録には数えない）", () => {
    const s = advance(collectDay(true), seededRand(2));
    expect(s.phase.kind).toBe("dayEnd");
    expect(s.journal.at(-1)).toMatchObject({ templateId: "collect", auto: true, entry: { debit: [{ account: "普通預金", amount: 12000 }], credit: [{ account: "売掛金", amount: 12000 }] } });
    expect(s.credits).toEqual([]);
    expect(s.practice.length).toBe(10);
  });

  it("オフなら、自分で記帳する", () => {
    const s = advance(collectDay(false), seededRand(2));
    expect(s.phase.kind).toBe("event");
  });

  it("朝の仕入れは、商品売買が★3なら（掛けなら掛け取引も★3なら）ノエルが記帳し、朝の画面のまま", () => {
    // 開業前の帳簿は空（現金がない）なので、掛けで仕入れる
    const stars3 = (lesson: "trade" | "credit") => Array.from({ length: 10 }, () => ({ day: 6, lesson, ok: true }));
    const s = { ...collectDay(true), practice: [...stars3("trade"), ...stars3("credit")] };
    const done = startOrder(s, "potion", 10, "買掛金");
    expect(done.phase.kind).toBe("dayStart");
    expect(done.journal.at(-1)).toMatchObject({ templateId: "order", auto: true, entry: { debit: [{ account: "仕入" }], credit: [{ account: "買掛金" }] } });
    expect(done.stock.potion).toBe(s.stock.potion + 10);
    expect(done.practice.length).toBe(s.practice.length);
    // 掛け取引がまだ★3でない・任せていないときは、自分で記帳する
    expect(startOrder({ ...s, practice: stars3("trade") }, "potion", 10, "買掛金").phase.kind).toBe("journal");
    expect(startOrder({ ...s, autoPost: false }, "potion", 10, "買掛金").phase.kind).toBe("journal");
  });
});

describe("消費税の行をノエルに任せる", () => {
  /** 消費税を習い、ノエルに任せる設定がオン。今日、消費税の仕訳を自分で taxed 件書いた */
  const taxDay = (taxed: number, autoPost = true): GameState => {
    const base = newGame("テスト商店", seededRand(1));
    const learned = LESSONS.filter((l) => l.level <= 5).map((l) => l.id);
    const sale = { debit: [{ account: "現金" as const, amount: 1100 }], credit: [{ account: "売上" as const, amount: 1000 }, { account: "仮受消費税" as const, amount: 100 }] };
    return {
      ...base,
      day: 40,
      level: 5,
      lessonsDone: learned,
      autoPost,
      journal: Array.from({ length: taxed }, () => ({ day: 40, templateId: "customer", exam: "", entry: sale })),
      phase: { kind: "dayStart" },
    };
  };
  const hasTax = (e: { debit: { account: string }[]; credit: { account: string }[] }) => [...e.debit, ...e.credit].some((l) => l.account.endsWith("消費税"));

  it("1日2件を自分で書いたら、残りは税抜で答え、帳簿には税込で載る", () => {
    const s = startOrder(taxDay(2), "potion", 10, "買掛金");
    if (s.phase.kind !== "journal") throw new Error("記帳の画面にならない");
    const { tx } = s.phase.session;
    expect(hasTax(tx.answer)).toBe(false);
    expect(tx.withTax && hasTax(tx.withTax.answer)).toBe(true);
    const done = submitEntry(s, tx.answer);
    expect(done.journal.at(-1)).toMatchObject({ noelTax: true });
    expect(hasTax(done.journal.at(-1)!.entry)).toBe(true);
  });

  it("まだ2件書いていない・任せていないなら、消費税も自分で書く", () => {
    for (const s of [startOrder(taxDay(1), "potion", 10, "買掛金"), startOrder(taxDay(2, false), "potion", 10, "買掛金")]) {
      if (s.phase.kind !== "journal") throw new Error("記帳の画面にならない");
      expect(hasTax(s.phase.session.tx.answer)).toBe(true);
    }
  });
});

describe("店の設備", () => {
  it("朝の画面で買って記帳すると、設備が店に入り、朝の画面に戻る（付随費用は取得原価に）", () => {
    const base = newGame("テスト商店", seededRand(1));
    const learned = LESSONS.filter((l) => l.level <= 4).map((l) => l.id);
    const deposit = { day: 31, templateId: "x", exam: "", entry: { debit: [{ account: "普通預金" as const, amount: 300000 }], credit: [{ account: "資本金" as const, amount: 300000 }] } };
    const s: GameState = { ...base, level: 4, lessonsDone: learned, journal: [deposit], phase: { kind: "dayStart" } };
    const j = startUpgrade(s, "wagon", "普通預金");
    if (j.phase.kind !== "journal") throw new Error("記帳の画面にならない");
    expect(j.phase.session.tx.answer.debit).toEqual([{ account: "車両運搬具", amount: 210000 }]);
    const done = afterResult(submitEntry(j, j.phase.session.tx.answer), seededRand(2));
    expect(done.phase.kind).toBe("dayStart");
    expect(done.upgrades).toEqual(["wagon"]);
    // 同じ設備は2度買えない。月末払いでも、払うあてがなければ買えない
    expect(startUpgrade(done, "wagon", "普通預金")).toBe(done);
    expect(upgradePreview({ ...s, journal: [] }, "shelf", "未払金").disabled).toBeTruthy();
  });
});

describe("月の依頼書と収穫祭", () => {
  const learnedAll = (): GameState => {
    const base = newGame("テスト商店", seededRand(1));
    return { ...base, level: 5, lessonsDone: LESSONS.filter((l) => l.level <= 5).map((l) => l.id), phase: { kind: "dayStart" } };
  };

  it("月が変わると先月の依頼書を判定し、達成した数だけ評判と報奨金（雑益）。新しい依頼書が出る", () => {
    const sale = { day: 32, templateId: "customer", exam: "", entry: { debit: [{ account: "現金" as const, amount: 400000 }], credit: [{ account: "売上" as const, amount: 400000 }] } };
    const s: GameState = { ...learnedAll(), day: 36, reputation: 50, trust: 50, journal: [sale], requests: { start: 31, goals: [{ kind: "sales", target: 300000 }, { kind: "clean", target: 85 }] } };
    const next = rollRequests(s);
    expect(next.reputation).toBe(54);
    expect(next.reward).toEqual({ amount: 15000, count: 1 });
    expect(next.requests?.start).toBe(36);
    // 先月の売上の1割増しが、今月の売上の目標
    expect(next.requests?.goals[0]).toEqual({ kind: "sales", target: 440000 });
  });

  it("収穫祭：月はじめに予約と手付金（前受金）、4日目以降に納品して前受金を取り崩す", () => {
    const rand = seededRand(3);
    let s: GameState = { ...learnedAll(), day: 31, queue: [{ kind: "event", id: "festival-order" }] };
    s = advance(s, rand);
    expect(s.phase.kind).toBe("event");
    s = choose(s, 0, rand);
    if (s.phase.kind !== "journal") throw new Error("記帳の画面にならない");
    s = submitEntry(s, s.phase.session.tx.answer);
    const f = s.festival!;
    expect(s.journal.at(-1)?.entry.credit).toEqual([{ account: "前受金", amount: f.deposit }]);
    // 3日目はまだ納品しない。4日目、在庫があれば納品できる
    expect(advance({ ...s, day: 33, queue: [{ kind: "event", id: "festival-deliver" }] }, rand).phase.kind).toBe("dayEnd");
    s = advance({ ...s, day: 34, stock: { ...s.stock, [f.item]: f.qty }, queue: [{ kind: "event", id: "festival-deliver" }] }, rand);
    s = choose(s, 0, rand);
    if (s.phase.kind !== "journal") throw new Error("記帳の画面にならない");
    expect(s.phase.session.tx.answer.debit.find((l) => l.account === "前受金")?.amount).toBe(f.deposit);
    s = submitEntry(s, s.phase.session.tx.answer);
    expect(s.festival).toBeNull();
    expect(s.stock[f.item]).toBe(0);
  });
});

describe("お店のお金を守る", () => {
  const lv5 = (day: number, journal: GameState["journal"]): GameState => {
    const base = newGame("テスト商店", seededRand(1));
    return { ...base, day, level: 5, lessonsDone: LESSONS.filter((l) => l.level <= 5).map((l) => l.id), journal, phase: { kind: "dayStart" } };
  };
  const rec = (day: number, templateId: string, debit: [string, number][], credit: [string, number][]) =>
    ({ day, templateId, exam: "", entry: { debit: debit.map(([account, amount]) => ({ account, amount })), credit: credit.map(([account, amount]) => ({ account, amount })) } }) as GameState["journal"][number];

  it("中間納付の講義の練習が11月でなければ、店の帳簿には記入しない", () => {
    const books = [rec(1, "x", [["普通預金", 500000]], [["資本金", 500000]]), rec(60, "close-tax", [["法人税、住民税及び事業税", 100000]], [["未払法人税等", 100000]])];
    let s = advance({ ...lv5(64, books), queue: [{ kind: "event", id: "interim-tax", guided: true }] }, seededRand(2));
    s = choose(s, 0, seededRand(2));
    if (s.phase.kind !== "journal") throw new Error("記帳の画面にならない");
    expect(s.phase.session.tx.offBooks).toBe(true);
    const done = submitEntry(s, s.phase.session.tx.answer);
    expect(done.journal.length).toBe(books.length);
  });

  it("当座預金は、期日の来る電子記録債務の決済に取っておく（ほかの支払いには使わない）", () => {
    const books = [
      rec(1, "x", [["当座預金", 300000], ["普通預金", 300000]], [["資本金", 600000]]),
      rec(60, "close-tax", [["法人税、住民税及び事業税", 400000]], [["未払法人税等", 400000]]),
    ];
    const s: GameState = { ...lv5(68, books), credits: [{ id: "e1", kind: "電子記録債務", who: "gantetsu", amount: 250000, day: 66 }] };
    const ev = advance({ ...s, queue: [{ kind: "event", id: "pay-corp-tax" }] }, seededRand(2));
    if (ev.phase.kind !== "event") throw new Error("納付のイベントにならない");
    const checking = ev.phase.event.choices.find((c) => c.label.startsWith("当座預金"));
    expect(checking?.disabled).toBeTruthy();
  });
});

describe("得意な論点は、選ぶだけでノエルが記帳する", () => {
  const spaced = [31, 32, 34, 38, 46].map((day) => ({ day, lesson: "trade" as const, ok: true }));
  const shop = (autoPost: boolean, practice = spaced): GameState => {
    const base = newGame("テスト商店", seededRand(1));
    // ノエルを雇うのは給料の講義（Lv4）
    const learned = LESSONS.filter((l) => l.level <= 4).map((l) => l.id);
    return { ...base, day: 48, level: 4, lessonsDone: learned, autoPost, practice, stock: { ...base.stock, potion: 500, herb: 500, antidote: 500 }, queue: [{ kind: "event", id: "customer" }], phase: { kind: "dayStart" } };
  };

  it("復習の時期が来ていない★3の論点：選ぶと、ノエルが記帳して仕訳を見せる", () => {
    const rand = seededRand(4);
    const s = advance(shop(true), rand);
    if (s.phase.kind !== "event") throw new Error("お客さんが来ない");
    expect(s.phase.event.noel).toBe(true);
    const sell = s.phase.event.choices.findIndex((c) => c.tx && !c.disabled);
    const done = choose(s, sell, rand);
    expect(done.phase.kind).toBe("reply");
    expect(done.journal.at(-1)).toMatchObject({ templateId: "customer", auto: true });
  });

  it("復習の時期が来ていたり、任せていなかったりすれば、自分で記帳する", () => {
    for (const s of [advance(shop(true, spaced.slice(0, 4)), seededRand(4)), advance(shop(false), seededRand(4))]) {
      if (s.phase.kind !== "event") throw new Error("お客さんが来ない");
      expect(s.phase.event.noel).toBeUndefined();
    }
  });
});

describe("消費税は商品の代金にだけかける（試験と同じ）", () => {
  it("引取運賃は仕入に含めるが、消費税は商品代金にだけかかる。売るときの発送費にもかけない", () => {
    const buy = withSalesTax(purchaseTx("potion", 10, "現金", { fee: 500, unit: 400 }));
    expect(buy.answer.debit).toEqual([
      { account: "仕入", amount: 4500 },
      { account: "仮払消費税", amount: 400 },
    ]);
    expect(buy.answer.credit).toEqual([{ account: "現金", amount: 4900 }]);
    expect(buy.exam).toContain("商品代金4,000円に対する消費税（税率10%、400円）");
  });

  it("掛けで仕入れ、引取運賃を現金で払うとき：消費税は掛け代金に含め、そのことを問題文に書く", () => {
    const buy = withSalesTax(purchaseTx("potion", 10, "買掛金", { fee: 500, unit: 400 }));
    expect(buy.answer.credit).toEqual([
      { account: "買掛金", amount: 4400 },
      { account: "現金", amount: 500 },
    ]);
    expect(buy.exam).toContain("なお、消費税は掛け代金に含める。");
  });
});

describe("消費税は「残額」の側に含める", () => {
  const sale = (taxTo?: "売掛金") =>
    withSalesTax({
      story: "",
      exam: "商品10,000円を売り上げ、代金のうち4,000円は現金で受け取り、残額は掛けとした。",
      answer: { debit: [{ account: "現金", amount: 4000 }, { account: "売掛金", amount: 6000 }], credit: [{ account: "売上", amount: 10000 }] },
      idea: "",
      taxable: true,
      taxTo,
    });

  it("一部を現金で受け取り、残額を掛けにした売上：現金は問題文の金額のまま、消費税は売掛金に含める", () => {
    expect(sale("売掛金").answer.debit).toEqual([
      { account: "現金", amount: 4000 },
      { account: "売掛金", amount: 7000 },
    ]);
  });
});

describe("ギルドの帳簿相談", () => {
  it("正解しても店の帳簿（仕訳帳）には記入せず、正誤だけ記録する", () => {
    const rand = seededRand(3);
    const base = newGame("テスト商店", rand);
    const built = TEMPLATES.guild.build({ state: base, rand, balance: () => 0, has: () => true, guided: false, topic: "fixedsale" })!;
    let s: GameState = {
      ...base,
      lessonsDone: [...base.lessonsDone, "fixedsale"],
      phase: { kind: "event", event: { ...built, templateId: "guild-fixedsale" } },
    };
    s = choose(s, 0, rand);
    if (s.phase.kind !== "journal") throw new Error("仕訳に進まない");
    s = submitEntry(s, s.phase.session.tx.answer);
    expect(s.phase.kind).toBe("result");
    expect(s.journal.length).toBe(base.journal.length);
    expect(s.practice.at(-1)).toEqual({ day: s.day, lesson: "fixedsale", ok: true });
  });
});

describe("苦手ドリル：消費税のルールを変える前に記帳した問題", () => {
  it("消費税をどちらに含めたかを問題文に書き足す", () => {
    const exam = "商品24,000円を売り上げ、代金のうち9,000円は現金で受け取り、残額は掛けとした。消費税（税率10%、2,400円）は税抜方式で処理する。";
    const entry = {
      debit: [
        { account: "現金" as const, amount: 11400 },
        { account: "売掛金" as const, amount: 15000 },
      ],
      credit: [
        { account: "売上" as const, amount: 24000 },
        { account: "仮受消費税" as const, amount: 2400 },
      ],
    };
    expect(withLegacyTaxNote(exam, entry)).toBe(`${exam}なお、消費税は現金の金額に含める。`);
    // 代金が1つなら何も足さない
    const single = { debit: [{ account: "現金" as const, amount: 26400 }], credit: entry.credit };
    expect(withLegacyTaxNote(exam, single)).toBe(exam);
  });
});
