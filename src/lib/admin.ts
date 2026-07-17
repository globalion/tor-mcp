// Admins skip rate-limits. Same pattern as every Globalion skill.

import { prisma } from "./db";

const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS ?? "shreyas.pavuluri@gmail.com")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.has(email.toLowerCase());
}

const cache = new Map<string, boolean>();

export async function isAdminUser(userId: string): Promise<boolean> {
  const cached = cache.get(userId);
  if (cached !== undefined) return cached;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  const admin = isAdminEmail(user?.email);
  cache.set(userId, admin);
  return admin;
}
