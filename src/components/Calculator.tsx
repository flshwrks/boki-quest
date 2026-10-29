"use client";

import { useState } from "react";
import { evaluate } from "@/engine/calc";
import { fmt } from "./ui";

const KEYS = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "0", "00", ".", "+"];
const OPERATORS = new Set(["+", "−", "×", "÷"]);
/** キーボードの記号を電卓の記号に */
const KEYBOARD: Record<string, string> = { "+": "+", "-": "−", "*": "×", "/": "÷", ".": "." };
/** 候補として残す計算結果の数 */
const KEEP = 4;

/** 電卓の計算結果。仕訳の金額欄に入れられる候補として、新しい順に残す */
export function useCalcResults() {
  const [results, setResults] = useState<number[]>([]);
  const add = (v: number) => setResults((r) => [v, ...r.filter((x) => x !== v)].slice(0, KEEP));
  return [results, add] as const;
}

/** 開いたらすぐキーボードで打てるようにする（関数を作り直さないので、開いたときの一度だけ） */
const focusOnMount = (el: HTMLDivElement | null) => el?.focus({ preventScroll: true });

const show = (v: number) => (Number.isInteger(v) ? fmt(v) : v.toLocaleString("ja-JP", { maximumFractionDigits: 4 }));

/**
 * 本番の試験に持ち込む電卓の代わり。開け閉めでき、= で出た金額（1円以上の整数）は金額の候補に加わる。
 * 開いているときは、キーボードの数字・記号・Enter・BackSpace・Esc でも操作できる
 */
export function Calculator({ onResult }: { onResult: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState<number | null>(null);

  const press = (k: string) => {
    if (k === "C") {
      setExpr("");
      setResult(null);
      return;
    }
    if (k === "←") {
      setExpr((e) => e.slice(0, -1));
      return;
    }
    if (k === "=") {
      const v = evaluate(expr);
      setResult(v);
      if (v === null) return;
      if (Number.isInteger(v) && v > 0) onResult(v);
      // 続けて計算できるよう、答えを式に残す
      setExpr(String(v));
      return;
    }
    // 答えのすぐあとに数字を押したら、新しい計算を始める
    setExpr((e) => (result !== null && e === String(result) && !OPERATORS.has(k) ? k : OPERATORS.has(k) && OPERATORS.has(e.slice(-1)) ? e.slice(0, -1) + k : e + k));
    setResult(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = /^\d$/.test(e.key) ? e.key : KEYBOARD[e.key] ?? (e.key === "Enter" || e.key === "=" ? "=" : e.key === "Backspace" ? "←" : e.key === "Escape" || e.key === "Delete" ? "C" : null);
    if (!k) return;
    // ←→ で借方・貸方を移る操作などに、電卓のキーが伝わらないようにする
    e.preventDefault();
    e.stopPropagation();
    press(k);
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded border border-current/40 px-2 py-0.5 text-xs opacity-80 hover:opacity-100">
        🧮 電卓
      </button>
    );
  }
  const preview = result === null ? evaluate(expr) : null;
  return (
    <div
      ref={focusOnMount}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="w-56 rounded-lg border border-[#8a93ad] bg-[#e9ecf4] p-2 text-[#1d1d2b] shadow-lg outline-none focus:ring-2 focus:ring-[#4a6fd0]"
      aria-label="電卓"
    >
      <div className="mb-1 flex items-center justify-between text-xs text-[#55607a]">
        <span>電卓（= の答えは金額の候補に入る）</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="電卓を閉じる" className="px-1">
          ×
        </button>
      </div>
      <div className="mb-2 rounded border border-[#b8bfd3] bg-white px-2 py-1 text-right tabular-nums">
        <div className="min-h-4 truncate text-xs text-[#55607a]">{expr || "0"}</div>
        <div className="text-lg" aria-live="polite">
          {result !== null ? show(result) : preview !== null ? <span className="text-[#8a93ad]">{show(preview)}</span> : expr ? "…" : "0"}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {KEYS.map((k) => (
          <CalcKey key={k} k={k} onPress={press} op={OPERATORS.has(k)} />
        ))}
        <CalcKey k="C" onPress={press} />
        <CalcKey k="←" onPress={press} />
        <CalcKey k="=" onPress={press} wide />
      </div>
    </div>
  );
}

function CalcKey({ k, onPress, op, wide }: { k: string; onPress: (k: string) => void; op?: boolean; wide?: boolean }) {
  return (
    <button
      type="button"
      // ボタンを押しても電卓からフォーカスを外さない（続けてキーボードで打てるように）
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPress(k)}
      className={`rounded border border-[#b8bfd3] py-1.5 tabular-nums active:scale-95 ${wide ? "col-span-2 bg-[#4a6fd0] text-white" : op ? "bg-[#dfe3ef]" : "bg-white"} hover:brightness-95`}
    >
      {k}
    </button>
  );
}
