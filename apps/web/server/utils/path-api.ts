type PathRequest = {
  method: "GET" | "PUT";
  sessionId?: string;
  serverUrl: string;
  siteOrigin: string;
  origin?: string;
  fetchSite?: string;
  contentType?: string;
  ip: string;
  body?: unknown;
};

/** Only the website's sealed session supplies the credential; no browser bearer is forwarded. */
export async function forwardPathRequest(
  input: PathRequest,
  transport: typeof fetch = fetch,
): Promise<Response> {
  const headers = { "cache-control": "private, no-store", "content-type": "application/json" };
  const fail = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers });
  if (
    input.method === "PUT" &&
    (input.origin !== input.siteOrigin ||
      (input.fetchSite && input.fetchSite !== "same-origin") ||
      input.contentType?.split(";")[0]?.trim().toLowerCase() !== "application/json")
  )
    return fail(403, "same_origin_required");
  if (!input.sessionId) return fail(401, "session_closed");
  try {
    const response = await transport(
      `${input.serverUrl.replace(/\/$/, "")}/v1/web/paths/${input.method === "GET" ? "progress" : "active"}`,
      {
        method: input.method,
        headers: {
          authorization: `Bearer ${input.sessionId}`,
          "content-type": "application/json",
          "x-forwarded-for": input.ip,
          ...(input.origin ? { origin: input.origin } : {}),
          ...(input.fetchSite ? { "sec-fetch-site": input.fetchSite } : {}),
        },
        ...(input.method === "PUT" ? { body: JSON.stringify(input.body) } : {}),
        signal: AbortSignal.timeout(10_000),
      },
    );
    return new Response(await response.text(), { status: response.status, headers });
  } catch {
    return fail(503, "unavailable");
  }
}
