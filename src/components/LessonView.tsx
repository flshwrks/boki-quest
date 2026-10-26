"use client";

import { LESSON_BY_ID, type Diagram } from "@/content/lessons";
import type { LessonId } from "@/game/types";
import { CATEGORY_LABEL } from "@/engine/accounts";
import { Btn, CATEGORY_BG, Dialogue, EntryTable, Portrait, Speaker, Win } from "./ui";

const FIVE = (
  [
    ["asset", "持っている財産・権利", "現金・預金・売掛金"],
    ["liability", "あとで払う義務", "買掛金・借入金"],
    ["equity", "資産−負債＝元手", "資本金"],
    ["revenue", "もうけのもと", "売上"],
    ["expense", "もうけるために使った", "仕入・家賃"],
  ] as const
).map(([cat, desc, ex]) => ({ label: CATEGORY_LABEL[cat], bg: CATEGORY_BG[cat], desc, ex }));

function DiagramView({ d }: { d: Diagram }) {
  switch (d.type) {
    case "five":
      return (
        <ul className="grid gap-1.5 sm:grid-cols-5">
          {FIVE.map((f) => (
            <li key={f.label} className={`${f.bg} rounded p-2 text-sm`}>
              <div className="text-base">{f.label}</div>
              <div className="text-xs">{f.desc}</div>
              <div className="mt-1 text-xs opacity-90">例：{f.ex}</div>
            </li>
          ))}
        </ul>
      );
    case "sides":
      return (
        <div className="grid grid-cols-2 border-2 border-white/60 text-center">
          <div className="border-r-2 border-white/60 p-3">
            <div className="text-gold">借方（かりかた）</div>
            <div className="text-sm">左側</div>
            <div className="mt-1 text-xs text-dim">「り」のはらいは左へ</div>
          </div>
          <div className="p-3">
            <div className="text-gold">貸方（かしかた）</div>
            <div className="text-sm">右側</div>
            <div className="mt-1 text-xs text-dim">「し」のはらいは右へ</div>
          </div>
          <div className="col-span-2 border-t-2 border-white/60 p-2 text-sm">左の合計 ＝ 右の合計</div>
        </div>
      );
    case "home":
      return (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
          <div className="text-center text-gold">借方（左）に増える</div>
          <div className="text-center text-gold">貸方（右）に増える</div>
          <div className="flex flex-col gap-1.5">
            <div className="rounded bg-asset p-2">資産 ＋</div>
            <div className="rounded bg-expense p-2">費用 ＋</div>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="rounded bg-liability p-2">負債 ＋</div>
            <div className="rounded bg-equity p-2">純資産 ＋</div>
            <div className="rounded bg-revenue p-2">収益 ＋</div>
          </div>
          <div className="col-span-2 mt-1 text-center text-xs text-dim">減ったときは反対側に書く</div>
        </div>
      );
    case "entries":
      return (
        <div className="flex flex-col gap-3">
          {d.items.map((it) => (
            <figure key={it.caption} className="rounded border border-white/30 p-2">
              <figcaption className="mb-1 text-xs text-dim">{it.caption}</figcaption>
              <EntryTable entry={it.entry} />
            </figure>
          ))}
        </div>
      );
    case "list":
      return (
        <dl className="grid gap-1.5 text-sm">
          {d.rows.map(([term, desc]) => (
            <div key={term} className="grid grid-cols-[6.5em_1fr] gap-2 rounded bg-white/5 p-1.5">
              <dt className="text-gold">{term}</dt>
              <dd>{desc}</dd>
            </div>
          ))}
        </dl>
      );
  }
}

export function LessonView({
  lessonId,
  page,
  onTurn,
  finishLabel = "講義を終える",
}: {
  lessonId: LessonId;
  page: number;
  onTurn: (delta: number) => void;
  finishLabel?: string;
}) {
  const lesson = LESSON_BY_ID[lessonId];
  const p = lesson.pages[page];
  const speaker = p.speaker ?? "hoho";
  const last = page === lesson.pages.length - 1;
  return (
    <Win>
      <div className="mb-3 flex items-center justify-between text-xs text-dim">
        <span>
          講義：<span className="text-gold">{lesson.title}</span>
        </span>
        <span aria-label={`${lesson.pages.length}ページ中${page + 1}ページ目`}>
          {lesson.pages.map((_, i) => (
            <span key={i} className={i === page ? "text-gold" : ""}>
              ●
            </span>
          ))}
        </span>
      </div>
      <div key={page} className="rise flex gap-3">
        <Portrait id={speaker} size={56} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <Speaker id={speaker} />
          <Dialogue text={p.text}>
            {p.diagram && (
              <div className="rise mt-3">
                <DiagramView d={p.diagram} />
              </div>
            )}
          </Dialogue>
        </div>
      </div>
      <div className="mt-4 flex justify-between">
        <Btn variant="ghost" onClick={() => onTurn(-1)} disabled={page === 0}>
          もどる
        </Btn>
        <Btn onClick={() => onTurn(1)}>{last ? finishLabel : "つぎへ"}</Btn>
      </div>
    </Win>
  );
}
