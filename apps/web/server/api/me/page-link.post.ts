import { forwardPhoneLink } from "../../utils/phone-link";
import { sessionCredentials } from "../../utils/session";

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "private, no-store");
  setResponseHeader(event, "referrer-policy", "no-referrer");
  setResponseHeader(event, "x-robots-tag", "noindex, nofollow");
  const session = await getUserSession(event);
  const siteOrigin = getRequestURL(event).origin;
  return forwardPhoneLink({
    sessionId: sessionCredentials(session)?.sessionId,
    serverUrl: useRuntimeConfig().serverUrl || siteOrigin,
    siteOrigin,
    origin: getRequestHeader(event, "origin"),
    fetchSite: getRequestHeader(event, "sec-fetch-site"),
    contentType: getRequestHeader(event, "content-type"),
    ip: getRequestIP(event, { xForwardedFor: true }) || "local",
  });
});
