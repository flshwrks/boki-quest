import { describe, expect, it } from "vitest";
import { evaluate } from "./calc";

describe("電卓", () => {
  it("×÷を先に計算する", () => {
    expect(evaluate("50000+50000×0.1")).toBe(55000);
    expect(evaluate("12,000×3−6000÷2")).toBe(33000);
    expect(evaluate("−300+1000")).toBe(700);
  });

  it("小数の誤差を丸める", () => {
    expect(evaluate("0.1×3")).toBe(0.3);
  });

  it("式が途中・0で割るときは答えなし", () => {
    expect(evaluate("100+")).toBeNull();
    expect(evaluate("100÷0")).toBeNull();
    expect(evaluate("")).toBeNull();
    expect(evaluate("××3")).toBeNull();
  });
});
