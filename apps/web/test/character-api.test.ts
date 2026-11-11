import { afterEach, expect, test, vi } from "vite-plus/test";
import type { H3Event } from "h3";

const session = vi.hoisted(() => ({ live: vi.fn(), prior: vi.fn() }));
const read = vi.hoisted(() => vi.fn());
vi.mock("../server/utils/session", () => ({
  liveAccount: session.live,
  sessionCredentials: (value: { secure?: unknown }) => value.secure,
}));
vi.mock("../server/utils/db", () => ({ db: () => ({}) }));
vi.mock("../server/utils/character-page", () => ({ readCharacterPage: read }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function request(game = "forever") {
  const headers = new Map();
  vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
  vi.stubGlobal("getUserSession", session.prior);
  vi.stubGlobal("getRequestHeader", () => "en");
  vi.stubGlobal("setResponseHeader", (_event: unknown, key: string, value: string) =>
    headers.set(key, value),
  );
  vi.stubGlobal(
    "getRouterParam",
    (_event: unknown, key: string) => ({ game, realm: "A / B", name: "Mira Sun" })[key],
  );
  vi.stubGlobal("createError", (value: unknown) => value);
  const { default: handler } =
    await import("../server/api/me/characters/[game]/[realm]/[name].get.ts");
  return { result: handler({} as H3Event), headers };
}

test("character endpoint uses the live Account, returns only its character and forbids caching", async () => {
  session.prior.mockResolvedValue({ secure: { sessionId: "s", accountId: "mine" } });
  session.live.mockResolvedValue({ accountId: "mine", lang: "en" });
  read.mockResolvedValue({ game: "forever", name: "Mira Sun", realm: "A / B", professions: [] });
  const { result, headers } = await request();
  expect(await result).toMatchObject({ ok: true, character: { name: "Mira Sun" } });
  expect(read).toHaveBeenCalledWith({}, "mine", {
    game: "forever",
    realm: "A / B",
    name: "Mira Sun",
  });
  expect(headers.get("cache-control")).toBe("private, no-store");
  expect(headers.get("x-robots-tag")).toBe("noindex");
});

test("missing or revoked sessions cannot read character Sections", async () => {
  session.live.mockResolvedValue(undefined);
  for (const prior of [{}, { secure: { sessionId: "ended", accountId: "mine" } }]) {
    session.prior.mockResolvedValue(prior);
    const { result } = await request();
    expect(await result).toMatchObject({ ok: false });
  }
  expect(read).not.toHaveBeenCalled();
});

test("unknown, unowned and invalid-game characters return 404", async () => {
  session.prior.mockResolvedValue({});
  session.live.mockResolvedValue({ accountId: "mine", lang: "en" });
  read.mockResolvedValue(null);
  for (const game of ["forever", "retail", "other"]) {
    const { result } = await request(game);
    await expect(result).rejects.toMatchObject({ statusCode: 404 });
  }
  expect(read).toHaveBeenCalledTimes(2);
});
