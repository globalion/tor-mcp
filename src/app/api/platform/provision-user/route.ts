// POST /api/platform/provision-user
//   Headers: X-Platform-Secret: <raw shared secret>
//   Body: { platformRef: string, email?: string }
//   → { userId, apiKey (only on first mint), keyPrefix, isNew }
//
// See docs-mcp for the doc — this route is identical.

import { NextResponse } from "next/server";
import { authPlatform, provisionUser } from "@/lib/platform";

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
    platformRef?: string;
    email?: string;
  };
  if (!body.platformRef || typeof body.platformRef !== "string") {
    return NextResponse.json(
      { error: "platformRef is required" },
      { status: 400 },
    );
  }

  try {
    const result = await provisionUser(platform.id, body.platformRef, body.email);
    return NextResponse.json({
      userId: result.userId,
      apiKey: result.apiKey,
      keyPrefix: result.keyPrefix,
      isNew: result.isNew,
      quotaPerDay: 100,
      message: result.isNew
        ? "user provisioned with 100 requests/day"
        : result.apiKey
          ? "user existed with no active key; new key minted"
          : "user already provisioned; existing key retained (raw key not re-derivable)",
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "provision failed" },
      { status: 400 },
    );
  }
}
