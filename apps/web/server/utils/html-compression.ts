import { gzip } from "node:zlib";
import { promisify } from "node:util";

const zip = promisify(gzip);
type HtmlResponse = { body?: unknown; headers: Record<string, string> };

/** Rich public pages repeat names in accessible details; compress their server HTML too. */
export async function compressPublicHtml(
  response: HtmlResponse,
  path: string,
  method: string,
  acceptEncoding: string,
): Promise<void> {
  if (
    method !== "GET" ||
    !/^\/(?:$|(?:guides|collections|paths)(?:\/[^/]+)?$|(?:forever|retail)\/(?:professions(?:\/[^/]+)?|recipes\/[^/]+)$)/.test(
      path.split("?")[0]!,
    ) ||
    typeof response.body !== "string" ||
    !response.headers["content-type"]?.startsWith("text/html") ||
    response.headers["content-encoding"] ||
    Buffer.byteLength(response.body) < 1024
  )
    return;
  const vary = response.headers.vary?.split(",").map((value) => value.trim()) || [];
  if (!vary.some((value) => value.toLowerCase() === "accept-encoding" || value === "*"))
    vary.push("Accept-Encoding");
  response.headers.vary = vary.join(", ");
  const accepted = /(?:^|,)\s*gzip\s*(?:;\s*q=(0(?:\.\d+)?|1(?:\.0+)?))?\s*(?=,|$)/i.exec(
    acceptEncoding,
  );
  if (!accepted || (accepted[1] !== undefined && Number(accepted[1]) === 0)) return;
  response.body = await zip(response.body);
  response.headers["content-encoding"] = "gzip";
  delete response.headers["content-length"];
}
