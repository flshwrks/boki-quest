import { afterEach, describe, expect, it, vi } from "vitest";
import { newGame } from "./logic";
import { seededRand } from "./random";
import { fetchCloud, pushCloud } from "./save";

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

