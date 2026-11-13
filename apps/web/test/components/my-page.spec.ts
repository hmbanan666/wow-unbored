import { expect, test, vi } from "vite-plus/test";
import { flushPromises, mount } from "@vue/test-utils";
import { ref, defineComponent, h } from "vue";
import Picker from "../../app/components/CharacterPicker.vue";
const mountHome = () => mount(defineComponent({ render: () => h("div", [h(Picker), h(MyPage)]) }));
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
            today: [],
            hero: {
              className: "Warlock",
              race: "Troll",
              faction: "Horde",
              level: 25,
              cap: 60,
              xp: 18993,
              xpMax: 34000,
              rested: null,
              played: null,
              ilvl: null,
              money: null,
            },
            journey: [],
          },
        },
  );
  vi.stubGlobal("$fetch", fetch);
  const wrapper = mountHome();
  await flushPromises();
  expect(wrapper.get("h1").text()).toBe("Kania");
  expect(wrapper.text()).toContain("Road to 60");
  expect(wrapper.text()).toContain("Open a profession window in the game once");
  expect(decodeURIComponent(document.cookie)).toContain(characterKey(kania as never));
  expect(fetch).toHaveBeenCalledWith(`/api/me/characters/${characterKey(kania as never)}/profile`, {
    cache: "no-store",
  });
});

import { createSSRApp } from "vue";
import { renderToString } from "@vue/server-renderer";
import ProfileHome from "../../app/components/ProfileHome.vue";
import { kaniaProfile } from "../fixtures/profile-home";
test("Kania's home shows observed hero facts, dated journey, profession cards and the first open Today step", async () => {
  const character = kaniaProfile();
  const wrapper = mount(ProfileHome, { props: { character } });
  await flushPromises();
  expect(wrapper.text()).toContain("Troll · Warlock · Horde");
  expect(wrapper.text()).toContain("18,993 / 34,000 XP · 15,007 to next level");
  expect(wrapper.text()).toContain("6,800 rested XP");
  expect(wrapper.text()).toContain("2d 6h");
  expect(wrapper.text()).toContain("24.5");
  expect(wrapper.text()).toContain("12g 34s 56c");
  expect(wrapper.text()).toContain("42 known of 262");
  for (const value of ["145 / 150", "112 / 150", "123 / 150", "45 / 75", "118 / 150"])
    expect(wrapper.text()).toContain(value);
  expect(wrapper.findAll("time").at(-1)?.attributes("datetime")).toBe("2026-11-13");
  expect(wrapper.text()).toContain("Most time in Orgrimmar");
  expect(wrapper.get(".what-next a").attributes("href")).toBe("/forever/professions/enchanting");
  expect(wrapper.get(".what-next").text()).toContain(character.today![0]!.goals[0]!.title);
  character.today = [];
  await wrapper.setProps({ character: { ...character } });
  expect(wrapper.get(".what-next").text()).toContain("Open a profession window in the game once");
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
            character: { ...kaniaProfile(), name: url.includes("Alt") ? "Alt" : "Kania" },
          },
    );
    vi.stubGlobal("$fetch", fetch);
    const wrapper = mountHome();
    await flushPromises();
    expect(wrapper.get("h1").text()).toBe(saved === "valid" ? "Alt" : "Kania");
    await wrapper.get("select").setValue(characterKey(alt as never));
    await flushPromises();
    expect(wrapper.get("h1").text()).toBe("Alt");
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
  requests[1]!.resolve({ ok: true, character: { ...kaniaProfile(), name: "Alt" } });
  await flushPromises();
  requests[0]!.resolve({ ok: true, character: kaniaProfile() });
  await flushPromises();
  expect(wrapper.get("h1").text()).toBe("Alt");
  await wrapper.get("select").setValue(characterKey(kania as never));
  expect(wrapper.find(".profile-hero").exists()).toBe(false);
  await flushPromises();
  requests[2]!.reject();
  await flushPromises();
  expect(wrapper.text()).toContain("Bory couldn't check your character just now");
  await wrapper
    .findAll("button")
    .find((b) => b.text() === "Try again")!
    .trigger("click");
  requests[3]!.resolve({ ok: true, character: kaniaProfile() });
  await flushPromises();
  expect(wrapper.get("h1").text()).toBe("Kania");
});
test("Retail's client cap and unknown stats are kept distinct from Forever and zero", async () => {
  const character = kaniaProfile();
  character.game = "retail";
  character.hero = {
    ...character.hero,
    cap: 90,
    level: 90,
    xp: 0,
    xpMax: 0,
    rested: null,
    money: 0,
    played: null,
  };
  const wrapper = mount(ProfileHome, { props: { character } });
  expect(wrapper.text()).toContain("Road to 90");
  expect(wrapper.text()).toContain("Level cap reached");
  expect(wrapper.text()).toContain("0g 0s 0c");
  expect(wrapper.text()).toContain("Not seen yet");
  expect(wrapper.text()).not.toContain("rested XP");
  await wrapper.setProps({ character: { ...character, hero: { ...character.hero, cap: null } } });
  expect(wrapper.text()).not.toContain("Road to");
});
