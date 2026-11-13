export type PageLang = "en" | "ru";

export const SIGN_IN_COPY = {
  en: {
    used: "That link was already used. Open My page from the Companion again.",
    expired: "That link expired. Open My page from the Companion again.",
    failed: "Bory couldn't open your page just now. Try again from the Companion.",
    closed: "This page was closed. Open My page from the Companion again.",
    missing: "Open My page from the Companion.",
    here: "This is your page.",
  },
  ru: {
    used: "Эта ссылка уже использована. Открой Мою страницу из Companion ещё раз.",
    expired: "Срок ссылки вышел. Открой Мою страницу из Companion ещё раз.",
    failed: "Бори не смог открыть страницу. Попробуй ещё раз из Companion.",
    closed: "Эта страница закрыта. Открой Мою страницу из Companion ещё раз.",
    missing: "Открой Мою страницу из Companion.",
    here: "Это твоя страница.",
  },
} as const;

export type SignInReason = "used" | "expired" | "failed";

/** The first language the browser asks for, English unless it asks for Russian. */
export function browserLang(header: string | undefined): PageLang {
  for (const part of (header || "").split(",")) {
    const tag = part.trim().split(";")[0]?.trim().toLowerCase() || "";
    if (tag.startsWith("ru")) return "ru";
    if (tag.startsWith("en")) return "en";
  }
  return "en";
}

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
