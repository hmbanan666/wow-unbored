import { expect, test, vi } from "vite-plus/test";
import { flushPromises, mount, config } from "@vue/test-utils";
// Sharing has its own mounted/SSR tests; these tests exercise history/profile loading.
config.global.stubs.FeedControls = true;
import { ref } from "vue";
const mountHome = () => mount(MyPage);
import MyPage from "../../app/pages/my/index.vue";
import { characterKey } from "../../shared/selected-character";

const kania = {
  game: "forever",
  realm: "CAMWOW EU4 Realm 3 PvE",
  name: "Kania",
  level: 25,
  class: "WARLOCK",
};
test("My page selects the most recent character after mount and loads its private home", async () => {
  document.cookie = "unbored_character=; Max-Age=0; Path=/";
  const state = ref();
  vi.stubGlobal("useState", (_: string, init: () => unknown) => {
    state.value ??= init();
    return state;
  });
  const fetch = vi.fn().mockImplementation(async (url: string) =>
    url === "/api/me/characters"
      ? { signedIn: true, characters: [kania, { ...kania, name: "Alt" }] }
      : {
          ok: true,
          character: {
            ...kania,
            professions: [],
          },
        },
  );
  vi.stubGlobal("$fetch", fetch);
  const wrapper = mountHome();
  await flushPromises();
  expect(wrapper.get("h2").text()).toBe("Kania’s professions");
  expect(wrapper.get("h1").text()).toBe("My page");
  expect(wrapper.text()).toContain("Open a profession window in the game once");
  expect(decodeURIComponent(document.cookie)).toContain(characterKey(kania as never));
  expect(fetch).toHaveBeenCalledWith(`/api/me/characters/${characterKey(kania as never)}`, {
    cache: "no-store",
    query: { view: "professions" },
  });
});

import { createSSRApp } from "vue";
import { renderToString } from "@vue/server-renderer";
import ProfileHome from "../../app/components/ProfileHome.vue";
import { summaryFixture } from "../fixtures/profile-home";
test("professions link to their catalog and distinguish zero from unchecked", () => {
  const character = {
    ...kania,
    game: "forever" as const,
    professions: [
      { name: "Enchanting", known: 0, href: "/forever/professions/enchanting" },
      { name: "Tailoring", known: null, href: "/forever/professions/tailoring" },
    ],
  };
  const wrapper = mount(ProfileHome, { props: { character } });
  expect(wrapper.get('a[href="/forever/professions/enchanting"]').text()).toContain(
    "0 recipes known",
  );
  expect(wrapper.get('a[href="/forever/professions/tailoring"]').text()).toContain(
    "Recipes unchecked",
  );
});
test("My page SSR contains no personal data even if a picker state is already populated", async () => {
  vi.stubGlobal("useState", () =>
    ref({
      status: "ready",
      signedIn: true,
      selected: characterKey(kania as never),
      characters: [kania],
    }),
  );
  const fetch = vi.fn();
  vi.stubGlobal("$fetch", fetch);
  const html = await renderToString(createSSRApp(MyPage));
  expect(html).not.toContain("Kania");
  expect(html).not.toContain("CAMWOW");
  expect(fetch).not.toHaveBeenCalled();
});
for (const saved of ["valid", "foreign", "malformed"])
  test(`My page handles a ${saved} selection cookie`, async () => {
    const alt = { ...kania, name: "Alt" };
    document.cookie = `unbored_character=${encodeURIComponent(saved === "valid" ? characterKey(alt as never) : saved === "foreign" ? "forever/Realm/Stranger" : "%broken")}; Path=/`;
    const state = ref();
    vi.stubGlobal("useState", (_: string, init: () => unknown) => {
      state.value ??= init();
      return state;
    });
    const fetch = vi.fn().mockImplementation(async (url: string) =>
      url === "/api/me/characters"
        ? { signedIn: true, characters: [kania, alt] }
        : {
            ok: true,
            character: { ...summaryFixture(), name: url.includes("Alt") ? "Alt" : "Kania" },
          },
    );
    vi.stubGlobal("$fetch", fetch);
    const wrapper = mountHome();
    await flushPromises();
    expect(wrapper.get("h2").text()).toBe(
      saved === "valid" ? "Alt’s professions" : "Kania’s professions",
    );
    await wrapper.get("select").setValue(characterKey(alt as never));
    await flushPromises();
    expect(wrapper.get("h2").text()).toBe("Alt’s professions");
  });

test("switching clears the previous profile, ignores a late response and recovers from an error", async () => {
  const alt = { ...kania, name: "Alt" };
  const state = ref({
    status: "ready",
    signedIn: true,
    selected: characterKey(kania as never),
    characters: [kania, alt],
  });
  vi.stubGlobal("useState", () => state);
  const requests: { resolve: (v: unknown) => void; reject: () => void }[] = [];
  vi.stubGlobal(
    "$fetch",
    () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
  );
  const wrapper = mountHome();
  await flushPromises();
  await wrapper.get("select").setValue(characterKey(alt as never));
  await flushPromises();
  requests[1]!.resolve({ ok: true, character: { ...summaryFixture(), name: "Alt" } });
  await flushPromises();
  requests[0]!.resolve({ ok: true, character: summaryFixture() });
  await flushPromises();
  expect(wrapper.get("h2").text()).toBe("Alt’s professions");
  await wrapper.get("select").setValue(characterKey(kania as never));
  expect(wrapper.find(".professions").exists()).toBe(false);
  await flushPromises();
  requests[2]!.reject();
  await flushPromises();
  expect(wrapper.text()).toContain("Bory couldn't check your character just now");
  await wrapper
    .findAll("button")
    .find((b) => b.text() === "Try again")!
    .trigger("click");
  requests[3]!.resolve({ ok: true, character: summaryFixture() });
  await flushPromises();
  expect(wrapper.get("h2").text()).toBe("Kania’s professions");
});
test("My page has one character picker and keeps phone access under Settings", async () => {
  vi.stubGlobal("useState", () =>
    ref({
      status: "ready",
      signedIn: true,
      selected: characterKey(kania as never),
      characters: [kania],
    }),
  );
  vi.stubGlobal("$fetch", async () => ({ ok: true, character: summaryFixture() }));
  const wrapper = mount(MyPage);
  await flushPromises();
  expect(wrapper.findAll("select")).toHaveLength(1);
  expect(wrapper.get("details > summary").text()).toBe("Settings");
  expect(wrapper.get("details").text()).toContain("Open on phone");
  expect(wrapper.find("progress").exists()).toBe(false);
});
