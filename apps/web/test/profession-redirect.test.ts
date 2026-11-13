import { afterEach, expect, test, vi } from "vite-plus/test";
import type { H3Event } from "h3";
const mocks = vi.hoisted(() => ({ live: vi.fn(), owns: vi.fn() }));
vi.mock("../server/utils/session", () => ({ liveAccount: mocks.live }));
vi.mock("../server/utils/db", () => ({ db: () => ({}) }));
vi.mock("../server/utils/selected-character", () => ({ ownsCharacter: mocks.owns }));
vi.mock("../server/utils/public-professions", () => ({
  readPublicProfessions: async () => [{ slug: "enchanting" }],
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
for (const owner of ["anonymous", "other", "owner"])
  test(`${owner} legacy profession visit redirects publicly; only the owner selects a character`, async () => {
    mocks.live.mockResolvedValue(owner === "anonymous" ? null : { accountId: "account" });
    mocks.owns.mockResolvedValue(owner === "owner");
    vi.stubGlobal("defineEventHandler", (v: unknown) => v);
    vi.stubGlobal("setResponseHeader", vi.fn());
    vi.stubGlobal("setResponseStatus", vi.fn());
    const cookie = vi.fn();
    vi.stubGlobal("setCookie", cookie);
    vi.stubGlobal("getRequestURL", () => new URL("https://local.test"));
    vi.stubGlobal("sendRedirect", (_: unknown, location: string, status: number) => ({
      location,
      status,
    }));
    const { default: handler } = await import("../server/middleware/profession-redirect");
    expect(await handler({ path: "/my/forever/Realm/Kania/enchanting" } as H3Event)).toEqual({
      location: "/forever/professions/enchanting",
      status: 302,
    });
    expect(cookie).toHaveBeenCalledTimes(owner === "owner" ? 1 : 0);
  });
