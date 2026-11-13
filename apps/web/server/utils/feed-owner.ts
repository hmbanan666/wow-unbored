import type { H3Event } from "h3";
import { parseCharacter, CHARACTER_COOKIE } from "#shared/selected-character";
import { sessionCredentials } from "./session";
async function boundedBody(event: H3Event, max: number) {
  if (Number(getHeader(event, "content-length")) > max) throw createError({ statusCode: 413 });
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of event.node.req) {
    size += chunk.length;
    if (size > max) throw createError({ statusCode: 413 });
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
/** The selected cookie is an identity, never authorization. The Server checks the live session and owner. */
export async function feedOwnerRequest(event: H3Event, action: "sharing" | "screenshots") {
  setResponseHeader(event, "cache-control", "private, no-store");
  setResponseHeader(event, "x-robots-tag", "noindex");
  const origin = getRequestURL(event).origin;
  if (
    event.method !== "GET" &&
    (getHeader(event, "origin") !== origin ||
      (getHeader(event, "sec-fetch-site") && getHeader(event, "sec-fetch-site") !== "same-origin"))
  )
    throw createError({ statusCode: 403 });
  const who = parseCharacter(getCookie(event, CHARACTER_COOKIE));
  if (!who || who.game !== "forever")
    throw createError({ statusCode: 404, message: "Pick your Forever character first." });
  const credentials = sessionCredentials(await getUserSession(event));
  if (!credentials?.sessionId)
    throw createError({ statusCode: 401, message: "Sign in from the Companion first." });
  const query = new URLSearchParams({ realm: who.realm, name: who.name });
  let body: string | Buffer | undefined;
  if (action === "screenshots") {
    const { generation, own } = getQuery(event);
    if (typeof generation !== "string" || own !== "yes") throw createError({ statusCode: 400 });
    query.set("generation", generation);
    query.set("own", own);
    body = await boundedBody(event, 12 * 1024 * 1024);
  } else if (event.method === "PUT") {
    const input = JSON.parse((await boundedBody(event, 1024)).toString("utf8"));
    body = JSON.stringify({ realm: who.realm, name: who.name, enabled: input?.enabled });
  }
  const config = useRuntimeConfig(event);
  const response = await fetch(
    `${String(config.serverUrl || origin).replace(/\/$/, "")}/v1/web/feed/${action}${event.method === "PUT" ? "" : `?${query}`}`,
    {
      method: event.method,
      headers: {
        authorization: `Bearer ${credentials.sessionId}`,
        origin,
        "content-type": action === "screenshots" ? "application/octet-stream" : "application/json",
      },
      body: body as BodyInit | undefined,
      signal: AbortSignal.timeout(30000),
    },
  );
  setResponseStatus(event, response.status);
  return response.json();
}
