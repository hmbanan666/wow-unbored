// Test-process-only GitHub boundary. The production app has no endpoint override.
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  if (
    process.env.UNBORED_PROFESSION_FIXTURE === "1" &&
    String(input).startsWith("http://fixture.test/")
  ) {
    if (String(input).endsWith("/v1/page-links/redeem")) {
      const other = JSON.parse(options.body).token.startsWith("b");
      return Promise.resolve(
        Response.json({
          sessionId: other ? "other-fixture-session" : "fixture-session",
          accountId: (other ? "d" : "c").repeat(64),
        }),
      );
    }
    if (String(input).includes("/v1/web/today?"))
      return Promise.resolve(
        Response.json({ sets: JSON.parse(process.env.UNBORED_TODAY_FIXTURE || "[]") }),
      );
    return Promise.resolve(new Response(null, { status: 404 }));
  }
  if (String(input) !== "https://api.github.com/repos/hmbanan666/wow-unbored/releases/latest") {
    return originalFetch(input, options);
  }
  if (process.env.UNBORED_RELEASE_FIXTURE === "unavailable") {
    return Promise.resolve(new Response(null, { status: 503 }));
  }
  return Promise.resolve(
    Response.json({
      tag_name: "v1.2.3",
      published_at: "2026-11-09T10:00:00Z",
      draft: false,
      prerelease: false,
      assets: [
        ["Unbored.Companion_1.2.3_x64-setup.exe", 5121567],
        ["Unbored.Companion_1.2.3_x64_en-US.msi", 7479296],
        ["Unbored-v1.2.3.zip", 300556],
        ["Unbored.Companion_1.2.3_x64-setup.exe.sig", 452],
      ].map(([name, size]) => ({
        name,
        size,
        digest: `sha256:${"a".repeat(64)}`,
        browser_download_url: `https://github.com/hmbanan666/wow-unbored/releases/download/v1.2.3/${name}`,
      })),
    }),
  );
};
