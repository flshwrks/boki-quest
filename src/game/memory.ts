// 忘却曲線にもとづく復習の間隔（間隔反復）。論点ごとの正誤の記録を順にたどって、記憶の定着ぐあいを見積もる。
// 思い出せた（ノーヒントで正解した）ら次の復習までの間隔をのばし、忘れていたら1日に戻す。
// 同じ間隔のうちに何度も正解しても（詰め込み）、間隔はのびない

import type { LessonId, PracticeRecord } from "./types";

export interface Memory {
  /** 最後に練習した日 */
  last: number;
  /** 次の復習までの間隔（営業日） */
  interval: number;
  /** 間隔ののびやすさ（何度も思い出せた論点ほど大きい） */
  ease: number;
  /** 次に復習する日 */
  due: number;
}

/** 間隔は 1→2→4→8→15日 のようにのびる（いちばん長くて15営業日＝3か月） */
const MAX_INTERVAL = 15;
const START_EASE = 2;
const MIN_EASE = 1.3;
const MAX_EASE = 2.8;
/** 間隔の6割以上あけて思い出せたら「間をおいて思い出せた」とみなす */
const SPACED = 0.6;

/** 論点ごとの記憶（記録のない論点は入らない＝すぐ復習する） */
export function memoryOf(practice: PracticeRecord[]): Map<LessonId, Memory> {
  const map = new Map<LessonId, Memory>();
  for (const r of practice) {
    const m = map.get(r.lesson);
    if (!m) {
      map.set(r.lesson, { last: r.day, interval: 1, ease: r.ok ? START_EASE : START_EASE - 0.2, due: r.day + 1 });
      continue;
    }
    if (!r.ok) {
      m.interval = 1;
      m.ease = Math.max(MIN_EASE, m.ease - 0.2);
    } else if (r.day - m.last >= m.interval * SPACED) {
      m.interval = Math.min(MAX_INTERVAL, Math.max(m.interval + 1, Math.round(m.interval * m.ease)));
      m.ease = Math.min(MAX_EASE, m.ease + 0.05);
    }
    m.last = r.day;
    m.due = m.last + m.interval;
  }
  return map;
}

/**
 * 記憶の残りぐあい（0〜1）。間隔のちょうど終わり（復習の日）に9割まで下がる忘却曲線。
 * 記録のない論点は0
 */
export function retention(m: Memory | undefined, day: number): number {
  return m ? Math.pow(0.9, Math.max(0, day - m.last) / m.interval) : 0;
}

/** 復習の急ぎぐあい：間隔に対して、どれだけ時間がたったか（1以上で復習の時期） */
export const overdue = (m: Memory | undefined, day: number) => (m ? (day - m.last) / m.interval : 10);
