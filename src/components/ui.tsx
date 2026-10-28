"use client";

import { useEffect, useRef, useState } from "react";
import { type AccountName, type Category, categoryOf } from "@/engine/accounts";
import { fmt } from "@/engine/format";
import { type Entry, explainLine } from "@/engine/journal";
import { CHARACTERS } from "@/content/world";
import type { CharacterId } from "@/game/types";
import { type Pose, Sprite } from "./Sprite";
import { play } from "./sfx";

export const CATEGORY_BG: Record<Category, string> = {
  asset: "bg-asset",
  contra: "bg-contra",
  liability: "bg-liability",
  equity: "bg-equity",
  revenue: "bg-revenue",
  expense: "bg-expense",
  suspense: "bg-suspense",
};

export { fmt };

export function Win({ children, className = "", title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <section className={`win p-4 ${className}`}>
      {title && <h2 className="mb-2 text-gold">{title}</h2>}
      {children}
    </section>
  );
}

export function Btn({
  children,
  onClick,
  variant = "primary",
  disabled,
  className = "",
  sound = "select",
  type = "button",
  active,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "choice" | "chip";
  disabled?: boolean;
  className?: string;
  sound?: "select" | "card" | null;
  /** フォームの送信ボタンにするときは submit */
  type?: "button" | "submit";
  /** chip のとき、選ばれているか */
  active?: boolean;
}) {
  const styles = {
    primary: "bg-gold text-ink px-4 py-2 rounded hover:brightness-110",
    ghost: "border-2 border-white/70 px-3 py-1.5 rounded hover:bg-white/10",
    choice: "choice w-full py-2 pr-2 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/10 hover:pl-7 transition-all",
    chip: `rounded-full border px-2.5 py-1 text-xs ${active ? "border-gold bg-gold/15 text-gold" : "border-white/40 hover:bg-white/10"}`,
  }[variant];
  return (
    <button
      type={type}
      disabled={disabled}
      aria-pressed={variant === "chip" ? !!active : undefined}
      onClick={() => {
        if (sound) play(sound);
        onClick?.();
      }}
      className={`${styles} focus-visible:outline-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
    >
      {children}
    </button>
  );
}

/** キャラクターの顔。ふだんは、まばたきと待機の動きつき */
export function Portrait({
  id,
  size = 64,
  className = "",
  still = false,
  talking = false,
  pose,
}: {
  id: CharacterId;
  size?: number;
  className?: string;
  still?: boolean;
  /** 口をぱくぱくさせる */
  talking?: boolean;
  /** 今のコマのポーズ */
  pose?: Pose;
}) {
  const c = CHARACTERS[id];
  return <Sprite name={c.sprite} palette={c.palette} size={size} className={className} label={c.name} animate={!still} talking={talking} pose={pose} />;
}

export function Speaker({ id }: { id: CharacterId }) {
  const c = CHARACTERS[id];
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-gold">{c.name}</span>
      <span className="text-xs text-dim">{c.title}</span>
    </div>
  );
}

export function AccountChip({ account, className = "" }: { account: AccountName; className?: string }) {
  return <span className={`${CATEGORY_BG[categoryOf(account)]} inline-block rounded px-2 py-0.5 text-white ${className}`}>{account}</span>;
}

/** 仕訳を「借方｜貸方」の表で見せる */
export function EntryTable({ entry, highlight = false }: { entry: Entry; highlight?: boolean }) {
  const rows = Math.max(entry.debit.length, entry.credit.length);
  return (
    <table className={`w-full border-collapse text-sm ${highlight ? "text-gold" : ""}`}>
      <thead>
        <tr className="text-xs text-dim">
          <th className="w-1/2 border-b border-white/40 pb-1 text-left font-normal">借方</th>
          <th className="w-1/2 border-b border-l border-white/40 pb-1 pl-2 text-left font-normal">貸方</th>
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }, (_, i) => (
          <tr key={i}>
            {(["debit", "credit"] as const).map((side) => {
              const l = entry[side][i];
              return (
                <td key={side} className={`py-1 ${side === "credit" ? "border-l border-white/40 pl-2" : "pr-2"}`}>
                  {l && (
                    <span className="flex flex-wrap items-center justify-between gap-1">
                      <AccountChip account={l.account} />
                      <span className="tabular-nums">{fmt(l.amount)}</span>
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 正解の仕訳と、1行ごとの「なぜその側に書くか」 */
export function AnswerExplain({ entry, highlight = false }: { entry: Entry; highlight?: boolean }) {
  return (
    <>
      <EntryTable entry={entry} highlight={highlight} />
      <ul className="mt-1 text-sm">
        {(["debit", "credit"] as const).flatMap((side) =>
          entry[side].map((l) => <li key={`${side}-${l.account}`}>・{explainLine(l, side)}</li>),
        )}
      </ul>
    </>
  );
}

export function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-2 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="win rise flex max-h-[92dvh] w-full max-w-3xl flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-2 border-white/30 px-4 py-2">
          <h2 className="text-gold">{title}</h2>
          <Btn variant="ghost" onClick={onClose}>
            とじる
          </Btn>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 文字送りのセリフ。タップで全文を出し、出し終えたら children（選択肢など）を見せる。
 * 新しいセリフに切り替えるときは key を変えて作り直す。
 */
export function Dialogue({ text, children, className = "" }: { text: string; children?: React.ReactNode; className?: string }) {
  const [n, setN] = useState(() => (prefersReducedMotion() ? text.length : 0));
  const done = n >= text.length;
  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => setN((v) => Math.min(text.length, v + 2)), 28);
    return () => clearTimeout(t);
  }, [n, done, text.length]);
  return (
    <div className={className}>
      <p className="cursor-pointer whitespace-pre-line" onClick={() => setN(text.length)}>
        {text.slice(0, n)}
        {!done && <span className="caret">▼</span>}
      </p>
      {done ? children : <p className="mt-1 text-right text-[10px] text-dim">タップで全文表示</p>}
    </div>
  );
}

/** 値が変わると、前の値から数字がくるくる変わって追いつく */
export function AnimatedNumber({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  useEffect(() => {
    const from = shownRef.current;
    if (from === value || prefersReducedMotion()) {
      shownRef.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 600);
      const v = Math.round(from + (value - from) * (1 - (1 - p) ** 3));
      shownRef.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{fmt(shown)}</>;
}

/**
 * ←→キーで借方・貸方を移ってよいか。修飾キーつきは除く。
 * 文字の入力欄では、文字カーソルが端にあるとき（←なら先頭、→なら末尾）だけ動く
 */
export function arrowSide(e: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "target">): "debit" | "credit" | null {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  const side = e.key === "ArrowLeft" ? "debit" : e.key === "ArrowRight" ? "credit" : null;
  if (!side) return null;
  const el = e.target;
  if (el instanceof HTMLInputElement) {
    const atEdge = side === "debit" ? el.selectionStart === 0 && el.selectionEnd === 0 : el.selectionStart === el.value.length;
    if (!atEdge) return null;
  }
  return side;
}
