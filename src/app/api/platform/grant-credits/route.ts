// POST /api/platform/grant-credits
//   Headers: X-Platform-Secret: <raw shared secret>
//   Body: { userId: string, amount: integer > 0 }
//
// Stub for v0.1: free tier only, no per-user quota adjustment is applied.
// The route exists so aggregators (paperloft) can hit it uniformly across
// all skills — when paid tiers land here, no client-side change needed.

import { NextResponse } from "next/server";
import { authPlatform, grantFromPool } from "@/lib/platform";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const platform = await authPlatform(req);
  if (!platform) {
    return NextResponse.json(
      { error: "unauthorized — set X-Platform-Secret header" },
      { status: 401 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    userId?: string;
    amount?: number;
  };
  if (!body.userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "amount must be a positive integer" },
      { status: 400 },
    );
  }

  try {
    const result = await grantFromPool(platform.id, body.userId, amount);
    return NextResponse.json({
      ...result,
      note: "tor-mcp is free-tier only in v0.1 — grant recorded but no per-user quota surfaced yet",
    });
  } catch (err) {
    const msg = (err as Error).message ?? "grant failed";
    const status = /does not belong/i.test(msg) ? 409 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
