import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getExitIp } from "@/lib/tor";

export const runtime = "nodejs";

export async function GET() {
  const checks: Record<string, unknown> = {
    ok: true,
    service: "tor-mcp",
    version: "0.1.0",
    time: new Date().toISOString(),
  };
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = "ok";
  } catch (err) {
    checks.ok = false;
    checks.db = (err as Error).message;
  }
  try {
    const info = await getExitIp();
    checks.tor = { ok: info.isTor, ip: info.ip, country: info.country };
    if (!info.isTor) checks.ok = false;
  } catch (err) {
    checks.ok = false;
    checks.tor = { ok: false, error: (err as Error).message };
  }
  return NextResponse.json(checks, { status: checks.ok ? 200 : 503 });
}
