// Lv3「取引の拡大」の取引イベント

import type { AccountName } from "@/engine/accounts";
import { sumAmounts } from "@/engine/journal";
import type { CharacterId, CreditKind, ItemId, LessonId } from "@/game/types";
import {
  CUSTOMER_PREFS,
  type EventTemplate,
  checkingRoom,
  creditsOf,
  decline,
  je,
  n,
  name,
  needDeposit,
  pick,
  pickSale,
  settleAll,
  settleDue,
  voiceOf,
} from "./eventKit";
import { ITEMS, dayInMonth } from "./world";

const saleStory = (who: CharacterId, item: ItemId, qty: number) => `${name(who)}に${ITEMS[item].name}を${qty}${ITEMS[item].unit}売った`;

/** ガンテツへの買掛金を、手形や電子記録債務での支払いに切り替える。期日に当座預金で払える範囲でだけ持ちかけられる */
function convertPayable(
  kind: Extract<CreditKind, "支払手形" | "電子記録債務">,
  t: { lesson: LessonId; lines: (amt: number) => string[]; label: string; story: (amt: number) => string; exam: (amt: number) => string; idea: string },
): EventTemplate {
  return {
    lesson: t.lesson,
    review: kind === "支払手形" ? 0.25 : 0.2,
    build: (ctx) => {
      const ap = creditsOf(ctx.state, "買掛金", "gantetsu");
      if (ap.length === 0) return null;
      const amt = sumAmounts(ap);
      if (checkingRoom(ctx) < amt) return null;
      return {
        speaker: "gantetsu",
        lines: t.lines(amt),
        choices: [
          {
            label: t.label,
            tx: {
              story: t.story(amt),
              exam: t.exam(amt),
              answer: je([["買掛金", amt]], [[kind, amt]]),
              idea: t.idea,
              effect: { settleCredits: settleAll(ap), addCredits: [{ kind, who: "gantetsu", amount: amt }] },
            },
          },
          decline("いつもどおり払う", "ガンテツ「そうか。では月末にな」"),
        ],
      };
    },
  };
}

// ───────── 当座預金・約束手形 ─────────

const openChecking: EventTemplate = {
  lesson: "notes",
  schedule: "daily",
  build: (ctx) => {
    // 練習以外では、当座預金が心細いときだけ声をかけてくる
    if (!ctx.guided && checkingRoom(ctx) >= 20000) return null;
    const amounts = [50000, 100000].filter((a) => a <= ctx.balance("普通預金"));
    if (amounts.length === 0) return null;
    return {
      speaker: "luke",
      lines: ["手形や電子記録の決済には、商売用の当座預金口座を使います。", `普通預金から当座預金へ資金を移しておきましょう。（当座預金 ${n(ctx.balance("当座預金"))}円）`],
      choices: [
        ...amounts.map((a) => ({
          label: `${n(a)}円を移す`,
          tx: {
            story: `普通預金から当座預金へ${n(a)}円を移した。`,
            exam: `普通預金口座から当座預金口座へ${n(a)}円を振り替えた。`,
            answer: je([["当座預金", a]], [["普通預金", a]]),
            idea: "どちらも資産の口座。お金はどちらからどちらへ動いた？",
          },
        })),
        decline("今はいい", "ルーク「承知しました」"),
      ],
    };
  },
};

const customerNote: EventTemplate = {
  lesson: "notes",
  review: 0.3,
  walkIn: 1,
  build: (ctx) => {
    const { state, rand } = ctx;
    const ar = creditsOf(state, "売掛金").filter((c) => c.amount >= 5000);
    // ツケを手形で払ってもらう
    if (!ctx.guided && ar.length > 0 && rand() < 0.4) {
      const c = pick(rand, ar);
      return {
        speaker: c.who,
        lines: [voiceOf(c.who).noteDebt(n(c.amount))],
        choices: [
          {
            label: "手形で受け取る",
            tx: {
              story: `${name(c.who)}からツケの代わりに約束手形${n(c.amount)}円を受け取った。`,
              exam: `売掛金${n(c.amount)}円の回収として、得意先振出しの約束手形を受け取った。`,
              answer: je([["受取手形", c.amount]], [["売掛金", c.amount]]),
              idea: "売上は商品を渡したときに記録済み。ツケ（売掛金）が手形に変わっただけだよ。",
              effect: { settleCredits: [{ id: c.id, amount: c.amount }], addCredits: [{ kind: "受取手形", who: c.who, amount: c.amount }] },
            },
          },
        ],
      };
    }
    const sale = pickSale(ctx, "gord", 5000);
    if (!sale) return null;
    const { item, qty, amount } = sale;
    return {
      speaker: "gord",
      lines: [
        "おう、遠征隊の分をまとめて頼む。",
        `「${voiceOf("gord").want(`${ITEMS[item].name}${qty}${ITEMS[item].unit}`)}」（${n(amount)}円）`,
        "代金はギルドの約束手形で払う。期日は来月だ。",
      ],
      choices: [
        {
          label: "手形で受け取って売る",
          tx: {
            story: `${saleStory("gord", item, qty)}。代金は約束手形で受け取った。`,
            exam: `商品${n(amount)}円を売り上げ、代金は得意先振出しの約束手形で受け取った。`,
            answer: je([["受取手形", amount]], [["売上", amount]]),
            idea: "商品を売った。代金の代わりに受け取った手形は、期日にお金を受け取れる権利だね。",
            taxable: true,
            effect: { stock: { [item]: -qty }, reputation: 2, addCredits: [{ kind: "受取手形", who: "gord", amount }] },
          },
        },
        decline("手形はお断りする", "ゴルド「そうか、現金を用意してまた来る」", -2),
      ],
    };
  },
};

const noteDue = settleDue("受取手形", {
  lesson: "notes",
  speaker: "luke",
  lines: (amt) => ["受け取っていた約束手形が期日を迎えました。", `${n(amt)}円が当座預金に入金されています。`],
  story: (amt) => `受取手形${n(amt)}円が期日に決済され、当座預金に入った。`,
  exam: (amt) => `かねて受け取っていた約束手形${n(amt)}円が期日となり、当座預金口座に入金された。`,
  idea: "手形の代金を受け取った。期日にお金を受け取る権利（受取手形）はどうなる？",
});

const payByNote = convertPayable("支払手形", {
  lesson: "notes",
  lines: (amt) => [`掛け代金${n(amt)}円の支払い、約束手形で払ってくれてもいいぞ。`, "期日は来月じゃ。当座預金に残高を用意しておくんじゃぞ。"],
  label: "約束手形を振り出す",
  story: (amt) => `ガンテツへの掛け代金${n(amt)}円の支払いに、約束手形を振り出した。`,
  exam: (amt) => `買掛金${n(amt)}円の支払いのため、約束手形を振り出して渡した。`,
  idea: "ツケ（買掛金）が、手形で払う約束に変わった。振り出した手形は支払う義務だよ。",
});

const notePayDue = settleDue("支払手形", {
  lesson: "notes",
  speaker: "luke",
  lines: (amt) => ["振り出していた約束手形が期日を迎えました。", `${n(amt)}円を当座預金から支払います。`],
  story: (amt) => `支払手形${n(amt)}円が期日に当座預金から支払われた。`,
  exam: (amt) => `かねて振り出していた約束手形${n(amt)}円が期日となり、当座預金口座から支払われた。`,
  idea: "手形の代金を支払った。支払う義務（支払手形）はどうなる？",
});

// ───────── 電子記録債権・債務 ─────────

const erecordReceive: EventTemplate = {
  lesson: "erecords",
  review: 0.25,
  build: ({ state, rand }) => {
    const ar = creditsOf(state, "売掛金");
    if (ar.length === 0) return null;
    const c = pick(rand, ar);
    return {
      speaker: "luke",
      lines: [`${name(c.who)}さんへの売掛金${n(c.amount)}円について、魔導台帳（電子記録債権）に発生記録が行われたと通知が来ています。`],
      choices: [
        {
          label: "記帳する",
          tx: {
            story: `${name(c.who)}へのツケ${n(c.amount)}円が、電子記録債権に変わった。`,
            exam: `得意先に対する売掛金${n(c.amount)}円について、電子記録債権の発生記録が行われたとの通知を受けた。`,
            answer: je([["電子記録債権", c.amount]], [["売掛金", c.amount]]),
            idea: "売掛金が、電子的に記録された債権に置き換わった。手形を受け取ったときと似ているね。",
            effect: { settleCredits: [{ id: c.id, amount: c.amount }], addCredits: [{ kind: "電子記録債権", who: c.who, amount: c.amount }] },
          },
        },
      ],
    };
  },
};

const erecordDue = settleDue("電子記録債権", {
  lesson: "erecords",
  speaker: "luke",
  lines: (amt) => [`電子記録債権${n(amt)}円の支払期日です。当座預金に入金されました。`],
  story: (amt) => `電子記録債権${n(amt)}円が決済され、当座預金に入った。`,
  exam: (amt) => `電子記録債権${n(amt)}円の支払期日が到来し、当座預金口座に入金された。`,
  idea: "代金を受け取ったので、受け取る権利（電子記録債権）を取り崩そう。",
});

const erecordPay = convertPayable("電子記録債務", {
  lesson: "erecords",
  lines: (amt) => [`掛け代金${n(amt)}円、魔導台帳（電子記録債務）で払ってくれるか？`, "期日に当座預金から引き落としじゃ。"],
  label: "電子記録債務で払う",
  story: (amt) => `ガンテツへの掛け代金${n(amt)}円を、電子記録債務に切り替えた。`,
  exam: (amt) => `仕入先に対する買掛金${n(amt)}円の支払いを電子記録債務で行うため、取引銀行を通じて債務の発生記録を行った。`,
  idea: "買掛金が、電子的に記録された債務に置き換わった。手形を振り出したときと似ているね。",
});

const erecordPayDue = settleDue("電子記録債務", {
  lesson: "erecords",
  speaker: "luke",
  lines: (amt) => [`電子記録債務${n(amt)}円の支払期日です。当座預金から引き落とします。`],
  story: (amt) => `電子記録債務${n(amt)}円が当座預金から引き落とされた。`,
  exam: (amt) => `電子記録債務${n(amt)}円の支払期日が到来し、当座預金口座から引き落とされた。`,
  idea: "支払いが済んだので、支払う義務（電子記録債務）を取り崩そう。",
});

// ───────── クレジット売掛金 ─────────

const CARD_FEE_RATE = 0.02;

const cardSale: EventTemplate = {
  lesson: "creditcard",
  review: 0.4,
  walkIn: 1,
  build: (ctx) => {
    const who: CharacterId = pick(ctx.rand, ["allen", "mina", "gord", "lily"] as const);
    const sale = pickSale(ctx, who);
    if (!sale) return null;
    const { item, qty, amount } = sale;
    const fee = Math.round(amount * CARD_FEE_RATE);
    const net = amount - fee;
    return {
      speaker: who,
      lines: [CUSTOMER_PREFS[who].greet, `「${voiceOf(who).want(`${ITEMS[item].name}${qty}${ITEMS[item].unit}`)}」（${n(amount)}円）`, voiceOf(who).cardAsk],
      choices: [
        {
          label: "カード払いで売る（手数料2%）",
          tx: {
            story: `${saleStory(who, item, qty)}。代金はギルドカード払い（手数料${n(fee)}円）。`,
            exam: `商品${n(amount)}円をクレジット払いの条件で販売した。なお、信販会社への手数料（販売代金の2%）は販売時に計上する。`,
            answer: je(
              [
                ["クレジット売掛金", net],
                ["支払手数料", fee],
              ],
              [["売上", amount]],
            ),
            idea: "売上は手数料を引く前の金額。カード会社から受け取れるのは、手数料を引いた分だよ。",
            taxable: true,
            note: `手数料は ${n(amount)} × 2% = ${n(fee)}円。クレジット売掛金は ${n(amount)} − ${n(fee)} = ${n(net)}円じゃ。`,
            effect: { stock: { [item]: -qty }, reputation: 2, addCredits: [{ kind: "クレジット売掛金", who: "cecil", amount: net }] },
          },
        },
        decline("現金払いをお願いする", `${name(who)}「${voiceOf(who).cardOnly}」`, -2),
      ],
    };
  },
};

const cardCollect = settleDue("クレジット売掛金", {
  lesson: "creditcard",
  speaker: "cecil",
  lines: (amt) => ["ギルド信販です！ カード払いの代金をまとめてお振り込みしました。", `${n(amt)}円です。`],
  story: (amt) => `カード払いの代金${n(amt)}円が普通預金に入った。`,
  exam: (amt) => `クレジット売掛金${n(amt)}円が信販会社から普通預金口座に入金された。`,
  idea: "カード会社から代金を受け取った。受け取る権利（クレジット売掛金）はどうなる？",
});

// ───────── 受取商品券 ─────────

const giftcertSale: EventTemplate = {
  lesson: "giftcert",
  review: 0.3,
  walkIn: 1,
  build: (ctx) => {
    const sale = pickSale(ctx, "lily", 2000);
    if (!sale) return null;
    const { item, qty, amount } = sale;
    const cert = Math.min(amount, Math.max(1000, Math.floor((amount * 0.6) / 1000) * 1000));
    const cash = amount - cert;
    const debit: [AccountName, number][] = [["受取商品券", cert]];
    if (cash > 0) debit.push(["現金", cash]);
    return {
      speaker: "lily",
      lines: [
        CUSTOMER_PREFS.lily.greet,
        `「${voiceOf("lily").want(`${ITEMS[item].name}${qty}${ITEMS[item].unit}`)}」（${n(amount)}円）`,
        cash > 0 ? `王国の商品券${n(cert)}円分と、残りは現金でお支払いします。` : `王国の商品券${n(cert)}円分でお支払いします。`,
      ],
      choices: [
        {
          label: "商品券を受け取って売る",
          tx: {
            story: `${saleStory("lily", item, qty)}。商品券${n(cert)}円${cash > 0 ? `と現金${n(cash)}円` : ""}で受け取った。`,
            exam:
              cash > 0
                ? `商品${n(amount)}円を売り上げ、代金のうち${n(cert)}円は自治体発行の商品券で受け取り、残額は現金で受け取った。`
                : `商品${n(amount)}円を売り上げ、代金は自治体発行の商品券で受け取った。`,
            answer: je(debit, [["売上", amount]]),
            idea: "商品券は、あとで換金できる権利。現金で受け取った分とは分けて書こう。",
            taxable: true,
            effect: { stock: { [item]: -qty }, reputation: 2, addCredits: [{ kind: "受取商品券", who: "lily", amount: cert }] },
          },
        },
      ],
    };
  },
};

const giftcertRedeem = settleDue("受取商品券", {
  lesson: "giftcert",
  speaker: "luke",
  lines: (amt) => [`お預かりしていた王国の商品券${n(amt)}円分を換金し、普通預金にお振り込みしました。`],
  story: (amt) => `商品券${n(amt)}円分を換金し、普通預金に入った。`,
  exam: (amt) => `保有する自治体発行の商品券${n(amt)}円を精算し、同額が普通預金口座に振り込まれた。`,
  idea: "商品券を換金した。換金できる権利（受取商品券）はどうなる？",
});

// ───────── 備品と未払金 ─────────

const FIXTURES = [
  { thing: "陳列棚", exam: "店舗用の陳列棚", price: 40000 },
  { thing: "魔導看板", exam: "店舗用の看板", price: 30000 },
  { thing: "ガラスのショーケース", exam: "店舗用のショーケース", price: 60000 },
] as const;

const buyFixture: EventTemplate = {
  lesson: "payables",
  review: 0.1,
  build: (ctx) => {
    if (!ctx.guided && creditsOf(ctx.state, "未払金").length > 0) return null;
    const f = pick(ctx.rand, FIXTURES);
    return {
      speaker: "gantetsu",
      lines: [`特製の${f.thing}を作ってみたんじゃが、店に置かんか？ ${n(f.price)}円じゃ。（評判 +8）`, "代金は月末払いでいいぞ。"],
      choices: [
        {
          label: "後払いで買う",
          tx: {
            story: `${f.thing}を${n(f.price)}円で買った。代金は月末払い。`,
            exam: `${f.exam}${n(f.price)}円を購入し、代金は月末に支払うこととした。`,
            answer: je([["備品", f.price]], [["未払金", f.price]]),
            idea: "長く使う物を買った。商品ではない物の代金をあとで払う義務は、買掛金とは別の科目だよ。",
            note: "商品の仕入れなら買掛金、商品以外の後払いなら未払金。ここが試験のひっかけどころじゃ。",
            effect: { reputation: 8, addCredits: [{ kind: "未払金", who: "gantetsu", amount: f.price }] },
          },
        },
        decline("今回は見送る", "ガンテツ「そうか、気が変わったら言うんじゃぞ」"),
      ],
    };
  },
};

const payPayable = settleDue("未払金", {
  lesson: "payables",
  speaker: "hoho",
  label: "普通預金から支払う",
  lines: (amt) => [`後払いにしていた設備の代金、${n(amt)}円の支払日じゃ。`],
  story: (amt) => `設備の代金の未払分${n(amt)}円を普通預金から払った。`,
  exam: (amt) => `未払金${n(amt)}円を普通預金口座から支払った。`,
  idea: "後払いにしていた代金を払った。支払う義務（未払金）はどうなる？",
});

// ───────── 小口現金 ─────────

const PETTY_FUND = 10000;

const pettyAdvance: EventTemplate = {
  lesson: "pettycash",
  review: 0.5,
  build: (ctx) => {
    if (ctx.balance("小口現金") > 0) return null;
    return {
      speaker: "pipi",
      lines: ["ピピ、お使い係になったよ！ お小遣い帳もちゃんとつけるね！", `まずは${n(PETTY_FUND)}円ちょうだい！`],
      choices: [
        {
          label: `${n(PETTY_FUND)}円を渡す`,
          disabled: needDeposit(ctx, PETTY_FUND),
          tx: {
            story: `ピピに小口現金として${n(PETTY_FUND)}円を渡した。`,
            exam: `定額資金前渡法を採用し、小口現金として${n(PETTY_FUND)}円を普通預金口座から引き出して小口現金係に渡した。`,
            answer: je([["小口現金", PETTY_FUND]], [["普通預金", PETTY_FUND]]),
            idea: "少額の支払い用に前渡ししたお金。普通の現金とは別の科目で管理するよ。",
          },
        },
      ],
    };
  },
};

const pettyReport: EventTemplate = {
  lesson: "pettycash",
  schedule: "daily",
  build: (ctx) => {
    const fund = ctx.balance("小口現金");
    if (fund < 2000) return null;
    if (!ctx.guided && ![3, 5].includes(dayInMonth(ctx.state.day))) return null;
    const travel = pick(ctx.rand, [600, 800, 1200]);
    const supplies = pick(ctx.rand, [300, 500, 800]);
    const stamps = pick(ctx.rand, [0, 200, 400]);
    const used = travel + supplies + stamps;
    if (used > fund) return null;
    const debit: [AccountName, number][] = [
      ["旅費交通費", travel],
      ["消耗品費", supplies],
    ];
    if (stamps > 0) debit.push(["通信費", stamps]);
    const examItems = `交通費${n(travel)}円、文房具代${n(supplies)}円${stamps > 0 ? `、郵便切手代${n(stamps)}円` : ""}`;
    return {
      speaker: "pipi",
      lines: [
        "お使い報告だよ！",
        `乗合馬車代${n(travel)}円、インク代${n(supplies)}円${stamps > 0 ? `、伝書フクロウの切手代${n(stamps)}円` : ""}！ ちゃんと領収書もあるよ！`,
      ],
      choices: [
        {
          label: "報告を受ける",
          tx: {
            story: `ピピから小口現金の使い道（合計${n(used)}円）の報告を受けた。`,
            exam: `小口現金係から、${examItems}の支払報告を受けた。`,
            answer: je(debit, [["小口現金", used]]),
            idea: "使い道ごとに費用の科目へ振り分けて、そのぶん小口現金を減らそう。",
          },
        },
      ],
    };
  },
};

const pettyReplenish: EventTemplate = {
  lesson: "pettycash",
  schedule: "daily",
  routine: true,
  build: (ctx) => {
    const fund = ctx.balance("小口現金");
    if (fund <= 0 || fund >= PETTY_FUND) return null;
    const amt = PETTY_FUND - fund;
    return {
      speaker: "pipi",
      lines: [`使った${n(amt)}円、補給してくれる？ これでまた${n(PETTY_FUND)}円に戻るよ！`],
      choices: [
        {
          label: "補給する",
          disabled: needDeposit(ctx, amt),
          tx: {
            story: `ピピに使った分の${n(amt)}円を補給した。`,
            exam: `小口現金係に、支払報告のあった${n(amt)}円を普通預金口座から補給した。`,
            answer: je([["小口現金", amt]], [["普通預金", amt]]),
            idea: "使った分を足して、小口現金を元の額に戻すよ。",
          },
        },
      ],
    };
  },
};

export const LV3_TEMPLATES: Record<string, EventTemplate> = {
  "open-checking": openChecking,
  "customer-note": customerNote,
  "note-due": noteDue,
  "pay-by-note": payByNote,
  "note-pay-due": notePayDue,
  "erecord-receive": erecordReceive,
  "erecord-due": erecordDue,
  "erecord-pay": erecordPay,
  "erecord-pay-due": erecordPayDue,
  "card-sale": cardSale,
  "card-collect": cardCollect,
  "giftcert-sale": giftcertSale,
  "giftcert-redeem": giftcertRedeem,
  "buy-fixture": buyFixture,
  "pay-payable": payPayable,
  "petty-advance": pettyAdvance,
  "petty-report": pettyReport,
  "petty-replenish": pettyReplenish,
};
