// Platform aggregator primitives.
// Same shape as docs-mcp/cron-mcp/browser-mcp. See docs-mcp/platform.ts
// for the model discussion — this file is intentionally near-identical
// so the pattern stays consistent across the fleet.
//
// tor-mcp specific: no credit ledger on provision (free tier only for
// v0.1). Pool is created but unused; grant-credits will move balance to
// a per-user quota when we add paid tiers.

import { createHash } from "node:crypto";
import { prisma } from "./db";
import { generateKey } from "./keys";
import type { Platform } from "@prisma/client";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export async function authPlatform(req: Request): Promise<Platform | null> {
  const raw = req.headers.get("x-platform-secret") || "";
  if (!raw) return null;
  const hash = sha256(raw);
  return await prisma.platform.findUnique({ where: { sharedSecretHash: hash } });
}

export async function provisionUser(
  platformId: string,
  platformRef: string,
  email?: string,
): Promise<{ userId: string; apiKey: string | null; keyPrefix: string; isNew: boolean }> {
  let user = await prisma.user.findUnique({
    where: { platformId_platformRef: { platformId, platformRef } },
  });

  let isNew = false;
  if (!user && email) {
    const existingByEmail = await prisma.user.findUnique({ where: { email } });
    if (existingByEmail) {
      if (existingByEmail.platformId && existingByEmail.platformId !== platformId) {
        throw new Error(
          `user ${email} is already provisioned under a different platform; cannot cross-attach`,
        );
      }
      user = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: { platformId, platformRef },
      });
      if (!existingByEmail.platformId) {
        await prisma.apiKey.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    }
  }

  if (!user) {
    const finalEmail = email ?? `${platformRef}@${platformId}.platform.local`;
    user = await prisma.user.create({
      data: { platformId, platformRef, email: finalEmail },
    });
    isNew = true;
  }

  const activeKey = await prisma.apiKey.findFirst({
    where: { userId: user.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (activeKey) {
    return { userId: user.id, apiKey: null, keyPrefix: activeKey.keyPrefix, isNew };
  }

  const gen = generateKey();
  await prisma.apiKey.create({
    data: { userId: user.id, keyHash: gen.hash, keyPrefix: gen.displayPrefix },
  });
  return { userId: user.id, apiKey: gen.raw, keyPrefix: gen.displayPrefix, isNew };
}

// Free-tier only for v0.1: grant is a no-op that acknowledges. When we add
// paid tiers, this will actually move balance to a per-user quota table.
export async function grantFromPool(
  platformId: string,
  userId: string,
  amount: number,
): Promise<{ newBalance: number; poolBalance: number }> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`amount must be a positive integer, got ${amount}`);
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { platformId: true },
  });
  if (!user) throw new Error(`user ${userId} not found`);
  if (user.platformId !== platformId) {
    throw new Error(`user ${userId} does not belong to platform ${platformId}`);
  }
  const pool = await prisma.platformPool.findUnique({ where: { platformId } });
  return {
    newBalance: 0, // free tier — no per-user quota surfaced yet
    poolBalance: pool?.balance ?? 0,
  };
}
