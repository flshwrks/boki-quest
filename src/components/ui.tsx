"use client";

import { type AccountName, type Category, categoryOf } from "@/engine/accounts";
import { fmt } from "@/engine/format";
import type { Entry } from "@/engine/journal";
import { CHARACTERS } from "@/content/world";
import type { CharacterId } from "@/game/types";
import { Sprite } from "./Sprite";
import { play } from "./sfx";

export const CATEGORY_BG: Record<Category, string> = {
  asset: "bg-asset",
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
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "choice";
  disabled?: boolean;
  className?: string;
  sound?: "select" | "card" | null;
}) {
  const styles = {
    primary: "bg-gold text-ink px-4 py-2 rounded hover:brightness-110",
    ghost: "border-2 border-white/70 px-3 py-1.5 rounded hover:bg-white/10",
    choice: "choice w-full py-2 pr-2 rounded hover:bg-white/10",
  }[variant];
  return (
    <button
      type="button"
      disabled={disabled}
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

export function Portrait({ id, size = 64, className = "" }: { id: CharacterId; size?: number; className?: string }) {
  const c = CHARACTERS[id];
  return <Sprite name={c.sprite} palette={c.palette} size={size} className={className} label={c.name} />;
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
