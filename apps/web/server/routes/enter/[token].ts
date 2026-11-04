import { browserLang, sessionFromRedeem, SIGN_IN_COPY } from "#shared/sign-in";

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, "token") || "";
  const lang = browserLang(getRequestHeader(event, "accept-language"));
  const config = useRuntimeConfig();
  const server = config.serverUrl || getRequestURL(event).origin;
  let status = 0;
  let body: { sessionId?: unknown; accountId?: unknown; error?: unknown } = {};
  try {
    const response = await fetch(`${server.replace(/\/$/, "")}/v1/page-links/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ token }),
    });
    status = response.status;
    body = (await response.json()) as typeof body;
  } catch {
    status = 0;
  }
  const result = sessionFromRedeem(status, body);
  if (!result.ok) {
    throw createError({
      statusCode: status === 410 || status === 404 ? status : 503,
      statusMessage: SIGN_IN_COPY[lang][result.reason],
    });
  }
  await setUserSession(event, {
    user: { sessionId: result.sessionId, accountId: result.accountId },
  });
  return sendRedirect(event, "/my", 303);
});
