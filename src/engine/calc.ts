/**
 * 電卓の式を計算する（×÷を先に計算する、ふつうの順序）。式が途中で終わっている・0で割るなどは null。
 * 記号は + − × ÷ のほか、キーボードの - * / も使える
 */
export function evaluate(expr: string): number | null {
  const tokens = expr.replaceAll(",", "").match(/\d+(?:\.\d*)?|\.\d+|[+\-−×÷*/]/g);
  if (!tokens || tokens.join("") !== expr.replaceAll(",", "").replace(/\s/g, "")) return null;
  // 項（×÷でつながった部分）を足し引きする
  let total = 0;
  let sign = 1;
  let term: number | null = null;
  let op: "×" | "÷" | null = null;
  for (const t of tokens) {
    if (/[\d.]/.test(t)) {
      const v = Number(t);
      if (term === null) term = v;
      else if (op === "×") term *= v;
      else if (op === "÷") {
        if (v === 0) return null;
        term /= v;
      } else return null;
      op = null;
    } else if (t === "×" || t === "*" || t === "÷" || t === "/") {
      if (term === null || op) return null;
      op = t === "×" || t === "*" ? "×" : "÷";
    } else {
      if (op) return null;
      // 先頭の「−」は負の数
      if (term === null && total === 0 && sign === 1) {
        sign = t === "+" ? 1 : -1;
        continue;
      }
      if (term === null) return null;
      total += sign * term;
      term = null;
      sign = t === "+" ? 1 : -1;
    }
  }
  if (term === null || op) return null;
  // 小数の誤差（0.1×3 など）を丸める
  return Math.round((total + sign * term) * 1e6) / 1e6;
}
