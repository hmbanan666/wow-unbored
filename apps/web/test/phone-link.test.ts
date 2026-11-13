import { expect, test } from "vite-plus/test";
import { forwardPhoneLink } from "../server/utils/phone-link";

const input = {
  sessionId: "sealed-session",
  serverUrl: "https://server.test",
  siteOrigin: "https://site.test",
  origin: "https://site.test",
  fetchSite: "same-origin",
  contentType: "application/json",
  ip: "203.0.113.1",
};
test("phone links require a same-origin signed-in POST and send only the sealed session", async () => {
  const calls: [string, RequestInit | undefined][] = [];
  const url = `https://site.test/enter/${"a".repeat(43)}`;
  const transport = async (url: string | URL | Request, options?: RequestInit) => {
    calls.push([String(url), options]);
    return Response.json({ url: `https://site.test/enter/${"a".repeat(43)}`, expiresAt: 123 });
  };
  for (const override of [
    { sessionId: undefined },
    { origin: "https://evil.test" },
    { fetchSite: "cross-site" },
    { contentType: "text/plain" },
  ]) {
    expect((await forwardPhoneLink({ ...input, ...override }, transport)).ok).toBe(false);
  }
  expect(calls).toHaveLength(0);
  expect(await forwardPhoneLink(input, transport)).toEqual({ ok: true, url, expiresAt: 123 });
  expect(calls[0]![0]).toBe("https://server.test/v1/web/page-link");
  expect(calls[0]![1]).toMatchObject({
    method: "POST",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    headers: { authorization: "Bearer sealed-session", origin: "https://site.test" },
  });
  expect(calls[0]![1]?.body).toBeUndefined();
});
test("phone link failures stay friendly without reflecting credentials", async () => {
  for (const status of [401, 429, 503]) {
    const result = await forwardPhoneLink(input, async () =>
      Response.json({ error: "secret" }, { status }),
    );
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("secret");
  }
  expect(
    (
      await forwardPhoneLink(input, async () => {
        throw new Error("secret");
      })
    ).ok,
  ).toBe(false);
});
