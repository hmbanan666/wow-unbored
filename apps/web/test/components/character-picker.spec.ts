import { expect, test, vi } from "vite-plus/test";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import Picker from "../../app/components/CharacterPicker.vue";
import { characterKey } from "../../shared/selected-character";
import { fixtureCharacter } from "../public-professions-fixture";

for (const count of [0, 1, 3])
  test(`picker offers ${count} owned characters, grouped by game, and stores only a selection`, async () => {
    document.cookie = "unbored_character=; Max-Age=0; Path=/";
    const state = ref();
    vi.stubGlobal("useState", (_key: string, init: () => unknown) => {
      state.value ??= init();
      return state;
    });
    const characters = [
      { ...fixtureCharacter, level: 23, class: "WARLOCK" },
      { ...fixtureCharacter, name: "Mira", level: 60, class: "MAGE" },
      { ...fixtureCharacter, game: "retail", name: "Rin", level: 80, class: "ROGUE" },
    ].slice(0, count);
    const fetch = vi.fn().mockResolvedValue({ signedIn: true, characters });
    vi.stubGlobal("$fetch", fetch);
    const wrapper = mount(Picker);
    await flushPromises();
    expect(fetch).toHaveBeenCalledWith("/api/me/characters", { cache: "no-store" });
    if (!count) {
      expect(wrapper.text()).toContain("Open the Companion to bring your characters here");
      expect(wrapper.find("select").exists()).toBe(false);
    } else {
      expect(wrapper.findAll("option")).toHaveLength(count + 1);
      expect(wrapper.find("select").text()).toContain("Kania · 23 WARLOCK");
      await wrapper.find("select").setValue(characterKey(fixtureCharacter));
      expect(decodeURIComponent(document.cookie)).toContain(
        `unbored_character=${characterKey(fixtureCharacter)}`,
      );
      expect(state.value.selected).toBe(characterKey(fixtureCharacter));
      expect(wrapper.findAll("optgroup").map((g) => g.attributes("label"))).toEqual([
        "WoW Forever",
        "WoW Retail",
      ]);
    }
  });

test("signed out picker offers the Companion sign-in link and never retains a forged selection", async () => {
  const state = ref();
  vi.stubGlobal("useState", (_key: string, init: () => unknown) => {
    state.value ??= init();
    return state;
  });
  vi.stubGlobal("$fetch", async () => ({ signedIn: false, characters: [] }));
  const wrapper = mount(Picker);
  await flushPromises();
  expect(wrapper.get("a").attributes("href")).toBe("/install#sign-in");
  expect(state.value.selected).toBe("");
});

import { defineComponent, h } from "vue";
import { useProfessionOverlay } from "../../app/composables/useProfessionOverlay";
test("switching character clears the old overlay and ignores a late private response", async () => {
  const first = { ...fixtureCharacter, level: 23, class: "WARLOCK" };
  const second = { ...first, name: "Mira" };
  const state = ref({
    status: "ready",
    signedIn: true,
    characters: [first, second],
    selected: characterKey(first),
  });
  vi.stubGlobal("useState", () => state);
  const responses: ((value: { name: string }) => void)[] = [];
  vi.stubGlobal("$fetch", () => new Promise((resolve) => responses.push(resolve)));
  const wrapper = mount(
    defineComponent({
      setup() {
        const overlay = useProfessionOverlay<{ name: string }>(
          "professions",
          () => "forever",
          () => "enchanting",
        );
        return () => h("p", overlay.data.value?.name ?? overlay.status.value);
      },
    }),
  );
  await flushPromises();
  state.value.selected = characterKey(second);
  await flushPromises();
  responses[1]!({ name: "Mira" });
  await flushPromises();
  expect(wrapper.text()).toBe("Mira");
  responses[0]!({ name: "Kania" });
  await flushPromises();
  expect(wrapper.text()).toBe("Mira");
  state.value.selected = "";
  await flushPromises();
  expect(wrapper.text()).toBe("idle");
});
