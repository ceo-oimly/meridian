/** Which translation key ("Wallet.history.<key>") labels a ledger entry. null = a person-to-person transfer. */
export function historyLabelKey(type: string, credit: boolean): string | null {
  switch (type) {
    case "TRANSFER":
      return null;
    case "DEMO_TOPUP":
      return "topup";
    case "ADMIN_ADJUSTMENT":
      return credit ? "adjustmentCredit" : "adjustmentDebit";
    case "FX_CONVERSION":
      return credit ? "fxIn" : "fxOut";
    case "CARD_PURCHASE":
      return "card";
    case "LOAN_DISBURSEMENT":
      return "loanDisbursed";
    case "LOAN_REPAYMENT":
      return "loanRepaid";
    case "CRYPTO_TRADE":
      return credit ? "cryptoSell" : "cryptoBuy";
    case "EXTERNAL_TRANSFER":
      return "external";
    case "REVERSAL":
      return "reversal";
    case "FEE":
      return "fee";
    default:
      return "other";
  }
}
