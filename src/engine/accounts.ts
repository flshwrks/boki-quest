// 勘定科目マスタ。区分とホームポジションは日商簿記3級の標準に従う。

export type Category = "asset" | "liability" | "equity" | "revenue" | "expense" | "suspense";
export type Side = "debit" | "credit";

export const CATEGORY_LABEL: Record<Category, string> = {
  asset: "資産",
  liability: "負債",
  equity: "純資産",
  revenue: "収益",
  expense: "費用",
  suspense: "仮勘定",
};

// 試算表に並べる標準的な順（資産→負債→純資産→収益→費用）で書く
export const ACCOUNTS = {
  現金: "asset",
  小口現金: "asset",
  当座預金: "asset",
  普通預金: "asset",
  受取手形: "asset",
  電子記録債権: "asset",
  売掛金: "asset",
  クレジット売掛金: "asset",
  受取商品券: "asset",
  前払金: "asset",
  未収入金: "asset",
  立替金: "asset",
  仮払金: "asset",
  備品: "asset",
  支払手形: "liability",
  電子記録債務: "liability",
  買掛金: "liability",
  前受金: "liability",
  未払金: "liability",
  預り金: "liability",
  借入金: "liability",
  資本金: "equity",
  繰越利益剰余金: "equity",
  売上: "revenue",
  受取手数料: "revenue",
  雑益: "revenue",
  仕入: "expense",
  発送費: "expense",
  消耗品費: "expense",
  通信費: "expense",
  水道光熱費: "expense",
  支払家賃: "expense",
  広告宣伝費: "expense",
  旅費交通費: "expense",
  支払手数料: "expense",
  雑損: "expense",
  // 原因が判明するまでの一時的な勘定。借方・貸方どちらの残高にもなりうる
  現金過不足: "suspense",
} as const satisfies Record<string, Category>;

export type AccountName = keyof typeof ACCOUNTS;

/** 科目の一覧を、勘定科目マスタの並び（資産→負債→純資産→収益→費用）にそろえる */
export function inMasterOrder(accounts: readonly AccountName[]): AccountName[] {
  return (Object.keys(ACCOUNTS) as AccountName[]).filter((a) => accounts.includes(a));
}

export function categoryOf(account: AccountName): Category {
  return ACCOUNTS[account];
}

export function isAccountName(name: string): name is AccountName {
  return name in ACCOUNTS;
}

/** 増えたときに記入する側。仮勘定はホームポジションを持たない */
export function homeSide(category: Category): Side | null {
  switch (category) {
    case "asset":
    case "expense":
      return "debit";
    case "liability":
    case "equity":
    case "revenue":
      return "credit";
    case "suspense":
      return null;
  }
}

export const SIDE_LABEL: Record<Side, string> = { debit: "借方", credit: "貸方" };

/** 「借方（左）」のように、名前と位置をあわせて示す */
export function sideWithPos(side: Side): string {
  return `${SIDE_LABEL[side]}（${side === "debit" ? "左" : "右"}）`;
}
