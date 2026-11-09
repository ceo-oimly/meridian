import { getCurrentUser } from "@/lib/session";
import { statementRows } from "@/lib/walletService";
import { toCsv, csvSafeText } from "@/lib/csv";
import { toDecimalString } from "@/lib/money";
import { historyLabelKey } from "@/lib/historyLabels";

// GET /api/statement?account=<wallet id>  ->  CSV of that wallet's ledger. Signed-in owner only.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const accountId = new URL(req.url).searchParams.get("account") ?? "";
  const data = await statementRows(user.id, accountId);
  if (!data) return new Response("Not found", { status: 404 });

  let running = 0n;
  const rows: string[][] = [["Date (UTC)", "Type", "Description", "Amount", "Balance", "Currency", "Reference"]];
  for (const e of data.entries) {
    running += e.amountMinor;
    const label = historyLabelKey(e.transaction.type, e.amountMinor > 0n) ?? "transfer";
    rows.push([
      e.createdAt.toISOString(),
      label,
      csvSafeText(e.transaction.description ?? ""),
      toDecimalString(e.amountMinor, e.currency),
      toDecimalString(running, e.currency),
      e.currency,
      e.transaction.id,
    ]);
  }

  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="statement-${data.account.accountNumber}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
