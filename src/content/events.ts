import type { AccountName } from "@/engine/accounts";
import { sumAmounts } from "@/engine/journal";
import type { CharacterId, Choice, ItemId, Transaction } from "@/game/types";
import { CUSTOMER_PREFS, type EventTemplate, voiceOf, creditsOf, decline, je, n, name, needCash, needDeposit, pick, settleAll, tradeScale } from "./eventKit";
import { LV3_TEMPLATES } from "./eventsLv3";
import { CLOSING_TEMPLATES } from "./eventsClosing";
import { LV4_TEMPLATES } from "./eventsLv4";
import { LV5_TEMPLATES } from "./eventsLv5";
import { DAYS_PER_MONTH, ITEMS, LEVELS, dayInMonth, itemsForLevel } from "./world";

// ───────── 設立・銀行 ─────────

function withdrawTx(amount: number): Transaction {
  return {
    story: `普通預金から${n(amount)}円を引き出して、レジに入れた。`,
    exam: `普通預金口座から現金${n(amount)}円を引き出した。`,
    answer: je([["現金", amount]], [["普通預金", amount]]),
    idea: "レジの現金は増えた？ 普通預金は？ どちらも資産だよ。",
  };
}

function depositTx(amount: number): Transaction {
  return {
    story: `レジの現金${n(amount)}円を銀行に預けた。`,
    exam: `現金${n(amount)}円を普通預金口座に預け入れた。`,
    answer: je([["普通預金", amount]], [["現金", amount]]),
    idea: "現金が減って、普通預金が増えた。資産が増えたら借方、減ったら貸方。",
  };
}

const founding: EventTemplate = {
  lesson: "founding",
  once: "game",
  build: ({ state }) => {
    return {
      speaker: "cecil",
      lines: [
        `ようこそ商人ギルドへ！ 道具屋「${state.shopName}」の開業手続きですね。`,
        "株式を100株、1株あたり3,000円で発行します。払い込まれたお金は、お店の普通預金口座に入りますよ。",
      ],
      choices: [
        {
          label: "株式会社を設立する！",
          tx: {
            story: "株式を発行して、開業資金が普通預金に入った。",
            exam: "株式会社を設立し、株式100株を1株あたり3,000円で発行し、払込金は普通預金とした。",
            answer: je([["普通預金", 300000]], [["資本金", 300000]]),
            idea: "お金はどこに入った？ そのお金は、店の「元手」として集めたものだね。",
            note: "資本金は「株式数 × 1株の金額」＝100株 × 3,000円。純資産が増えたから貸方じゃ。",
          },
        },
      ],
    };
  },
};

const withdraw: EventTemplate = {
  lesson: "founding",
  build: (ctx) => ({
    speaker: "luke",
    lines: ["王都銀行のルークです。開業おめでとうございます！", "レジに入れる現金を、普通預金から引き出しますか？"],
    choices: [50000, 30000].map((amt) => ({
      label: `${n(amt)}円を引き出す`,
      tx: withdrawTx(amt),
      disabled: needDeposit(ctx, amt),
    })),
  }),
};

const bank: EventTemplate = {
  lesson: "founding",
  build: (ctx) => {
    const cash = ctx.balance("現金");
    const deposit = ctx.balance("普通預金");
    if (cash < 15000 && deposit >= 30000) {
      return {
        speaker: "luke",
        lines: ["レジのお金が心細いようですね。普通預金から引き出しますか？", `（現金 ${n(cash)}円／普通預金 ${n(deposit)}円）`],
        choices: [
          ...[30000, 50000]
            .filter((a) => a <= deposit)
            .map((amt) => ({ label: `${n(amt)}円を引き出す`, tx: withdrawTx(amt) })),
          decline("今日は大丈夫", "ルーク「では、またいつでもどうぞ」"),
        ],
      };
    }
    if (cash > 150000) {
      return {
        speaker: "luke",
        lines: ["レジに現金が多すぎると、いたずら妖精に狙われますよ。預け入れますか？", `（現金 ${n(cash)}円）`],
        choices: [{ label: "100,000円を預け入れる", tx: depositTx(100000) }, decline("やめておく", "ルーク「お気をつけて」")],
      };
    }
    return null;
  },
};

// ───────── 仕入 ─────────

export function purchaseTx(item: ItemId, qty: number, pay: "現金" | "買掛金", fee: number, via?: "普通預金"): Transaction {
  const it = ITEMS[item];
  const amount = it.cost * qty;
  const cashAccount: AccountName = via ?? "現金";
  const credit: [AccountName, number][] =
    pay === "現金" ? [[cashAccount, amount + fee]] : fee > 0 ? [["買掛金", amount], ["現金", fee]] : [["買掛金", amount]];
  const payText = via ? "普通預金口座から支払った" : "現金で支払った";
  const exam =
    pay === "現金"
      ? fee > 0
        ? `商品${n(amount)}円を仕入れ、代金は引取運賃${n(fee)}円とともに${payText}。`
        : `商品${n(amount)}円を仕入れ、代金は${payText}。`
      : fee > 0
        ? `商品${n(amount)}円を掛けで仕入れ、引取運賃${n(fee)}円は現金で支払った。`
        : `商品${n(amount)}円を仕入れ、代金は掛けとした。`;
  return {
    story: `${it.name}を${qty}${it.unit}仕入れた${pay === "買掛金" ? "（代金は月末払い）" : ""}${fee > 0 ? `。運び賃${n(fee)}円は店が払った` : ""}。`,
    exam,
    answer: je([["仕入", amount + fee]], credit),
    idea:
      fee > 0
        ? "運び賃は店の負担。商品を手に入れるためにかかったお金は、どの科目に含める？"
        : pay === "買掛金"
          ? "商品を買ったけど、代金はまだ払っていない。あとで払う義務はどの科目？"
          : "商品を買ったら何の科目？ 支払ったお金は増えた？減った？",
    note: fee > 0 ? `引取運賃は仕入に含める。だから仕入は ${n(amount)} + ${n(fee)} = ${n(amount + fee)}円じゃ。` : undefined,
    taxable: true,
    effect: {
      stock: { [item]: qty },
      addCredits: pay === "買掛金" ? [{ kind: "買掛金", who: "gantetsu", amount, item, qty }] : undefined,
    },
  };
}

export const QTY: Record<ItemId, number[]> = { potion: [10, 20, 30], herb: [20, 30, 50], antidote: [10, 20], scroll: [5, 10], ether: [5, 10], elixir: [3, 5] };

function wholesale(mode: "any" | "credit" | "freight"): EventTemplate {
  return {
    lesson: mode === "any" ? "trade" : mode === "credit" ? "credit" : "charges",
    build: (ctx) => {
      const { state, rand } = ctx;
      const items = itemsForLevel(state.level);
      const lowest = [...items].sort((a, b) => state.stock[a] - state.stock[b])[0];
      const item = rand() < 0.6 ? lowest : pick(rand, items);
      const it = ITEMS[item];
      const qty = pick(rand, QTY[item]) * tradeScale(state.level);
      const amount = it.cost * qty;
      const fee = mode === "freight" || (mode === "any" && ctx.has("charges") && rand() < 0.35) ? pick(rand, [500, 1000]) : 0;
      const canCredit = ctx.has("credit");

      const choices: Choice[] = [];
      if (mode === "any") {
        choices.push({ label: "現金で仕入れる", tx: purchaseTx(item, qty, "現金", fee), disabled: needCash(ctx, amount + fee) });
      }
      if (canCredit) {
        choices.push({ label: "掛けで仕入れる（月末払い）", tx: purchaseTx(item, qty, "買掛金", fee), disabled: needCash(ctx, fee) });
      }
      if (mode === "any" && !ctx.guided) {
        const half = qty / 2;
        if (!canCredit && ctx.balance("現金") < amount + fee && ctx.balance("普通預金") >= amount + fee) {
          choices.push({ label: "普通預金から払って仕入れる", tx: purchaseTx(item, qty, "現金", fee, "普通預金") });
        }
        choices.push({
          label: `半分（${half}${it.unit}）だけ現金で仕入れる`,
          tx: purchaseTx(item, half, "現金", fee),
          disabled: needCash(ctx, it.cost * half + fee),
        });
        choices.push(decline("今日はやめておく", "ガンテツ「そうか。また良い品を持ってくるわい」"));
      }
      return {
        speaker: "gantetsu",
        lines: [
          pick(rand, ["ガハハ！ ドワーフ商会のガンテツじゃ。", "おう、今日もいい品が入ったぞ。", "坑道の奥で仕入れた逸品じゃ。"]),
          `${it.name}を${qty}${it.unit}、${n(amount)}円で卸せるぞ。`,
          `（いまの在庫：${state.stock[item]}${it.unit}／店での売値：1${it.unit}${n(it.price)}円）`,
          ...(fee > 0 ? [`運び賃の${n(fee)}円は、そっち持ちで頼むぞ。`] : []),
        ],
        choices,
      };
    },
  };
}

// ───────── 販売 ─────────


function saleTx(who: CharacterId, item: ItemId, qty: number, amount: number, mode: "現金" | "売掛金", fee: number): Transaction {
  const it = ITEMS[item];
  const debit: [AccountName, number][] = [[mode, amount]];
  const credit: [AccountName, number][] = [["売上", amount]];
  if (fee > 0) {
    debit.push(["発送費", fee]);
    credit.push(["現金", fee]);
  }
  return {
    story: `${name(who)}に${it.name}を${qty}${it.unit}売った${mode === "売掛金" ? "（代金は月末に受け取る）" : ""}${fee > 0 ? `。送料${n(fee)}円は店が払った` : ""}。`,
    exam:
      mode === "現金"
        ? `商品${n(amount)}円を売り上げ、代金は現金で受け取った。`
        : fee > 0
          ? `商品${n(amount)}円を掛けで売り上げ、発送費${n(fee)}円は現金で支払った。`
          : `商品${n(amount)}円を掛けで売り上げた。`,
    answer: je(debit, credit),
    idea:
      fee > 0
        ? "売るときに店が払った送料は、仕入れの運び賃とは扱いが違うよ。"
        : mode === "売掛金"
          ? "商品を売ったけど、代金はまだもらっていない。あとで受け取る権利はどの科目？"
          : "商品を売った。受け取ったお金と、売った記録はそれぞれどの科目？",
    taxable: true,
    effect: {
      stock: { [item]: -qty },
      reputation: fee > 0 ? 3 : mode === "売掛金" ? 2 : 1,
      addCredits: mode === "売掛金" ? [{ kind: "売掛金", who, amount, item, qty }] : undefined,
    },
  };
}

function customer(mode: "any" | "credit"): EventTemplate {
  return {
    lesson: mode === "any" ? "trade" : "credit",
    build: (ctx) => {
      const { state, rand } = ctx;
      const who: CharacterId = mode === "credit" ? "allen" : pick(rand, ["allen", "mina", "gord", "lily"] as const);
      const pref = CUSTOMER_PREFS[who];
      const avail = pref.items.filter((i) => ITEMS[i].level <= state.level);
      let item = pick(rand, avail);
      if (ctx.guided) {
        // 練習では在庫のある商品を選ぶ
        const stocked = itemsForLevel(state.level).filter((i) => state.stock[i] > 0);
        if (stocked.length === 0) return null;
        if (state.stock[item] === 0) item = stocked[0];
      }
      const it = ITEMS[item];
      let qty = pick(rand, pref.qty[item] ?? [5, 10]) * tradeScale(state.level);
      if (ctx.guided) qty = Math.min(qty, state.stock[item]);
      const amount = it.price * qty;
      const wantsCredit = mode === "credit" || (ctx.has("credit") && rand() < pref.creditRate);
      const fee = wantsCredit && mode === "any" && ctx.has("charges") && rand() < 0.35 ? pick(rand, [300, 500, 800]) : 0;
      const discount = !wantsCredit && who === "gord" && qty >= 15 && rand() < 0.5;
      const agreesCash = rand() < (who === "allen" ? 0.4 : 0.7);
      const stock = state.stock[item];

      const v = voiceOf(who);
      const lines = [pref.greet, `「${v.want(`${it.name}${qty}${it.unit}`)}」（売値 ${n(amount)}円／在庫 ${stock}${it.unit}）`];
      if (wantsCredit) lines.push(v.askCredit);
      if (fee > 0) lines.push(v.askShipping(n(fee)));
      if (discount) lines.push(v.askDiscount);

      const choices: Choice[] = [];
      if (stock >= qty) {
        if (wantsCredit) {
          choices.push({ label: "ツケで売る", tx: saleTx(who, item, qty, amount, "売掛金", fee), disabled: needCash(ctx, fee) });
          if (!ctx.guided) {
            choices.push(
              agreesCash
                ? { label: "現金払いをお願いする", tx: { ...saleTx(who, item, qty, amount, "現金", 0), story: `${name(who)}はしぶしぶ現金で払ってくれた。` } }
                : { label: "現金払いをお願いする", reply: `${name(who)}「${v.noCash}」`, effect: { reputation: -2 } },
            );
          }
        } else {
          choices.push({ label: "売る", tx: saleTx(who, item, qty, amount, "現金", 0) });
          if (discount) {
            const discounted = Math.round(amount * 0.9);
            choices.push({
              label: `1割引の${n(discounted)}円で売る`,
              tx: {
                ...saleTx(who, item, qty, discounted, "現金", 0),
                note: "値引きして売っても、売上は実際に売った金額で記録する。",
                effect: { stock: { [item]: -qty }, reputation: 4 },
              },
            });
          }
        }
      } else if (stock > 0) {
        const partial = it.price * stock;
        choices.push({
          label: `在庫の${stock}${it.unit}だけ売る`,
          tx: saleTx(who, item, stock, partial, wantsCredit ? "売掛金" : "現金", 0),
        });
      }
      if (!ctx.guided) {
        choices.push(
          stock === 0
            ? decline("在庫切れでお断りする", `${name(who)}「${v.soldOut}」（品切れは評判が下がる）`, -3)
            : decline("お断りする", `${name(who)}「${v.declined}」`, -2),
        );
      }
      return { speaker: who, lines, choices };
    },
  };
}

// ───────── 費用 ─────────

const supplies: EventTemplate = {
  lesson: "expenses",
  schedule: 0.35,
  build: (ctx) => {
    const [thing, examThing] = pick(ctx.rand, [
      ["帳面用の羊皮紙とインク", "事務用の文房具"],
      ["商品の包み紙", "包装用の紙"],
    ] as const);
    const amt = pick(ctx.rand, [1500, 2000, 3000]);
    return {
      speaker: "hoho",
      lines: [`${thing}が切れそうじゃ。${n(amt)}円で買い足しておくかの？`],
      choices: [
        {
          label: "買う（現金）",
          disabled: needCash(ctx, amt),
          tx: {
            story: `${thing}を${n(amt)}円で買った。`,
            exam: `${examThing}${n(amt)}円を購入し、代金は現金で支払った。`,
            answer: je([["消耗品費", amt]], [["現金", amt]]),
            idea: "すぐに使い切る物を買った。費用が増えて、現金が減ったね。",
          },
        },
        decline("今回は見送る", "ホーホー「包み紙がないと、お客さんが少し困るかもしれんのう」", -1),
      ],
    };
  },
};

const rent: EventTemplate = {
  lesson: "expenses",
  build: (ctx) => {
    const amt = LEVELS[ctx.state.level].rent;
    const tx = (via: "普通預金" | "現金"): Transaction => ({
      story: `今月の家賃${n(amt)}円を払った。`,
      exam: via === "普通預金" ? `店舗の家賃${n(amt)}円を普通預金口座から支払った。` : `店舗の家賃${n(amt)}円を現金で支払った。`,
      answer: je([["支払家賃", amt]], [[via, amt]]),
      idea: "家賃の支払いは費用。払ったお金がどこから出たかを確認しよう。",
    });
    const choices: Choice[] = [
      { label: "普通預金から払う", tx: tx("普通預金"), disabled: needDeposit(ctx, amt) },
      { label: "現金で払う", tx: tx("現金"), disabled: needCash(ctx, amt) },
    ];
    if (choices.every((c) => c.disabled)) choices.push(decline("待ってもらう", "マダム・ローズ「今月だけよ？」", -3));
    return {
      speaker: "rose",
      lines: ["ごきげんよう。今月のお家賃をいただきに来たわ。", `${n(amt)}円よ。`],
      choices,
    };
  },
};

const utility: EventTemplate = {
  lesson: "expenses",
  build: (ctx) => {
    const amt = pick(ctx.rand, [2000, 3000, 4000]);
    const tx = (via: "現金" | "普通預金"): Transaction => ({
      story: `魔石灯の燃料代と水代${n(amt)}円を払った。`,
      exam: `電気代と水道代${n(amt)}円を${via === "現金" ? "現金で" : "普通預金口座から"}支払った。`,
      answer: je([["水道光熱費", amt]], [[via, amt]]),
      idea: "魔石灯の燃料は、こちらの世界の電気代のようなもの。",
      note: "試験の電気代・水道代・ガス代は、まとめて水道光熱費じゃ。",
    });
    return {
      speaker: "hoho",
      lines: [`魔石灯の燃料代と水代の請求が来ておる。合わせて${n(amt)}円じゃ。`],
      choices: [
        { label: "現金で払う", tx: tx("現金"), disabled: needCash(ctx, amt) },
        { label: "普通預金から払う", tx: tx("普通預金"), disabled: needDeposit(ctx, amt) },
      ],
    };
  },
};

const letter: EventTemplate = {
  lesson: "expenses",
  schedule: 0.25,
  build: (ctx) => {
    const amt = pick(ctx.rand, [500, 800, 1000]);
    return {
      speaker: "hoho",
      lines: ["伝書フクロウ便の切手を買っておくかの？ 問屋への注文に使うのじゃ。わしの甥っ子が運んでくれる。", `${n(amt)}円分じゃ。`],
      choices: [
        {
          label: "買う（現金）",
          disabled: needCash(ctx, amt),
          tx: {
            story: `伝書フクロウ便の切手を${n(amt)}円分買った。`,
            exam: `郵便切手${n(amt)}円分を購入し、代金は現金で支払った。`,
            answer: je([["通信費", amt]], [["現金", amt]]),
            idea: "切手は連絡のための費用。どの科目だったかな？",
          },
        },
        decline("今回はいらない", "ホーホー「そうか。甥っ子が暇そうにしておるわい」"),
      ],
    };
  },
};

const ad: EventTemplate = {
  lesson: "expenses",
  schedule: 0.2,
  build: (ctx) => {
    if (ctx.state.reputation >= 90) return null;
    const amt = 10000;
    return {
      speaker: "cecil",
      lines: ["ギルドの掲示板に広告を出しませんか？", `${n(amt)}円で、お店に来る冒険者がぐっと増えますよ！（評判 +10）`],
      choices: [
        {
          label: "広告を出す（現金）",
          disabled: needCash(ctx, amt),
          tx: {
            story: `ギルド掲示板に広告を出した（${n(amt)}円）。`,
            exam: `広告宣伝のためのチラシ代${n(amt)}円を現金で支払った。`,
            answer: je([["広告宣伝費", amt]], [["現金", amt]]),
            idea: "お店を宣伝するための費用だね。",
            effect: { reputation: 10 },
          },
        },
        decline("やめておく", "セシル「またいつでもどうぞ！」"),
      ],
    };
  },
};

// ───────── 掛けの回収・支払い ─────────

const collect: EventTemplate = {
  lesson: "credit",
  schedule: "daily",
  build: ({ state, rand }) => {
    const due = creditsOf(state, "売掛金").filter((c) => c.day < state.day);
    if (due.length === 0) return null;
    const c = pick(rand, due);
    const partial = c.amount >= 10000 && rand() < 0.3;
    const amt = partial ? Math.floor(c.amount / 2 / 100) * 100 : c.amount;
    const viaBank = rand() < 0.4;
    const to: AccountName = viaBank ? "普通預金" : "現金";
    return {
      speaker: c.who,
      lines: [
        voiceOf(c.who).payDebt,
        partial ? voiceOf(c.who).partial(n(amt)) : voiceOf(c.who).paid(n(amt), viaBank),
      ],
      choices: [
        {
          label: "受け取る",
          tx: {
            story: `${name(c.who)}からツケの代金${n(amt)}円を${viaBank ? "普通預金への振込で" : "現金で"}受け取った。`,
            exam: viaBank ? `売掛金${n(amt)}円が普通預金口座に振り込まれた。` : `売掛金${n(amt)}円を現金で回収した。`,
            answer: je([[to, amt]], [["売掛金", amt]]),
            idea: "代金を受け取る権利（売掛金）はどうなった？ お金はどこに入った？",
            effect: { settleCredits: [{ id: c.id, amount: amt }], reputation: 1 },
          },
        },
      ],
    };
  },
};

const paySupplier: EventTemplate = {
  lesson: "credit",
  schedule: "daily",
  build: (ctx) => {
    const { state } = ctx;
    const mine = creditsOf(state, "買掛金", "gantetsu");
    if (mine.length === 0) return null;
    const due = mine.some((c) => c.day <= state.day - 2) || dayInMonth(state.day) === DAYS_PER_MONTH;
    if (!due) return null;
    const amt = sumAmounts(mine);
    const settle = settleAll(mine);
    const tx = (via: "普通預金" | "現金"): Transaction => ({
      story: `ガンテツに掛け代金${n(amt)}円を払った。`,
      exam: via === "普通預金" ? `買掛金${n(amt)}円を普通預金口座から支払った。` : `買掛金${n(amt)}円を現金で支払った。`,
      answer: je([["買掛金", amt]], [[via, amt]]),
      idea: "代金を払う義務（買掛金）はどうなった？ 負債が減ったら借方・貸方どっち？",
      effect: { settleCredits: settle },
    });
    const choices: Choice[] = [
      { label: "普通預金から支払う", tx: tx("普通預金"), disabled: needDeposit(ctx, amt) },
      { label: "現金で支払う", tx: tx("現金"), disabled: needCash(ctx, amt) },
    ];
    if (choices.every((c) => c.disabled)) choices.push(decline("支払いを待ってもらう", "ガンテツ「…まあよい。だが信用は落ちるぞ」", -5));
    return { speaker: "gantetsu", lines: ["掛け代金の支払いを頼むぞ。", `合計${n(amt)}円じゃ。`], choices };
  },
};

// ───────── 返品 ─────────

const purchaseReturn: EventTemplate = {
  lesson: "returns",
  build: ({ state }) => {
    const c = state.credits.find(
      (c) => c.kind === "買掛金" && c.day === state.day && c.item && (c.qty ?? 0) >= 5 && state.stock[c.item] > 0,
    );
    if (!c || !c.item || !c.qty) return null;
    const it = ITEMS[c.item];
    const k = Math.min(Math.max(1, Math.floor(c.qty * 0.2)), state.stock[c.item]);
    const amt = it.cost * k;
    return {
      speaker: "gantetsu",
      lines: [`すまん！ さっき卸した${it.name}のうち${k}${it.unit}に、ひびが入っておった。`, "返品してくれい。代金はツケから差し引いておく。"],
      choices: [
        {
          label: "返品する",
          tx: {
            story: `${it.name}${k}${it.unit}（${n(amt)}円分）をガンテツに返品した。`,
            exam: `先に掛けで仕入れた商品のうち${n(amt)}円分を、品質不良のため返品した。`,
            answer: je([["買掛金", amt]], [["仕入", amt]]),
            idea: "仕入れを取り消す。元の仕訳（仕入／買掛金）の左右を逆にすると？",
            taxable: !!c.taxed,
            effect: { stock: { [c.item]: -k }, settleCredits: [{ id: c.id, amount: amt }] },
          },
        },
      ],
    };
  },
};

const salesReturn: EventTemplate = {
  lesson: "returns",
  schedule: 0.25,
  build: ({ state, rand }) => {
    const cs = creditsOf(state, "売掛金").filter((c) => c.item && (c.qty ?? 0) >= 2);
    if (cs.length === 0) return null;
    const c = pick(rand, cs);
    if (!c.item || !c.qty) return null;
    const it = ITEMS[c.item];
    const k = Math.max(1, Math.floor(c.qty * 0.2));
    const amt = it.price * k;
    if (amt > c.amount) return null;
    return {
      speaker: c.who,
      lines: [voiceOf(c.who).returnGoods(`${it.name}のうち${k}${it.unit}`)],
      choices: [
        {
          label: "返品を受ける",
          tx: {
            story: `${name(c.who)}から${it.name}${k}${it.unit}（${n(amt)}円分）の返品を受けた。直してまた棚に並べよう。`,
            exam: `先に掛けで売り上げた商品のうち${n(amt)}円分が、品質不良のため返品された。`,
            answer: je([["売上", amt]], [["売掛金", amt]]),
            idea: "売上を取り消す。元の仕訳（売掛金／売上）の左右を逆にすると？",
            taxable: !!c.taxed,
            effect: { stock: { [c.item]: k }, settleCredits: [{ id: c.id, amount: amt }], reputation: 1 },
          },
        },
      ],
    };
  },
};

// ───────── 特注の杖クエスト（前払金・前受金） ─────────

const STAFF = { price: 60000, deposit: 20000, cost: 40000, advance: 10000 };

const orderStaff: EventTemplate = {
  lesson: "advances",
  schedule: 0.15,
  build: (ctx) => {
    if (ctx.state.quest) return null;
    return {
      speaker: "mina",
      lines: [
        "特注の「星詠みの杖」を作ってほしいの。",
        `代金は${n(STAFF.price)}円。手付金として${n(STAFF.deposit)}円を先に払うわ。`,
      ],
      choices: [
        {
          label: "引き受ける",
          tx: {
            story: `ミーナから杖の注文を受け、手付金${n(STAFF.deposit)}円を現金で受け取った。`,
            exam: `商品${n(STAFF.price)}円の注文を受け、手付金として${n(STAFF.deposit)}円を現金で受け取った。`,
            answer: je([["現金", STAFF.deposit]], [["前受金", STAFF.deposit]]),
            idea: "お金は受け取ったけど、杖はまだ渡していない。これは売上？ それとも…？",
            note: "まだ商品を渡していないから売上ではない。渡す義務＝前受金（負債）じゃ。",
            effect: { quest: { stage: "ordered", day: ctx.state.day } },
          },
        },
        decline("お断りする", "ミーナ「そう…また今度お願いするわ」"),
      ],
    };
  },
};

const advanceDwarf: EventTemplate = {
  lesson: "advances",
  build: (ctx) => {
    if (ctx.state.quest?.stage !== "ordered") return null;
    const tx = (via: "現金" | "普通預金"): Transaction => ({
      story: `ガンテツに杖を注文し、手付金${n(STAFF.advance)}円を払った。`,
      exam: `商品${n(STAFF.cost)}円を注文し、手付金として${n(STAFF.advance)}円を${via === "現金" ? "現金で" : "普通預金口座から"}支払った。`,
      answer: je([["前払金", STAFF.advance]], [[via, STAFF.advance]]),
      idea: "お金は払ったけど、杖はまだ受け取っていない。あとで受け取れる権利はどの科目？",
      effect: { quest: { stage: "advanced", day: ctx.state.day } },
    });
    return {
      speaker: "gantetsu",
      lines: ["星詠みの杖か、腕が鳴るわい！", `材料と手間賃で${n(STAFF.cost)}円じゃ。手付金${n(STAFF.advance)}円を先にもらうぞ。仕上がりは明日以降じゃ。`],
      choices: [
        { label: "現金で払う", tx: tx("現金"), disabled: needCash(ctx, STAFF.advance) },
        { label: "普通預金から払う", tx: tx("普通預金"), disabled: needDeposit(ctx, STAFF.advance) },
      ],
    };
  },
};

const receiveStaff: EventTemplate = {
  lesson: "advances",
  schedule: "daily",
  build: ({ state }) => {
    if (state.quest?.stage !== "advanced" || state.quest.day >= state.day) return null;
    const rest = STAFF.cost - STAFF.advance;
    return {
      speaker: "gantetsu",
      lines: ["できたぞ、星詠みの杖じゃ！ 会心の出来じゃわい。", `手付金を引いた残りの${n(rest)}円は、いつもどおり掛けでよいぞ。`],
      choices: [
        {
          label: "受け取る",
          tx: {
            story: `ガンテツから杖を受け取った。残り${n(rest)}円は掛け払い。`,
            exam: `注文していた商品${n(STAFF.cost)}円を受け取り、代金のうち${n(STAFF.advance)}円は注文時に支払った手付金と相殺し、残額は掛けとした。`,
            answer: je(
              [["仕入", STAFF.cost]],
              [
                ["前払金", STAFF.advance],
                ["買掛金", rest],
              ],
            ),
            idea: "商品を受け取ったので仕入。先に払った手付金（前払金）を取り崩し、残りはまだ払っていない。",
            taxable: true,
            effect: { quest: { stage: "received", day: state.day }, addCredits: [{ kind: "買掛金", who: "gantetsu", amount: rest }] },
          },
        },
      ],
    };
  },
};

const deliverStaff: EventTemplate = {
  lesson: "advances",
  schedule: "daily",
  build: ({ state }) => {
    if (state.quest?.stage !== "received") return null;
    const rest = STAFF.price - STAFF.deposit;
    return {
      speaker: "mina",
      lines: ["わぁ…星が杖の中で瞬いてる！ 素敵！", `手付金を引いた残りの${n(rest)}円は、月末に払うわね。`],
      choices: [
        {
          label: "杖を渡す",
          tx: {
            story: `ミーナに杖を渡した。残り${n(rest)}円は月末に受け取る。`,
            exam: `注文を受けていた商品${n(STAFF.price)}円を引き渡し、代金のうち${n(STAFF.deposit)}円は受け取っていた手付金と相殺し、残額は掛けとした。`,
            answer: je(
              [
                ["前受金", STAFF.deposit],
                ["売掛金", rest],
              ],
              [["売上", STAFF.price]],
            ),
            idea: "商品を渡したので、ここで売上になる。先にもらった手付金（前受金）を取り崩そう。",
            taxable: true,
            note: "クエスト達成！ 前受金は商品を渡した時点で売上に変わる。",
            effect: { quest: null, reputation: 8, addCredits: [{ kind: "売掛金", who: "mina", amount: rest }] },
          },
        },
      ],
    };
  },
};

// ───────── 現金過不足 ─────────

const cashdiff: EventTemplate = {
  lesson: "cashdiff",
  schedule: 0.2,
  build: (ctx) => {
    const { state, rand } = ctx;
    const cash = ctx.balance("現金");
    if (state.cashDiff || cash < 3000) return null;
    const amt = pick(rand, [500, 1000, 1500, 2000]);
    const short = ctx.guided || rand() < 0.7;
    return {
      speaker: "pipi",
      lines: [
        short ? "えへへ、レジのコインでお手玉してたら、どこかに転がっていっちゃった！" : "あれれ？ レジのお金、数えたら多いよ？ ピピじゃないからね！",
        `帳簿の現金：${n(cash)}円／実際に数えた現金：${n(short ? cash - amt : cash + amt)}円`,
        "原因はよくわからない…",
      ],
      choices: [
        {
          label: "差額を記録する",
          tx: short
            ? {
                story: `現金が帳簿より${n(amt)}円少なかった。原因はわからない。`,
                exam: `現金の実際有高が帳簿残高より${n(amt)}円少なかった。原因は不明である。`,
                answer: je([["現金過不足", amt]], [["現金", amt]]),
                idea: "まず帳簿の現金を実際の金額に合わせる。現金を減らすなら貸方。相手は原因不明のときの仮の科目だよ。",
                effect: { cashDiff: { amount: amt, day: state.day } },
              }
            : {
                story: `現金が帳簿より${n(amt)}円多かった。原因はわからない。`,
                exam: `現金の実際有高が帳簿残高より${n(amt)}円多かった。原因は不明である。`,
                answer: je([["現金", amt]], [["現金過不足", amt]]),
                idea: "まず帳簿の現金を実際の金額に合わせる。現金を増やすなら借方。相手は原因不明のときの仮の科目だよ。",
                effect: { cashDiff: { amount: -amt, day: state.day } },
              },
        },
      ],
    };
  },
};

const cashdiffResolve: EventTemplate = {
  lesson: "cashdiff",
  schedule: "daily",
  build: ({ state }) => {
    const d = state.cashDiff;
    if (!d || d.day >= state.day) return null;
    if (d.amount > 0) {
      const amt = d.amount;
      return {
        speaker: "hoho",
        lines: [`わかったぞ！ 先日、伝書フクロウ便の切手代${n(amt)}円を払ったのに、帳簿につけ忘れておった。`, "ピピのせいではなかったのう。"],
        choices: [
          {
            label: "正しい科目に振り替える",
            tx: {
              story: `現金不足${n(amt)}円の原因は、切手代の記入もれだった。`,
              exam: `先日判明した現金の不足額${n(amt)}円の原因は、郵便切手代の記入もれであることがわかった。`,
              answer: je([["通信費", amt]], [["現金過不足", amt]]),
              idea: "先日、現金過不足を借方に書いた。それを取り消して、本当の科目に置き換えよう。",
              effect: { cashDiff: null },
            },
          },
        ],
      };
    }
    const amt = -d.amount;
    return {
      speaker: "cecil",
      lines: [`先日、ギルドから紹介手数料${n(amt)}円を現金でお渡ししたのですが、記録していただけました？`],
      choices: [
        {
          label: "正しい科目に振り替える",
          tx: {
            story: `現金過剰${n(amt)}円の原因は、手数料の受け取りの記入もれだった。`,
            exam: `先日判明した現金の過剰額${n(amt)}円の原因は、手数料の受取額の記入もれであることがわかった。`,
            answer: je([["現金過不足", amt]], [["受取手数料", amt]]),
            idea: "先日、現金過不足を貸方に書いた。それを取り消して、本当の科目（収益）に置き換えよう。",
            effect: { cashDiff: null },
          },
        },
      ],
    };
  },
};

export const TEMPLATES: Record<string, EventTemplate> = {
  founding,
  withdraw,
  bank,
  wholesale: wholesale("any"),
  "wholesale-credit": wholesale("credit"),
  "wholesale-freight": wholesale("freight"),
  customer: customer("any"),
  "customer-credit": customer("credit"),
  supplies,
  rent,
  utility,
  letter,
  ad,
  collect,
  "pay-supplier": paySupplier,
  "purchase-return": purchaseReturn,
  "sales-return": salesReturn,
  "order-staff": orderStaff,
  "advance-dwarf": advanceDwarf,
  "receive-staff": receiveStaff,
  "deliver-staff": deliverStaff,
  cashdiff,
  "cashdiff-resolve": cashdiffResolve,
  ...LV3_TEMPLATES,
  ...LV4_TEMPLATES,
  ...CLOSING_TEMPLATES,
  ...LV5_TEMPLATES,
};
