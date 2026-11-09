import { markDormantAccounts } from "@/lib/walletService";

// Run daily from a scheduler (for example Vercel Cron). Requires CRON_SECRET in the environment:
//   Authorization: Bearer <CRON_SECRET>
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const count = await markDormantAccounts();
  return Response.json({ markedDormant: count });
}
