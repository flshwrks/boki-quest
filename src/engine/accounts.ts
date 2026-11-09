// 勘定科目マスタ。区分とホームポジションは日商簿記3級の標準に従う。

export type Category = "asset" | "contra" | "liability" | "equity" | "revenue" | "expense" | "suspense";
export type Side = "debit" | "credit";

export const CATEGORY_LABEL: Record<Category, string> = {
  asset: "資産",
  contra: "資産の控除",
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
  定期預金: "asset",
  受取手形: "asset",
  電子記録債権: "asset",
  売掛金: "asset",
  クレジット売掛金: "asset",
  受取商品券: "asset",
  // 貸倒引当金・減価償却累計額は、資産から差し引く科目（貸方に残高が出る）
  貸倒引当金: "contra",
  繰越商品: "asset",
  貯蔵品: "asset",
  前払保険料: "asset",
  前払地代: "asset",
  未収利息: "asset",
  未収家賃: "asset",
  仮払消費税: "asset",
  未収還付消費税: "asset",
  仮払法人税等: "asset",
  未収還付法人税等: "asset",
  前払金: "asset",
  未収入金: "asset",
  貸付金: "asset",
  手形貸付金: "asset",
  立替金: "asset",
  仮払金: "asset",
  建物: "asset",
  建物減価償却累計額: "contra",
  備品: "asset",
  備品減価償却累計額: "contra",
  車両運搬具: "asset",
  車両運搬具減価償却累計額: "contra",
  土地: "asset",
  差入保証金: "asset",
  支払手形: "liability",
  電子記録債務: "liability",
  買掛金: "liability",
  当座借越: "liability",
  前受金: "liability",
  前受家賃: "liability",
  未払金: "liability",
  未払利息: "liability",
  未払家賃: "liability",
  未払法人税等: "liability",
  仮受消費税: "liability",
  未払消費税: "liability",
  未払配当金: "liability",
  仮受金: "liability",
  預り金: "liability",
  所得税預り金: "liability",
  社会保険料預り金: "liability",
  借入金: "liability",
  手形借入金: "liability",
  資本金: "equity",
  利益準備金: "equity",
  繰越利益剰余金: "equity",
  売上: "revenue",
  受取手数料: "revenue",
  受取家賃: "revenue",
  受取地代: "revenue",
  受取利息: "revenue",
  雑益: "revenue",
  貸倒引当金戻入: "revenue",
  償却債権取立益: "revenue",
  固定資産売却益: "revenue",
  仕入: "expense",
  発送費: "expense",
  消耗品費: "expense",
  修繕費: "expense",
  租税公課: "expense",
  雑費: "expense",
  通信費: "expense",
  水道光熱費: "expense",
  支払家賃: "expense",
  支払地代: "expense",
  広告宣伝費: "expense",
  旅費交通費: "expense",
  支払手数料: "expense",
  給料: "expense",
  法定福利費: "expense",
  支払利息: "expense",
  支払保険料: "expense",
  貸倒引当金繰入: "expense",
  貸倒損失: "expense",
  減価償却費: "expense",
  固定資産売却損: "expense",
  雑損: "expense",
  "法人税、住民税及び事業税": "expense",
  // 原因が判明するまでの一時的な勘定。借方・貸方どちらの残高にもなりうる
  現金過不足: "suspense",
  // 決算で収益・費用をまとめて繰越利益剰余金へ振り替えるための集合勘定
  損益: "suspense",
} as const satisfies Record<string, Category>;

export type AccountName = keyof typeof ACCOUNTS;

/** 資産から差し引く科目と、差し引かれる側の資産 */
export const CONTRA_TARGETS: Partial<Record<AccountName, AccountName[]>> = {
  貸倒引当金: ["売掛金", "受取手形", "電子記録債権"],
  建物減価償却累計額: ["建物"],
  備品減価償却累計額: ["備品"],
  車両運搬具減価償却累計額: ["車両運搬具"],
};

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
    case "contra":
    case "liability":
    case "equity":
    case "revenue":
      return "credit";
    case "suspense":
      return null;
  }
}

export const SIDE_LABEL: Record<Side, string> = { debit: "借方", credit: "貸方" };

export const opposite = (side: Side): Side => (side === "debit" ? "credit" : "debit");

/** 「借方（左）」のように、名前と位置をあわせて示す */
export function sideWithPos(side: Side): string {
  return `${SIDE_LABEL[side]}（${side === "debit" ? "左" : "右"}）`;
}

/** 財務諸表での表示名（3級の表示ルール） */
const STATEMENT_LABEL: Partial<Record<AccountName, string>> = {
  仕入: "売上原価",
  売上: "売上高",
  繰越商品: "商品",
  前払保険料: "前払費用",
  前払地代: "前払費用",
  未払利息: "未払費用",
  未払家賃: "未払費用",
  未収利息: "未収収益",
  未収家賃: "未収収益",
  前受家賃: "前受収益",
  建物減価償却累計額: "減価償却累計額",
  備品減価償却累計額: "減価償却累計額",
  車両運搬具減価償却累計額: "減価償却累計額",
};
export const statementLabel = (account: AccountName) => STATEMENT_LABEL[account] ?? account;
