/** 金額の表示（3桁区切り） */
export const fmt = (n: number) => n.toLocaleString("ja-JP");

/** 入力欄の金額（3桁区切りのカンマ可）を数値にする。読めなければ 0 */
export const parseAmount = (s: string) => Number(s.replaceAll(",", "")) || 0;
