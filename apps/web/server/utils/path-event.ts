import type { H3Event } from "h3";
import { forwardPathRequest } from "./path-api";
import { sessionCredentials } from "./session";

export async function pathEvent(event: H3Event, method: "GET" | "PUT") {
  setResponseHeader(event, "cache-control", "private, no-store");
  const session = await getUserSession(event);
  const siteOrigin = getRequestURL(event).origin;
  return forwardPathRequest({
    method,
    sessionId: sessionCredentials(session)?.sessionId,
    serverUrl: useRuntimeConfig().serverUrl || siteOrigin,
    siteOrigin,
    origin: getRequestHeader(event, "origin"),
    fetchSite: getRequestHeader(event, "sec-fetch-site"),
    contentType: getRequestHeader(event, "content-type"),
    ip: getRequestIP(event, { xForwardedFor: true }) || "local",
    body: method === "PUT" ? await readBody(event).catch(() => null) : undefined,
  });
}
