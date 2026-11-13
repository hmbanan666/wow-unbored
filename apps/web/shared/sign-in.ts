export const SIGN_IN_COPY = {
  used: "That link was already used. Choose Open my profile in the Companion again.",
  expired: "That link expired. Choose Open my profile in the Companion again.",
  failed: "Bory couldn't open your page just now. Try again from the Companion.",
  closed: "This page was closed. Choose Open my profile in the Companion again.",
  missing: "Choose Open my profile in the Companion.",
  here: "This is your page.",
} as const;

export type SignInReason = "used" | "expired" | "failed";

/** Same shape the Server issues: 32 random bytes, base64url. */
export function isLinkToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,200}$/.test(value);
}

/** A site session lasts at most this long; then My page asks for a new link. */
export { WEB_SESSION_DAYS as SESSION_DAYS } from "@unbored/contracts/web-session";

export type RedeemBody = { sessionId?: unknown; accountId?: unknown; error?: unknown };

/** What the site does with the Server's redeem answer. */
export function sessionFromRedeem(
  status: number,
  body: RedeemBody,
): { ok: true; sessionId: string; accountId: string } | { ok: false; reason: SignInReason } {
  if (
    status === 200 &&
    typeof body.sessionId === "string" &&
    body.sessionId &&
    typeof body.accountId === "string" &&
    body.accountId
  ) {
    return { ok: true, sessionId: body.sessionId, accountId: body.accountId };
  }
  if (body.error === "used") return { ok: false, reason: "used" };
  if (body.error === "expired") return { ok: false, reason: "expired" };
  return { ok: false, reason: "failed" };
}
