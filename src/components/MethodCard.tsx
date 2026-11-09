import type { ExamFormat } from "@/content/examFormats";

/** この問題の意義・考え方・解き方の手順・よくある間違い。最初の下書きと採点のあとは開いておく */
export function MethodCard({ format, open }: { format: ExamFormat; open?: boolean }) {
  return (
    <details open={open} className="mb-3 rounded-lg border border-gold/40 p-2 text-sm">
      <summary className="cursor-pointer text-gold">この問題の意義・考え方・解き方</summary>
      <p className="mt-2 text-xs text-gold">この問題で何をするのか</p>
      <p className="mt-1">{format.purpose}</p>
      <p className="mt-2 text-xs text-gold">考え方</p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {format.ideas.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-gold">解き方の手順</p>
      <ol className="mt-1 list-decimal space-y-1 pl-5">
        {format.method.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-gold">よくある間違い</p>
      <ul className="list-disc pl-5 text-xs text-dim">
        {format.traps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </details>
  );
}
