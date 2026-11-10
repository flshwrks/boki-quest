/** 求め方の解説。「⚠ 」から後ろは、つまずきやすい点として目立たせる（mockExam.ts の withTrap が付ける） */
export function Why({ text, className = "text-sm" }: { text: string; className?: string }) {
  const [main, ...traps] = text.split("⚠ ");
  return (
    <div className={className}>
      {main.trim() && <p>🧮 {main.trim()}</p>}
      {traps.map((t) => (
        <Trap key={t} text={t.trim()} />
      ))}
    </div>
  );
}

/** つまずきやすい点（表の数字と問題文の数字がずれる理由など） */
export function Trap({ text }: { text: string }) {
  return (
    <p className="mt-2 rounded border-l-4 border-red-400 bg-red-400/10 p-2 text-xs">
      <b className="text-red-300">⚠ ここでつまずきやすい</b>
      <br />
      {text}
    </p>
  );
}
