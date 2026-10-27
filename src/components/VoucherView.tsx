import type { Voucher } from "@/game/types";

/** 証ひょう（請求書・領収書など）。紙の書類らしく見せる */
export function VoucherView({ doc }: { doc: Voucher }) {
  const amountCol = doc.head.length - 1;
  return (
    <div className="my-2 max-w-md rounded border border-[#b8a77a] bg-[#fffdf3] p-2 text-xs text-[#2b2618] shadow-sm sm:text-sm">
      <p className="mb-1 text-center tracking-[0.3em] font-bold">{doc.title}</p>
      <div className="mb-1 flex flex-wrap justify-between gap-x-4">
        {doc.lines.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {doc.head.map((h) => (
              <th key={h} className="border border-[#b8a77a] bg-[#f3ecd2] px-1 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {doc.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td
                  key={j}
                  className={`border border-[#b8a77a] px-1 ${j === 0 ? "" : "text-right tabular-nums"} ${j === amountCol ? "min-w-16" : ""}`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {doc.notes.map((l) => (
        <p key={l} className="mt-1 text-right">
          {l}
        </p>
      ))}
    </div>
  );
}
