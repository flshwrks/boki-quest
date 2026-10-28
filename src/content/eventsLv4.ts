// Lv4「城下町の大店」の取引イベント

import type { AccountName } from "@/engine/accounts";
import { sumAmounts } from "@/engine/journal";
import type { GameState, Transaction } from "@/game/types";
import { PAY_SOURCES, type EventTemplate, voiceOf, creditsOf, decline, dueCredits, interestOf, je, n, needCash, needDeposit, payFrom, pct, pick, settleAll, settleDue, viaPhrase } from "./eventKit";
import { DAYS_PER_MONTH, LEVELS, dayInMonth } from "./world";


/** 返済期日（借りた日から months か月後）が来た借入金・貸付金と、その利息 */
function dueLoan(state: GameState, kind: "借入金" | "貸付金") {
  const c = creditsOf(state, kind).find((c) => c.day + (c.months ?? 0) * DAYS_PER_MONTH <= state.day);
  return c && { c, interest: interestOf(c) };
}

// ───────── 借入金・貸付金 ─────────

const LOAN = { amount: 300000, rate: 0.03, months: 6 };

const bankLoan: EventTemplate = {
  lesson: "loans",
  review: 0.08,
  build: (ctx) => {
    if (creditsOf(ctx.state, "借入金").length > 0) return null;
    const { amount, rate, months } = LOAN;
    return {
      speaker: "luke",
      lines: ["大口融資のご用意ができました。", `${n(amount)}円、年利${pct(rate)}、期間${months}か月です。ご入用ですか？`],
      choices: [
        {
          label: "借り入れる",
          tx: {
            story: `王都銀行から${n(amount)}円を借りた（年利${pct(rate)}・${months}か月）。`,
            exam: `銀行から${n(amount)}円を借り入れ、普通預金口座に入金された（借入期間${months}か月、年利率${pct(rate)}）。`,
            answer: je([["普通預金", amount]], [["借入金", amount]]),
            idea: "お金が預金に入った。いずれ返さなければならない義務はどの科目？",
            note: `返すときの利息は ${n(amount)} × ${pct(rate)} × ${months}/12 = ${n(interestOf(LOAN))}円になる。覚えておこう。`,
            effect: { addCredits: [{ kind: "借入金", who: "luke", amount, rate, months }] },
          },
        },
        decline("今回は見送る", "ルーク「承知しました。いつでもご相談ください」"),
      ],
    };
  },
};

const loanRepay: EventTemplate = {
  lesson: "loans",
  schedule: "daily",
  build: (ctx) => {
    const due = dueLoan(ctx.state, "借入金");
    if (!due) return null;
    const { c, interest } = due;
    const total = c.amount + interest;
    return {
      speaker: "luke",
      lines: [`借入金${n(c.amount)}円の返済期日です。`, `利息${n(interest)}円（${n(c.amount)} × ${pct(c.rate!)} × ${c.months}/12）とあわせて${n(total)}円をお願いします。`],
      choices: [
        ...payFrom(ctx, total, PAY_SOURCES, (via) => repayTx(c, interest, [[via, total]], `${viaPhrase(via)}返済した`), "返済する"),
        // 1つの口座では足りなくても、普通預金と現金をあわせれば払えるとき
        ...(ctx.balance("普通預金") < total && ctx.balance("現金") < total && ctx.balance("普通預金") + ctx.balance("現金") >= total
          ? [
              {
                label: "普通預金と現金をあわせて返済する",
                tx: repayTx(
                  c,
                  interest,
                  [
                    ["普通預金", ctx.balance("普通預金")],
                    ["現金", total - ctx.balance("普通預金")],
                  ],
                  `普通預金口座から${n(ctx.balance("普通預金"))}円、現金で${n(total - ctx.balance("普通預金"))}円を支払って返済した`,
                ),
              },
            ]
          : []),
      ],
    };
  },
};

function repayTx(loan: { id: string; amount: number }, interest: number, paid: [AccountName, number][], how: string): Transaction {
  const principal = loan.amount;
  return {
    story: `借入金${n(principal)}円を、利息${n(interest)}円とともに返した。`,
    exam: `借入金${n(principal)}円の返済期日となり、利息${n(interest)}円とともに${how}。`,
    answer: je(
      [
        ["借入金", principal],
        ["支払利息", interest],
      ],
      paid,
    ),
    idea: "元本の返済で借入金が減る。利息は借りたことへの費用だね。支払ったお金は、出どころごとに分けて書くよ。",
    effect: { settleCredits: [{ id: loan.id, amount: principal }] },
  };
}

const LEND = { amount: 50000, rate: 0.06, months: 4 };

const lendAllen: EventTemplate = {
  lesson: "loans",
  review: 0.12,
  build: (ctx) => {
    if (creditsOf(ctx.state, "貸付金").length > 0) return null;
    const { amount, rate, months } = LEND;
    return {
      speaker: "allen",
      lines: ["店主、頼みがある。新しい剣を買いたいんだ。", `${n(amount)}円貸してくれないか？ ${months}か月後に、年${pct(rate)}の利息をつけて返すよ！`],
      choices: [
        {
          label: "現金で貸す",
          disabled: needCash(ctx, amount),
          tx: {
            story: `アレンに${n(amount)}円を貸した（年利${pct(rate)}・${months}か月）。`,
            exam: `得意先に現金${n(amount)}円を貸し付けた（貸付期間${months}か月、年利率${pct(rate)}）。`,
            answer: je([["貸付金", amount]], [["現金", amount]]),
            idea: "お金を貸した。あとで返してもらえる権利はどの科目？",
            effect: { reputation: 3, addCredits: [{ kind: "貸付金", who: "allen", amount, rate, months }] },
          },
        },
        decline("お断りする", "アレン「だよな…地道に稼ぐよ」"),
      ],
    };
  },
};

const loanCollect: EventTemplate = {
  lesson: "loans",
  schedule: "daily",
  build: (ctx) => {
    const due = dueLoan(ctx.state, "貸付金");
    if (!due) return null;
    const { c, interest } = due;
    return {
      speaker: "allen",
      lines: ["約束どおり返しに来たぜ！ 新しい剣のおかげでダンジョンの奥まで行けたよ。", `元本${n(c.amount)}円と、利息${n(interest)}円だ。`],
      choices: [
        {
          label: "受け取る",
          tx: {
            story: `アレンから貸したお金${n(c.amount)}円と利息${n(interest)}円を現金で受け取った。`,
            exam: `貸付金${n(c.amount)}円の返済期日となり、利息${n(interest)}円とともに現金で受け取った。`,
            answer: je(
              [["現金", c.amount + interest]],
              [
                ["貸付金", c.amount],
                ["受取利息", interest],
              ],
            ),
            idea: "貸したお金が戻り、貸付金が減る。上乗せで受け取った利息は収益だよ。",
            effect: { settleCredits: [{ id: c.id, amount: c.amount }] },
          },
        },
      ],
    };
  },
};

// ───────── 店舗の入居 ─────────

const moveIn: EventTemplate = {
  lesson: "deposit",
  once: "game",
  build: (ctx) => {
    const rent = LEVELS[4].rent;
    const deposit = rent;
    const fee = rent / 2;
    const total = deposit + fee + rent;
    return {
      speaker: "rose",
      lines: [
        "城下町の大通りの店、あなたに貸すわ。",
        `敷金${n(deposit)}円、不動産仲介の手数料${n(fee)}円、それと今月の家賃${n(rent)}円。合わせて${n(total)}円よ。`,
      ],
      choices: [
        {
          label: "普通預金から支払う",
          disabled: needDeposit(ctx, total),
          tx: {
            story: `新しい店を借りた。敷金・仲介手数料・家賃あわせて${n(total)}円を払った。`,
            exam: `店舗の賃借にあたり、敷金${n(deposit)}円、不動産会社への仲介手数料${n(fee)}円、1か月分の家賃${n(rent)}円を普通預金口座から支払った。`,
            answer: je(
              [
                ["差入保証金", deposit],
                ["支払手数料", fee],
                ["支払家賃", rent],
              ],
              [["普通預金", total]],
            ),
            idea: "3つの支払いを中身ごとに分けよう。退去のときに返ってくるのはどれ？",
            effect: { reputation: 5 },
          },
        },
      ],
    };
  },
};

// ───────── 固定資産 ─────────

const buyWagon: EventTemplate = {
  lesson: "fixedassets",
  once: "game",
  build: () => {
    const price = 200000;
    const fee = 10000;
    return {
      speaker: "gantetsu",
      lines: ["遠くの村まで商品を届けるなら、荷馬車がいるじゃろう。", `頑丈なのを${n(price)}円で譲るぞ。ギルドへの登録料${n(fee)}円込みで、代金は月末払いでよい。（評判 +10）`],
      choices: [
        {
          label: "後払いで買う",
          tx: {
            story: `荷馬車を${n(price)}円で買った。登録料${n(fee)}円とあわせて月末払い。`,
            exam: `営業用の車両${n(price)}円を購入し、登録手数料${n(fee)}円とともに代金は月末に支払うこととした。`,
            answer: je([["車両運搬具", price + fee]], [["未払金", price + fee]]),
            idea: "何年も使う乗り物を買った。登録料のような付随費用はどこに含める？ 商品ではない物の後払いは何だったかな？",
            note: `付随費用は固定資産に含めるから、車両運搬具は ${n(price)} + ${n(fee)} = ${n(price + fee)}円じゃ。`,
            effect: { reputation: 10, addCredits: [{ kind: "未払金", who: "gantetsu", amount: price + fee }] },
          },
        },
        decline("今回は見送る", "ガンテツ「そうか。気が向いたら言うんじゃぞ」"),
      ],
    };
  },
};

const buyRegister: EventTemplate = {
  lesson: "fixedassets",
  review: 0.08,
  once: "game",
  build: (ctx) => {
    const price = 80000;
    const fee = 5000;
    return {
      speaker: "cecil",
      lines: ["ギルド公認の魔導レジスターはいかが？ 会計がぐっと早くなりますよ。（評判 +8）", `本体${n(price)}円と据付費${n(fee)}円です。`],
      choices: [
        ...payFrom(
          ctx,
          price + fee,
          ["普通預金", "現金"],
          (via) => ({
            story: `魔導レジスターを${n(price)}円で買い、据付費${n(fee)}円とともに払った。`,
            exam: `店舗用のレジスター${n(price)}円を購入し、据付費${n(fee)}円とともに${viaPhrase(via)}支払った。`,
            answer: je([["備品", price + fee]], [[via, price + fee]]),
            idea: "長く使う設備を買った。据付費も設備の金額に含めるよ。",
            effect: { reputation: 8 },
          }),
          "払って買う",
        ),
        {
          label: "月末払いで買う",
          tx: {
            story: `魔導レジスターを${n(price)}円で買った。据付費${n(fee)}円とあわせて月末払い。`,
            exam: `店舗用のレジスター${n(price)}円を購入し、据付費${n(fee)}円とともに代金は月末に支払うこととした。`,
            answer: je([["備品", price + fee]], [["未払金", price + fee]]),
            idea: "長く使う設備を後払いで買った。商品ではない物の後払いは何だったかな？",
            effect: { reputation: 8, addCredits: [{ kind: "未払金", who: "cecil", amount: price + fee }] },
          },
        },
        decline("今回は見送る", "セシル「またいつでもどうぞ！」"),
      ],
    };
  },
};

// ───────── 給料と預り金・立替金 ─────────

const SALARY = { gross: 30000, tax: 1500, insurance: 3000 };

const noelAdvance: EventTemplate = {
  lesson: "payroll",
  review: 0.15,
  build: (ctx) => {
    if (creditsOf(ctx.state, "立替金").length > 0) return null;
    const amt = pick(ctx.rand, [2000, 3000]);
    return {
      speaker: "noel",
      lines: ["あの…故郷の家族に小包を送りたいんですが、手持ちがなくて。", `${n(amt)}円、立て替えてもらえませんか？ 次のお給料から引いてください！`],
      choices: [
        {
          label: "現金で立て替える",
          disabled: needCash(ctx, amt),
          tx: {
            story: `ノエルの小包代${n(amt)}円を立て替えた。`,
            exam: `従業員が負担すべき私用の代金${n(amt)}円を、現金で立て替えて支払った。`,
            answer: je([["立替金", amt]], [["現金", amt]]),
            idea: "店の費用ではなく、あとで従業員から返してもらうお金だよ。",
            effect: { addCredits: [{ kind: "立替金", who: "noel", amount: amt }] },
          },
        },
        decline("今回は断る", "ノエル「そうですよね…なんとかします」"),
      ],
    };
  },
};

const payday: EventTemplate = {
  lesson: "payroll",
  schedule: "daily",
  once: "day",
  build: (ctx) => {
    const { state } = ctx;
    if (!ctx.guided && dayInMonth(state.day) !== DAYS_PER_MONTH) return null;
    const { gross, tax, insurance } = SALARY;
    const advances = creditsOf(state, "立替金", "noel");
    const advance = sumAmounts(advances);
    const net = gross - tax - insurance - advance;
    const credit: [AccountName, number][] = [
      ["所得税預り金", tax],
      ["社会保険料預り金", insurance],
    ];
    if (advance > 0) credit.push(["立替金", advance]);
    credit.push(["普通預金", net]);
    return {
      speaker: "noel",
      lines: ["今月もお疲れさまでした！ お給料日ですね。", `総額${n(gross)}円から、所得税${n(tax)}円・社会保険料${n(insurance)}円${advance > 0 ? `・立て替えてもらった${n(advance)}円` : ""}を引いて、手取りは${n(net)}円です。`],
      choices: [
        {
          label: "普通預金から給料を払う",
          disabled: needDeposit(ctx, net),
          tx: {
            story: `ノエルに給料を払った（総額${n(gross)}円、手取り${n(net)}円）。`,
            exam: `従業員に給料${n(gross)}円を支払うにあたり、所得税の源泉徴収額${n(tax)}円${advance > 0 ? `、立替金${n(advance)}円` : ""}および社会保険料の従業員負担額${n(insurance)}円を差し引き、残額を普通預金口座から支払った。`,
            answer: je([["給料", gross]], credit),
            idea: "借方の給料は差し引く前の総額。差し引いた分は、店が預かったり返してもらったりしたお金だよ。",
            effect: {
              settleCredits: settleAll(advances),
              addCredits: [
                { kind: "所得税預り金", who: "noel", amount: tax },
                { kind: "社会保険料預り金", who: "noel", amount: insurance },
              ],
            },
          },
        },
      ],
    };
  },
};

const payIncomeTax = settleDue("所得税預り金", {
  lesson: "payroll",
  speaker: "hoho",
  label: "普通預金から納付する",
  lines: (amt) => [`ノエルの給料から預かった所得税${n(amt)}円を、王国の税務所に納める日じゃ。`],
  story: (amt) => `預かっていた所得税${n(amt)}円を納めた。`,
  exam: (amt) => `従業員の給料から源泉徴収していた所得税${n(amt)}円を、普通預金口座から納付した。`,
  idea: "預かっていたお金を納めたので、納める義務（預り金）が減るね。",
});

const payInsurance: EventTemplate = {
  lesson: "payroll",
  schedule: "daily",
  build: (ctx) => {
    const due = dueCredits(ctx.state, "社会保険料預り金", 2);
    if (due.length === 0) return null;
    const amt = sumAmounts(due);
    return {
      speaker: "hoho",
      lines: [`社会保険料の納付日じゃ。ノエルから預かった${n(amt)}円に、店の負担分${n(amt)}円を足して納めるのじゃ。`],
      choices: [
        {
          label: "普通預金から納付する",
          disabled: needDeposit(ctx, amt * 2),
          tx: {
            story: `社会保険料${n(amt * 2)}円（預かった分と店の負担分）を納めた。`,
            exam: `従業員の給料から差し引いていた社会保険料${n(amt)}円を、会社負担分${n(amt)}円とともに普通預金口座から納付した。`,
            answer: je(
              [
                ["社会保険料預り金", amt],
                ["法定福利費", amt],
              ],
              [["普通預金", amt * 2]],
            ),
            idea: "預かっていた分は預り金を減らす。店が負担する分は費用になるよ。",
            effect: { settleCredits: settleAll(due) },
          },
        },
      ],
    };
  },
};

// ───────── 仮払金・仮受金 ─────────

const TRIP_ADVANCE = 20000;

const tripAdvance: EventTemplate = {
  lesson: "suspense",
  review: 0.12,
  build: (ctx) => {
    if (creditsOf(ctx.state, "仮払金").length > 0) return null;
    return {
      speaker: "noel",
      lines: ["港町の市場まで、新しい仕入れ先を探しに行ってきます！", `旅費はいくらかかるかわからないので、とりあえず${n(TRIP_ADVANCE)}円預けてもらえますか？`],
      choices: [
        {
          label: "現金で渡す",
          disabled: needCash(ctx, TRIP_ADVANCE),
          tx: {
            story: `ノエルに出張の旅費として${n(TRIP_ADVANCE)}円を渡した（使った額はあとで精算）。`,
            exam: `従業員の出張にあたり、旅費の概算額${n(TRIP_ADVANCE)}円を現金で渡した。`,
            answer: je([["仮払金", TRIP_ADVANCE]], [["現金", TRIP_ADVANCE]]),
            idea: "使い道と金額がまだ決まっていない支払い。とりあえずの置き場所になる科目があったね。",
            effect: { addCredits: [{ kind: "仮払金", who: "noel", amount: TRIP_ADVANCE }] },
          },
        },
        decline("今回はやめておく", "ノエル「わかりました、また今度！」"),
      ],
    };
  },
};

const tripSettle: EventTemplate = {
  lesson: "suspense",
  schedule: "daily",
  build: (ctx) => {
    const due = dueCredits(ctx.state, "仮払金", 1);
    if (due.length === 0) return null;
    const c = due[0];
    const spent = pick(ctx.rand, [14000, 16000, 18000]);
    const back = c.amount - spent;
    return {
      speaker: "noel",
      lines: ["ただいま戻りました！ 港町でお店の宣伝もしてきましたよ。（評判 +3）", `旅費は${n(spent)}円かかったので、残りの${n(back)}円をお返しします。`],
      choices: [
        {
          label: "精算する",
          tx: {
            story: `ノエルの出張旅費${n(spent)}円を精算し、残り${n(back)}円を受け取った。`,
            exam: `出張から戻った従業員から旅費の精算を受け、概算払いしていた${n(c.amount)}円のうち、旅費${n(spent)}円を差し引いた残額${n(back)}円を現金で受け取った。`,
            answer: je(
              [
                ["旅費交通費", spent],
                ["現金", back],
              ],
              [["仮払金", c.amount]],
            ),
            idea: "仮払金を取り崩して、実際に使った分を本当の科目（費用）へ。戻ってきたお金も忘れずに。",
            effect: { reputation: 3, settleCredits: [{ id: c.id, amount: c.amount }] },
          },
        },
      ],
    };
  },
};

const unknownDeposit: EventTemplate = {
  lesson: "suspense",
  review: 0.15,
  build: ({ state, rand }) => {
    if (creditsOf(state, "仮受金").length > 0) return null;
    const ar = creditsOf(state, "売掛金");
    if (ar.length === 0) return null;
    const c = pick(rand, ar);
    return {
      speaker: "luke",
      lines: [`普通預金に${n(c.amount)}円の入金がありました。`, "ただ、ご依頼人のお名前が読めなくて…何のお金か、心当たりはありますか？"],
      choices: [
        {
          label: "記帳する（内容は調べておく）",
          tx: {
            story: `普通預金に、内容のわからない入金${n(c.amount)}円があった。`,
            exam: `普通預金口座に${n(c.amount)}円の入金があったが、その内容は不明である。`,
            answer: je([["普通預金", c.amount]], [["仮受金", c.amount]]),
            idea: "お金は入ったけれど、何のお金かわからない。とりあえずの置き場所になる科目は？",
            effect: { addCredits: [{ kind: "仮受金", who: c.who, amount: c.amount, against: c.id }] },
          },
        },
      ],
    };
  },
};

const unknownResolve: EventTemplate = {
  lesson: "suspense",
  schedule: "daily",
  build: ({ state }) => {
    const due = dueCredits(state, "仮受金", 1);
    if (due.length === 0) return null;
    const q = due[0];
    const held = state.credits.find((c) => c.id === q.against);
    if (!held) return null;
    return {
      speaker: q.who,
      lines: [voiceOf(q.who).transferred(n(q.amount))],
      choices: [
        {
          label: "正しい科目に振り替える",
          tx: {
            story: `先日の内容不明の入金${n(q.amount)}円は、ツケの支払いだった。`,
            exam: `先日の内容不明の入金${n(q.amount)}円は、得意先からの売掛金の回収であることが判明した。`,
            answer: je([["仮受金", q.amount]], [["売掛金", q.amount]]),
            idea: "仮受金を取り崩して、本当の中身（売掛金の回収）に置き換えよう。",
            effect: {
              settleCredits: [
                { id: q.id, amount: q.amount },
                { id: held.id, amount: q.amount },
              ],
            },
          },
        },
      ],
    };
  },
};

export const LV4_TEMPLATES: Record<string, EventTemplate> = {
  "bank-loan": bankLoan,
  "loan-repay": loanRepay,
  "lend-allen": lendAllen,
  "loan-collect": loanCollect,
  "move-in": moveIn,
  "buy-wagon": buyWagon,
  "buy-register": buyRegister,
  "noel-advance": noelAdvance,
  payday,
  "pay-income-tax": payIncomeTax,
  "pay-insurance": payInsurance,
  "trip-advance": tripAdvance,
  "trip-settle": tripSettle,
  "unknown-deposit": unknownDeposit,
  "unknown-resolve": unknownResolve,
};
