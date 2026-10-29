import { createHash, timingSafeEqual } from "node:crypto";

import type { Context } from "hono";

export type Role = "companion" | "planner";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function tokenMatches(presented: string, expected: string): boolean {
  return timingSafeEqual(digest(presented), digest(expected));
}

export function presentedBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match?.[1];
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function requireRole(
  c: Context,
  role: Role,
  tokens: { companion: string; planner: string },
): Response | undefined {
  const presented = presentedBearer(c.req.header("authorization"));
  const expected = role === "companion" ? tokens.companion : tokens.planner;
  if (!presented || !tokenMatches(presented, expected)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return undefined;
}
