import { expect, test, vi } from "vite-plus/test";
import { fetchTodaySets } from "../server/utils/today-api";
test("Today forwards only the sealed session and character identity, returning an explicit unavailable state", async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify({ sets: [] })));
  const character = { game: "forever" as const, realm: "A / B", name: "Kania" };
  expect(
    await fetchTodaySets("http://local.test/", "session-fixture", character, transport),
  ).toEqual([]);
  const [url, init] = transport.mock.calls[0]!;
  expect(String(url)).toBe(
    "http://local.test/v1/web/today?game=forever&realm=A+%2F+B&character=Kania",
  );
  expect(init?.headers).toEqual({ authorization: "Bearer session-fixture" });
  expect(await fetchTodaySets("http://local.test", undefined, character, transport)).toBeNull();
  expect(transport).toHaveBeenCalledTimes(1);
  transport.mockResolvedValue(new Response("{}", { status: 401 }));
  expect(await fetchTodaySets("http://local.test", "ended", character, transport)).toBeNull();
  transport.mockRejectedValue(new Error("offline"));
  expect(
    await fetchTodaySets("http://local.test", "session-fixture", character, transport),
  ).toBeNull();
});
