import { describe, expect, it } from "vitest";
import { categoryHint, diagnose, explainLine, isBalanced, sameEntry, type Entry } from "./journal";
import { balanceOf, statements, trialBalance, worksheet } from "./ledger";

const credit_purchase: Entry = {
  debit: [{ account: "仕入", amount: 50000 }],
  credit: [{ account: "買掛金", amount: 50000 }],
};

describe("journal", () => {
  it("貸借の一致を判定する", () => {
    expect(isBalanced(credit_purchase)).toBe(true);
    expect(isBalanced({ debit: [{ account: "仕入", amount: 1 }], credit: [] })).toBe(false);
  });

  it("行の分け方や順序が違っても同じ仕訳とみなす", () => {
    const split: Entry = {
      debit: [
        { account: "仕入", amount: 20000 },
        { account: "仕入", amount: 30000 },
      ],
      credit: [{ account: "買掛金", amount: 50000 }],
    };
    expect(sameEntry(split, credit_purchase)).toBe(true);
  });

  it("貸借逆を見分ける", () => {
    const d = diagnose({ debit: credit_purchase.credit, credit: credit_purchase.debit }, credit_purchase);
    expect(d).toMatchObject({ ok: false, kind: "reversed" });
  });

  it("貸借不一致・科目違い・金額違いを見分ける", () => {
    expect(
      diagnose({ debit: [{ account: "仕入", amount: 50000 }], credit: [{ account: "買掛金", amount: 5000 }] }, credit_purchase),
    ).toMatchObject({ kind: "unbalanced" });
    expect(
      diagnose({ debit: [{ account: "仕入", amount: 50000 }], credit: [{ account: "現金", amount: 50000 }] }, credit_purchase),
    ).toMatchObject({ kind: "account" });
    expect(
      diagnose({ debit: [{ account: "仕入", amount: 5000 }], credit: [{ account: "買掛金", amount: 5000 }] }, credit_purchase),
    ).toMatchObject({ kind: "amount" });
    expect(diagnose(credit_purchase, credit_purchase)).toEqual({ ok: true });
  });

  it("未入力を見分ける", () => {
    expect(diagnose({ debit: [], credit: [] }, credit_purchase)).toMatchObject({ kind: "incomplete" });
  });

  it("各行の理由と区分ヒントを説明できる", () => {
    expect(explainLine({ account: "現金", amount: 1 }, "credit")).toBe("現金（資産）が減った → 貸方");
    expect(explainLine({ account: "仕入", amount: 1 }, "debit")).toBe("仕入（費用）が増えた → 借方");
    expect(categoryHint(credit_purchase)).toBe("借方には「費用」、貸方には「負債」の科目が入るよ。");
  });
});

describe("ledger", () => {
  const entries: Entry[] = [
    { debit: [{ account: "普通預金", amount: 300000 }], credit: [{ account: "資本金", amount: 300000 }] },
    { debit: [{ account: "現金", amount: 50000 }], credit: [{ account: "普通預金", amount: 50000 }] },
    credit_purchase,
    { debit: [{ account: "売掛金", amount: 80000 }], credit: [{ account: "売上", amount: 80000 }] },
    { debit: [{ account: "消耗品費", amount: 3000 }], credit: [{ account: "現金", amount: 3000 }] },
  ];

  it("試算表の借方合計と貸方合計が一致する", () => {
    const rows = trialBalance(entries);
    const d = rows.reduce((a, r) => a + r.debit, 0);
    const c = rows.reduce((a, r) => a + r.credit, 0);
    expect(d).toBe(c);
    expect(rows.map((r) => r.account)).toEqual(["現金", "普通預金", "売掛金", "買掛金", "資本金", "売上", "仕入", "消耗品費"]);
  });

  it("資産 = 負債 + 純資産 + 当期純利益", () => {
    const s = statements(entries);
    const sum = (xs: { amount: number }[]) => xs.reduce((a, x) => a + x.amount, 0);
    expect(s.netIncome).toBe(80000 - 50000 - 3000);
    expect(sum(s.assets)).toBe(sum(s.liabilities) + sum(s.equity) + s.netIncome);
  });

  it("科目の残高を自然な符号で返す", () => {
    expect(balanceOf(entries, "現金")).toBe(47000);
    expect(balanceOf(entries, "買掛金")).toBe(50000);
  });
});

describe("精算表", () => {
  const before: Entry[] = [
    { debit: [{ account: "普通預金", amount: 300000 }], credit: [{ account: "資本金", amount: 300000 }] },
    { debit: [{ account: "仕入", amount: 100000 }], credit: [{ account: "普通預金", amount: 100000 }] },
    { debit: [{ account: "売掛金", amount: 150000 }], credit: [{ account: "売上", amount: 150000 }] },
  ];
  const adjustments: Entry[] = [
    { debit: [{ account: "繰越商品", amount: 20000 }], credit: [{ account: "仕入", amount: 20000 }] },
    { debit: [{ account: "貸倒引当金繰入", amount: 3000 }], credit: [{ account: "貸倒引当金", amount: 3000 }] },
  ];
  const { rows, netIncome, totals } = worksheet(before, adjustments);

  it("どの欄も左右の合計が一致する（損益計算書・貸借対照表は当期純利益の行を含めて）", () => {
    for (const k of ["trial", "adjust", "income", "balance"] as const) expect(totals[k].debit).toBe(totals[k].credit);
  });

  it("当期純利益は、収益 − 費用", () => {
    expect(netIncome).toBe(150000 - (100000 - 20000) - 3000);
  });

  it("売上原価は、仕入の修正後の残高になる", () => {
    expect(rows.find((r) => r.account === "仕入")?.income.debit).toBe(80000);
  });

  it("当期純利益は、決算整理後の損益計算書と一致する", () => {
    expect(statements([...before, ...adjustments]).netIncome).toBe(netIncome);
  });
});
