import { afterEach, describe, expect, it, vi } from "vitest";
import { initialState, newGame } from "./logic";
import { seededRand } from "./random";
import { EMPTY_BASE, fetchCloud, parseSave, progressOf, pushCloud, reconcile } from "./save";

/** 保存APIと同じふるまいをする、メモリ上のサーバー */
function fakeServer() {
  let saved: { savedAt: number; data: string | null } = { savedAt: 0, data: null };
  let clock = 1000;
  return vi.fn(async (_url: string, init?: RequestInit) => {
    if (new Headers(init?.headers).get("x-passcode") !== "pass") return new Response("{}", { status: 401 });
    if (init?.method === "PUT") {
      const body = JSON.parse(init.body as string) as { base: number; data: string };
      if (saved.savedAt > body.base) return Response.json({ savedAt: saved.savedAt }, { status: 409 });
      saved = { savedAt: ++clock, data: body.data };
      return Response.json({ savedAt: saved.savedAt });
    }
    return Response.json(saved);
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("クラウド保存", () => {
  it("圧縮して保存し、同じ状態を読み戻せる", async () => {
    vi.stubGlobal("fetch", fakeServer());
    const state = newGame("星のしずく", seededRand(1));
    const pushed = await pushCloud("pass", state, 0);
    expect(pushed.status).toBe("ok");
    const fetched = await fetchCloud("pass");
    expect(fetched.status).toBe("ok");
    if (fetched.status !== "ok") return;
    expect(fetched.savedAt).toBe(pushed.savedAt);
    expect(fetched.save?.state).toEqual(state);
  });

  it("別の端末が先に保存していたら上書きしない", async () => {
    vi.stubGlobal("fetch", fakeServer());
    const state = newGame("星のしずく", seededRand(1));
    const first = await pushCloud("pass", state, 0);
    expect((await pushCloud("pass", state, 0)).status).toBe("conflict");
    expect((await pushCloud("pass", state, first.savedAt!)).status).toBe("ok");
  });

  it("合言葉が違えば読み書きできない", async () => {
    vi.stubGlobal("fetch", fakeServer());
    expect((await fetchCloud("wrong")).status).toBe("unauthorized");
    expect((await pushCloud("wrong", newGame("x", seededRand(1)), 0)).status).toBe("unauthorized");
  });
});

describe("最初の年度を短くする前のセーブ", () => {
  /** 開業日（openDay）がない、4月1日に開業した古いセーブ */
  const oldSave = (day: number, closed = false) => {
    const { openDay: _, ...rest } = newGame("星のしずく", seededRand(1));
    void _;
    return {
      ...rest,
      day,
      journal: [
        { day: 40, templateId: "customer", exam: "", entry: { debit: [], credit: [] } },
        ...(closed ? [{ day: 60, templateId: "closing-transfer", exam: "", entry: { debit: [], credit: [] } }] : []),
      ],
      credits: [{ id: "c1", kind: "売掛金" as const, who: "allen" as const, amount: 1000, day: 42 }],
    };
  };

  it("最初の決算がまだなら、決算まで数日になるよう日付をすべて同じだけ進める（月の何日目かは変えない）", async () => {
    vi.stubGlobal("fetch", fakeServer());
    await pushCloud("pass", oldSave(45) as never, 0);
    const fetched = await fetchCloud("pass");
    if (fetched.status !== "ok" || !fetched.save) throw new Error("読み戻せない");
    const s = fetched.save.state;
    expect(s.day).toBe(55);
    expect(s.openDay).toBe(11);
    expect(s.journal[0].day).toBe(50);
    expect(s.credits[0].day).toBe(52);
  });

  it("最初の決算を終えていれば、日付は変えない", async () => {
    vi.stubGlobal("fetch", fakeServer());
    await pushCloud("pass", oldSave(70, true) as never, 0);
    const fetched = await fetchCloud("pass");
    if (fetched.status !== "ok" || !fetched.save) throw new Error("読み戻せない");
    expect(fetched.save.state.day).toBe(70);
    expect(fetched.save.state.openDay).toBe(1);
  });
});

describe("ほかの端末とのそろえ方", () => {
  const at = (day: number) => ({ ...newGame("テスト商店", seededRand(1)), day });
  const pc = at(50);
  const phone = at(60);

  it("クラウドがこの端末の元の版のままなら、この端末のセーブで続ける", () => {
    expect(reconcile(pc, phone, 7, { rev: 7, progress: progressOf(phone) })).toBe("local");
  });

  it("そろえたあとこの端末で進めていなければ、ほかの端末で進めたクラウドに合わせる", () => {
    expect(reconcile(pc, phone, 9, { rev: 7, progress: progressOf(pc) })).toBe("remote");
  });

  it("両方で進めて分かれたら、どちらで続けるかを選んでもらう（保存した時刻では決めない）", () => {
    expect(reconcile(pc, phone, 9, { rev: 7, progress: progressOf(at(45)) })).toBe("ask");
    // そろえた記録のない古い端末も、進み具合が違えば選んでもらう
    expect(reconcile(pc, phone, 9, EMPTY_BASE)).toBe("ask");
  });

  it("どちらかが空なら、ある方を使う", () => {
    expect(reconcile(pc, null, 0, EMPTY_BASE)).toBe("local");
    expect(reconcile(null, phone, 9, EMPTY_BASE)).toBe("remote");
  });
});

describe("消費税の注記がなかったころのミス", () => {
  it("読み込むとミスの記録から外れる（注記の要らないミスは残る）", () => {
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
    const base = initialState("テスト");
    const other = { day: 1, templateId: "x", exam: "ほかの問題。" };
    const state = {
      ...base,
      journal: [...base.journal, { day: 1, templateId: "customerSplit", exam, entry }],
      mistakes: [{ day: 1, templateId: "customerSplit", exam }, other],
    };
    expect(parseSave(JSON.stringify(state))?.mistakes).toEqual([other]);
  });
});
