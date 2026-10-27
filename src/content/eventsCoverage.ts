// 出題範囲を網羅するために追加した取引。
// 店で自然に起きるもの（修理・印紙・定期預金・請求書・家賃など）は店の帳簿に記入し、
// 店の帳簿を壊してしまうもの（土地の購入・固定資産の売却・手形での貸し借りなど）は
// 「商人ギルドの帳簿相談」として、店の帳簿には記入しない練習にする。

import type { AccountName } from "@/engine/accounts";
import type { Choice, LessonId, Transaction, Voucher } from "@/game/types";
import { EXAM_BANK } from "./examBank";
import { type EventTemplate, adjustment, decline, je, n, needCash, payFrom, pick, viaPhrase } from "./eventKit";
import { reversal } from "./eventsClosing";
import { lowestStockItem, orderQtys, purchaseTx } from "./events";
import { DAYS_PER_MONTH, DAYS_PER_YEAR, ITEMS, calendarMonth, monthOfYear, yearStartDay } from "./world";

// ───────── 修繕費・租税公課・雑費 ─────────

const repair: EventTemplate = {
  lesson: "taxes",
  schedule: 0.1,
  build: (ctx) => {
    const amt = pick(ctx.rand, [3000, 5000, 8000]);
    const tx = (via: AccountName): Transaction => ({
      story: `ガタついた陳列棚の修理代${n(amt)}円を払った。`,
      exam: `店舗の陳列棚の修理を行い、修理代金${n(amt)}円を${viaPhrase(via)}支払った。`,
      answer: je([["修繕費", amt]], [[via, amt]]),
      idea: "壊れた物を元どおりに直すための費用じゃ。",
    });
    return {
      speaker: "gantetsu",
      lines: ["棚がガタついておったから、ついでに直しておいたぞ。", `修理代は${n(amt)}円じゃ。`],
      choices: payFrom(ctx, amt, ["現金", "普通預金"], tx),
    };
  },
};

const revenueStamp: EventTemplate = {
  lesson: "taxes",
  schedule: 0.08,
  build: (ctx) => {
    const amt = 2000;
    return {
      speaker: "hoho",
      lines: ["まとめ買いのお客さんに渡す領収書には、収入印紙を貼らねばならん。", `${n(amt)}円分買っておこう。`],
      choices: [
        {
          label: "現金で買う",
          disabled: needCash(ctx, amt),
          tx: {
            story: `領収書に貼る収入印紙${n(amt)}円分を買った。`,
            exam: `収入印紙${n(amt)}円分を購入し、代金は現金で支払った。`,
            answer: je([["租税公課", amt]], [["現金", amt]]),
            idea: "印紙は税金の一種（印紙税）じゃ。利益にかかる法人税等とは別の科目じゃぞ。",
            note: "買った印紙はすぐ領収書に貼って使った。もし決算日に残っていたら、貯蔵品にするのじゃ。",
          },
        },
      ],
    };
  },
};

const misc: EventTemplate = {
  lesson: "taxes",
  schedule: 0.06,
  build: (ctx) => {
    const amt = 1000;
    return {
      speaker: "pipi",
      lines: ["お店の前の落ち葉、妖精仲間に掃除してもらったよ！", `お礼に${n(amt)}円ちょうだい♪`],
      choices: [
        {
          label: "現金で払う",
          disabled: needCash(ctx, amt),
          tx: {
            story: `店先の掃除のお礼${n(amt)}円を払った。`,
            exam: `店舗前の清掃代${n(amt)}円を現金で支払い、雑費として処理した。`,
            answer: je([["雑費", amt]], [["現金", amt]]),
            idea: "どの費用にも当てはまらない、少しの出費じゃ。",
          },
        },
        decline("自分で掃除する", "ピピ「えー、ケチ〜」"),
      ],
    };
  },
};

const VEHICLE_TAX = 6000;

const vehicleTax: EventTemplate = {
  lesson: "taxes",
  schedule: 0.3,
  once: "year",
  build: (ctx) => {
    if (ctx.balance("車両運搬具") <= 0) return null;
    const tx = (via: AccountName): Transaction => ({
      story: `荷馬車の税金${n(VEHICLE_TAX)}円を納めた。`,
      exam: `営業用の車両にかかる自動車税${n(VEHICLE_TAX)}円を${viaPhrase(via)}納付した。`,
      answer: je([["租税公課", VEHICLE_TAX]], [[via, VEHICLE_TAX]]),
      idea: "車にかかる税金は、利益とは関係なくかかる税金じゃ。",
    });
    return {
      speaker: "cecil",
      lines: ["荷馬車の税金（自動車税にあたります）の納付書が届いています。", `${n(VEHICLE_TAX)}円です。`],
      choices: payFrom(ctx, VEHICLE_TAX, ["普通預金", "現金"], tx, "納付する"),
    };
  },
};

// ───────── 証ひょう ─────────

const invoicePurchase: EventTemplate = {
  lesson: "voucher",
  schedule: 0.25,
  build: (ctx) => {
    const { state, rand } = ctx;
    if (!ctx.has("credit")) return null;
    const item = lowestStockItem(state);
    const qty = pick(rand, orderQtys(item, state.level));
    const it = ITEMS[item];
    const amount = it.cost * qty;
    // 消費税を習ったあとは、請求書にも消費税を書く（仕訳は進行側で税抜方式に直る）
    const tax = ctx.has("salestax") ? Math.floor(amount * 0.1) : 0;
    const doc: Voucher = {
      title: "納品書兼請求書",
      lines: [`${state.shopName} 御中`, "ドワーフ商会 ガンテツ"],
      head: ["品名", "数量", "単価", "金額"],
      rows: [[it.name, `${qty}`, n(it.cost), n(amount)], ...(tax > 0 ? [["消費税（10%）", "", "", n(tax)]] : [])],
      notes: [`合計 ${n(amount + tax)}円`, "お支払期限：今月末日"],
    };
    const tx: Transaction = {
      ...purchaseTx(item, qty, "買掛金"),
      story: `ガンテツから${it.name}${qty}${it.unit}が届き、納品書兼請求書を受け取った。`,
      exam: "商品を仕入れ、品物とともに次の納品書兼請求書を受け取った。代金は月末に支払う。",
      idea: "請求書を受け取っただけで、まだ払っていない。商品の代金だから…？",
      doc,
    };
    return {
      speaker: "gantetsu",
      lines: ["今日は品物と一緒に、ちゃんとした納品書兼請求書を持ってきたぞ。", "代金は月末でよい。書類をよく読んで記帳するんじゃぞ。"],
      choices: [{ label: "受け取って記帳する", tx }, decline("今回は断る", "ガンテツ「そうか。また持ってくるわい」")],
    };
  },
};

const receiptSupplies: EventTemplate = {
  lesson: "voucher",
  schedule: 0.12,
  build: (ctx) => {
    const amt = 3000;
    return {
      speaker: "hoho",
      lines: ["帳面用の羊皮紙とインクを買ってきたぞ。代金は払っておいた。", "ほれ、文具屋の領収書じゃ。"],
      choices: [
        {
          label: "領収書を見て記帳する",
          disabled: needCash(ctx, amt),
          tx: {
            story: `羊皮紙とインクを${n(amt)}円で買った（領収書あり）。`,
            exam: "事務用品を購入して代金を現金で支払い、次の領収書を受け取った。",
            answer: je([["消耗品費", amt]], [["現金", amt]]),
            idea: "領収書は、代金を払い終えた証拠じゃ。何を買って、どう払ったかな？",
            doc: {
              title: "領収書",
              lines: [`${ctx.state.shopName} 様`, "王都文具店"],
              head: ["品名", "数量", "単価", "金額"],
              rows: [
                ["羊皮紙", "10", "200", "2,000"],
                ["インク", "2", "500", "1,000"],
              ],
              notes: ["合計 3,000円", "上記の金額を現金で受け取りました"],
            },
          },
        },
      ],
    };
  },
};

// ───────── 定期預金 ─────────

/** 定期預金の期間（3か月）と年利 */
const TERM_DAYS = 3 * DAYS_PER_MONTH;
const DEPOSIT_RATE = 0.02;

const timeDeposit: EventTemplate = {
  lesson: "deposits",
  schedule: 0.3,
  build: (ctx) => {
    const { state } = ctx;
    if (ctx.balance("定期預金") > 0) return null;
    // 満期が決算日をまたがないようにする（利息の未収計上は扱わない）
    if (yearStartDay(state.day) + DAYS_PER_YEAR - state.day <= TERM_DAYS) return null;
    const savings = ctx.balance("普通預金");
    const amt = savings >= 300000 ? 100000 : 50000;
    if (savings < amt + 50000) return null;
    return {
      speaker: "luke",
      lines: ["普通預金に余裕がありますね。定期預金にしませんか？", `3か月で年${DEPOSIT_RATE * 100}%の利息がつきます。${n(amt)}円でいかがでしょう。`],
      choices: [
        {
          label: `${n(amt)}円を定期預金にする`,
          tx: {
            story: `普通預金から${n(amt)}円を定期預金に預けた。`,
            exam: `普通預金口座から定期預金口座へ${n(amt)}円を預け入れた。`,
            answer: je([["定期預金", amt]], [["普通預金", amt]]),
            idea: "お金の置き場所が変わっただけ。普通預金が減って、別の資産が増えたね。",
          },
        },
        decline("今はやめておく", "ルーク「承知しました。いつでもどうぞ」"),
      ],
    };
  },
};

const timeDepositMature: EventTemplate = {
  lesson: "deposits",
  schedule: "daily",
  build: (ctx) => {
    const { state } = ctx;
    const principal = ctx.balance("定期預金");
    const last = state.journal.findLast((r) => r.templateId === "time-deposit");
    if (principal <= 0 || !last || state.day - last.day < TERM_DAYS) return null;
    const interest = Math.round((principal * DEPOSIT_RATE * 3) / 12);
    return {
      speaker: "luke",
      lines: ["定期預金が満期になりました。", `元金${n(principal)}円と利息${n(interest)}円を、普通預金にお入れします。`],
      choices: [
        {
          label: "記帳する",
          tx: {
            story: `定期預金${n(principal)}円が満期になり、利息${n(interest)}円とともに普通預金に入った。`,
            exam: `定期預金${n(principal)}円が満期となり、利息${n(interest)}円とともに普通預金口座に入金された。`,
            answer: je(
              [["普通預金", principal + interest]],
              [
                ["定期預金", principal],
                ["受取利息", interest],
              ],
            ),
            idea: "定期預金が普通預金に戻り、利息の分だけ多く入ってきた。利息は収益じゃ。",
            note: `${n(principal)} × ${DEPOSIT_RATE * 100}% × 3/12 = ${n(interest)}円じゃ。`,
          },
        },
      ],
    };
  },
};

// ───────── 家賃（屋根裏の貸し出し） ─────────

export const ATTIC_RENT = 5000;
/** 1回に受け取る家賃の月数 */
export const ATTIC_MONTHS = 6;

const atticRent: EventTemplate = {
  lesson: "rentals",
  schedule: "daily",
  build: (ctx) => {
    const { state } = ctx;
    const last = state.journal.findLast((r) => r.templateId === "attic-rent");
    if (last && state.day - last.day < ATTIC_MONTHS * DAYS_PER_MONTH) return null;
    const amt = ATTIC_RENT * ATTIC_MONTHS;
    return {
      speaker: "mina",
      lines: [
        last ? "屋根裏の工房、また半年お借りするわ。" : "ねえ、屋根裏の空き部屋を魔法の工房として貸してもらえないかしら。",
        `家賃は月${n(ATTIC_RENT)}円、${ATTIC_MONTHS}か月分${n(amt)}円を前払いで振り込んでおくわね。`,
      ],
      choices: [
        {
          label: "貸して、家賃を受け取る",
          tx: {
            story: `ミーナに屋根裏を貸し、${ATTIC_MONTHS}か月分の家賃${n(amt)}円が普通預金に入った。`,
            exam: `建物の一部を賃貸し、${ATTIC_MONTHS}か月分の家賃${n(amt)}円が普通預金口座に振り込まれた。`,
            answer: je([["普通預金", amt]], [["受取家賃", amt]]),
            idea: "部屋を貸して受け取ったお金。収益の科目は何だったかな？",
            note: "決算日のあとの分まで受け取っていたら、決算でその分を前受家賃に直すのじゃ。",
          },
        },
      ],
    };
  },
};

/** 決算：最後に受け取った家賃のうち、決算日のあとの月の分を前受家賃にする */
const unearnedRent: EventTemplate = {
  lesson: "rentals",
  build: (ctx) => {
    const { state } = ctx;
    const last = state.journal.findLast((r) => r.templateId === "attic-rent");
    if (!last || last.day < yearStartDay(state.day)) return null;
    // 受け取った月から3月までが今期の分。残りが翌期の分
    const used = 12 - monthOfYear(last.day) + 1;
    const ahead = ATTIC_MONTHS - used;
    if (ahead <= 0) return null;
    const amount = ATTIC_RENT * ahead;
    return adjustment("hoho", [`ミーナから受け取った家賃のうち、決算日のあとの${ahead}か月分は来年の収益じゃ。`], {
      story: `受取家賃のうち来年分${n(amount)}円を前受家賃にした。`,
      exam: `受取家賃は、当期の${calendarMonth(monthOfYear(last.day))}月1日に向こう${ATTIC_MONTHS}か月分${n(ATTIC_RENT * ATTIC_MONTHS)}円を受け取ったものである。前受分を月割で計上する。`,
      answer: je([["受取家賃", amount]], [["前受家賃", amount]]),
      idea: "次の期の分まで受け取った収益は、その分を負債（前受家賃）に移すよ。",
      note: `${n(ATTIC_RENT)} × ${ahead}か月 = ${n(amount)}円じゃ。`,
    });
  },
};

// ───────── 償却債権取立益 ─────────

const recovery: EventTemplate = {
  lesson: "advanced",
  schedule: 0.1,
  build: (ctx) => {
    const { state } = ctx;
    // 前の年度までに貸倒れにしたツケのうち、まだ回収の話が来ていないもの
    const written = state.journal.filter((r) => r.templateId === "bad-debt" && r.day < yearStartDay(state.day));
    const recovered = state.journal.filter((r) => r.templateId === "recovery").length;
    const target = written[recovered];
    if (!target) return null;
    const lost = target.entry.credit.find((l) => l.account === "売掛金")?.amount ?? 0;
    const amt = Math.floor(lost / 2 / 100) * 100;
    if (amt <= 0) return null;
    return {
      speaker: pick(ctx.rand, ["allen", "gord"] as const),
      lines: ["…ただいま。ダンジョンの奥で迷子になってたんだ。", `前のツケ、全部は無理だけど${n(amt)}円だけでも返させてくれ！`],
      choices: [
        {
          label: "受け取る（現金）",
          tx: {
            story: `前の年度に貸倒れにしたツケのうち${n(amt)}円が、現金で返ってきた。`,
            exam: `前期に貸倒れとして処理した売掛金のうち${n(amt)}円を現金で回収した。`,
            answer: je([["現金", amt]], [["償却債権取立益", amt]]),
            idea: "このツケはもう帳簿から消してある。売掛金を減らすのではなく、思わぬ収益になるのじゃ。",
            effect: { reputation: 2 },
          },
        },
      ],
    };
  },
};

// ───────── 商人ギルドの帳簿相談（店の帳簿には記入しない練習） ─────────

const GUILD_IDEA: Partial<Record<LessonId, string>> = {
  taxes: "税金のうち、利益にかからないものは租税公課じゃ。",
  voucher: "書類は誰が誰に出したものか、代金はどうしたかを読むのじゃ。",
  deposits: "定期預金は普通預金とは別の資産。当座預金の貸方残高は、決算で当座借越にするのじゃ。",
  notesloan: "お金の貸し借りに使った手形じゃ。受取手形・支払手形ではないぞ。",
  fixedsale: "付随費用は取得原価に含める。売却なら、取得原価と累計額を消して、差額が売却損益じゃ。",
  rentals: "今期の分か、次の期の分か。お金はもう動いたか。この2つで経過勘定が決まる。",
  advanced: "訂正なら、誤った仕訳の逆と正しい仕訳を合わせる。前の期に貸倒れにした債権の回収は収益じゃ。",
};

function guild(lesson: LessonId): EventTemplate {
  const pool = EXAM_BANK.filter((q) => q.lesson === lesson);
  return {
    lesson,
    schedule: 0.08,
    build: (ctx) => {
      const q = pick(ctx.rand, pool);
      const tx: Transaction = {
        story: "商人ギルドに届いた、よその商会からの帳簿の相談。店の帳簿には記入しない。",
        exam: q.text,
        answer: q.answer,
        idea: GUILD_IDEA[lesson] ?? "増えたもの・減ったものを書き出してみよう。",
        doc: q.doc,
        offBooks: true,
      };
      const choices: Choice[] = [
        { label: "相談にのる（仕訳を書く）", tx },
        decline("今日は忙しいので断る", "セシル「わかりました。また今度お願いしますね」"),
      ];
      return {
        speaker: "cecil",
        lines: ["商人ギルドの帳簿相談です。よその商会から、こんな取引の仕訳を聞かれまして…", "店の帳簿には書かない練習ですから、気軽にどうぞ。"],
        choices,
      };
    },
  };
}

export const COVERAGE_TEMPLATES: Record<string, EventTemplate> = {
  repair,
  "revenue-stamp": revenueStamp,
  misc,
  "vehicle-tax": vehicleTax,
  "invoice-purchase": invoicePurchase,
  "receipt-supplies": receiptSupplies,
  "time-deposit": timeDeposit,
  "time-deposit-mature": timeDepositMature,
  "attic-rent": atticRent,
  "close-unearned-rent": unearnedRent,
  "reverse-unearned-rent": reversal("rentals", "前受家賃", "受取家賃", "去年の決算で来年分にした家賃は、今年の収益じゃ。"),
  recovery,
  ...Object.fromEntries(
    (["taxes", "voucher", "deposits", "notesloan", "fixedsale", "rentals", "advanced"] as LessonId[]).map((l) => [`guild-${l}`, guild(l)]),
  ),
};
