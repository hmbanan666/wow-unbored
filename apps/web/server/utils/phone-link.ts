import { PHONE_COPY, type PhoneLink } from "../../shared/phone-link";
import { isLinkToken } from "../../shared/sign-in";

/** Only the sealed website session crosses this boundary, never a Device secret. */
export async function forwardPhoneLink(
  input: {
    sessionId?: string;
    serverUrl: string;
    siteOrigin: string;
    origin?: string;
    fetchSite?: string;
    contentType?: string;
    ip: string;
  },
  transport: typeof fetch = fetch,
): Promise<PhoneLink> {
  if (!input.sessionId) return { ok: false, message: PHONE_COPY.closed };
  if (
    input.origin !== input.siteOrigin ||
    (input.fetchSite && input.fetchSite !== "same-origin") ||
    input.contentType?.split(";")[0]?.trim().toLowerCase() !== "application/json"
  ) {
    return { ok: false, message: PHONE_COPY.failed };
  }
  try {
    const response = await transport(`${input.serverUrl.replace(/\/$/, "")}/v1/web/page-link`, {
      method: "POST",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      headers: {
        authorization: `Bearer ${input.sessionId}`,
        origin: input.siteOrigin,
        "x-forwarded-for": input.ip,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      return {
        ok: false,
        message:
          response.status === 401
            ? PHONE_COPY.closed
            : response.status === 429
              ? PHONE_COPY.limited
              : PHONE_COPY.failed,
      };
    const body = (await response.json()) as { url?: unknown; expiresAt?: unknown };
    if (typeof body.url !== "string" || typeof body.expiresAt !== "number")
      return { ok: false, message: PHONE_COPY.failed };
    const url = new URL(body.url);
    if (
      url.origin !== input.siteOrigin ||
      !url.pathname.startsWith("/enter/") ||
      !isLinkToken(url.pathname.slice(7)) ||
      url.search ||
      url.hash
    )
      return { ok: false, message: PHONE_COPY.failed };
    return { ok: true, url: body.url, expiresAt: body.expiresAt };
  } catch {
    // Fetch errors can include credentials. Never log or return them.
    return { ok: false, message: PHONE_COPY.failed };
  }
}
