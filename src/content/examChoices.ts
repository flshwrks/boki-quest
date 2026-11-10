// 模擬試験の第1問で、問題ごとに出す勘定科目の選択肢。本番と同じく、正解の科目に、まちがえやすい科目を混ぜて6つほどにする

import { type AccountName, categoryOf } from "@/engine/accounts";
import { type Rand, seededRand, shuffle } from "@/game/random";
import type { ExamQuestion } from "@/game/types";

/** まちがえやすい科目のまとまり。正解の科目と同じまとまりから、ほかの選択肢を選ぶ */
export const CONFUSABLE: AccountName[][] = [
  ["現金", "小口現金", "当座預金", "普通預金", "定期預金", "当座借越"],
  ["売掛金", "クレジット売掛金", "受取手形", "電子記録債権", "受取商品券", "未収入金", "立替金"],
  ["買掛金", "未払金", "支払手形", "電子記録債務", "借入金"],
  ["前払金", "前受金", "仮払金", "仮受金"],
  ["貸付金", "手形貸付金", "借入金", "手形借入金", "受取手形", "支払手形"],
  ["仕入", "売上", "発送費", "支払手数料", "繰越商品"],
  ["備品", "車両運搬具", "建物", "土地", "修繕費", "消耗品費"],
  ["減価償却費", "備品減価償却累計額", "固定資産売却益", "固定資産売却損", "未収入金", "未払金"],
  ["給料", "所得税預り金", "社会保険料預り金", "法定福利費", "立替金"],
  ["旅費交通費", "通信費", "消耗品費", "雑費", "租税公課"],
  ["貸倒損失", "貸倒引当金", "貸倒引当金繰入", "貸倒引当金戻入", "償却債権取立益"],
  ["支払利息", "受取利息", "未払利息", "未収利息"],
  ["法人税、住民税及び事業税", "仮払法人税等", "未払法人税等", "租税公課"],
  ["仮払消費税", "仮受消費税", "未払消費税", "租税公課"],
  ["資本金", "繰越利益剰余金", "利益準備金", "未払配当金", "損益"],
  ["現金過不足", "雑損", "雑益", "受取手数料"],
  ["支払家賃", "受取家賃", "前受家賃", "未収家賃", "未払家賃", "差入保証金", "支払手数料"],
  ["支払地代", "受取地代", "前払地代"],
  ["支払保険料", "前払保険料", "貯蔵品", "通信費"],
];

/** 問題の文から決まる乱数（同じ問題なら、開き直しても選択肢が変わらない） */
function randOf(text: string): Rand {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return seededRand(h || 1);
}

/** 正解の科目と、同じまとまりのまちがえやすい科目。正解の科目が多いときも、ほかの科目を2つは混ぜる */
export function accountChoices(q: ExamQuestion, size = 6): AccountName[] {
  const answer = [...new Set([...q.answer.debit, ...q.answer.credit].map((l) => l.account))];
  const rand = randOf(q.text);
  const others = (xs: AccountName[]) => shuffle([...new Set(xs)].filter((a) => !answer.includes(a)), rand);
  // 同じまとまりの科目を先に、足りなければ同じ種類（資産・負債など）の科目で補う
  const near = others(CONFUSABLE.filter((g) => g.some((a) => answer.includes(a))).flat());
  const kinds = new Set(answer.map(categoryOf));
  const sameKind = others(CONFUSABLE.flat().filter((a) => kinds.has(categoryOf(a)) && !near.includes(a)));
  return [...answer, ...[...near, ...sameKind].slice(0, Math.max(2, size - answer.length))];
}
