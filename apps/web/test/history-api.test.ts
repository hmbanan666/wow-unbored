import { afterEach, expect, test, vi } from "vite-plus/test";
import type { H3Event } from "h3";
const session = vi.hoisted(() => ({ live: vi.fn(), prior: vi.fn() }));
const read = vi.hoisted(() => vi.fn());
vi.mock("../server/utils/session", () => ({
  liveAccount: session.live,
  sessionCredentials: (v: { secure?: unknown }) => v.secure,
}));
vi.mock("../server/utils/db", () => ({ db: () => ({}) }));
vi.mock("../server/utils/character-history", () => ({ readHistoryPage: read }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
async function request(game = "forever", query = {}) {
  const headers = new Map();
  vi.stubGlobal("defineEventHandler", (v: unknown) => v);
  vi.stubGlobal("getUserSession", session.prior);
  vi.stubGlobal("getRequestHeader", () => "en");
  vi.stubGlobal("getQuery", () => query);
  vi.stubGlobal(
    "getRouterParam",
    (_: unknown, key: string) => ({ game, realm: "Realm", name: "Mira" })[key],
  );
  vi.stubGlobal("setResponseHeader", (_: unknown, key: string, value: string) =>
    headers.set(key, value),
  );
  vi.stubGlobal("createError", (v: unknown) => v);
  const { default: handler } =
    await import("../server/api/me/characters/[game]/[realm]/[name]/history.get.ts");
  return { result: handler({} as H3Event), headers };
}
test("history endpoint validates filters and uses the live owner for both games", async () => {
  session.live.mockResolvedValue({ accountId: "mine" });
  session.prior.mockResolvedValue({});
  read.mockResolvedValue({ events: [], charts: [], next: null });
  for (const game of ["retail", "forever"]) {
    const { result, headers } = await request(game, {
      types: "level_up,recipe_learned",
      cursor: "100:2",
    });
    expect(await result).toMatchObject({ ok: true });
    expect(read).toHaveBeenLastCalledWith(
      {},
      "mine",
      { game, realm: "Realm", name: "Mira" },
      { types: ["level_up", "recipe_learned"], cursor: { at: 100, id: 2 } },
    );
    expect(headers.get("cache-control")).toBe("private, no-store");
    expect(headers.get("x-robots-tag")).toBe("noindex, nofollow");
  }
  await expect((await request("retail", { types: "invalid" })).result).rejects.toMatchObject({
    statusCode: 400,
  });
});
test("missing session never reads history; missing or other owner's character is 404", async () => {
  session.prior.mockResolvedValue({});
  session.live.mockResolvedValue(undefined);
  expect(await (await request()).result).toMatchObject({ ok: false });
  expect(read).not.toHaveBeenCalled();
  session.live.mockResolvedValue({ accountId: "mine" });
  read.mockResolvedValue(null);
  await expect((await request()).result).rejects.toMatchObject({ statusCode: 404 });
});
