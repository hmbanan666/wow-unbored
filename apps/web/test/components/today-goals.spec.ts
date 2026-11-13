import { expect, test } from "vite-plus/test";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import TodayGoals from "../../app/components/TodayGoals.vue";
import { computeTodayGoals } from "@unbored/contracts/today-goals";
import { albumCharacter } from "../fixtures/profession-album";
const profession = albumCharacter("unopened").professions[0]!;
const set = {
  id: "test-set",
  skillLine: 333,
  profession: "Enchanting",
  day: 1,
  createdAt: 86400,
  goals: computeTodayGoals(profession, "forever", []).map((g) => ({ ...g, completedAt: null })),
};
test("unopened Enchanting has an actionable Today card and browser-only hints survive remount", async () => {
  localStorage.clear();
  const wrapper = mount(TodayGoals, { props: { set, name: "Enchanting" } });
  expect(wrapper.text()).toContain("Today in Enchanting");
  expect(wrapper.text()).toContain("Open your Enchanting window once");
  await wrapper.get("button").trigger("click");
  expect(wrapper.get("button").attributes("aria-pressed")).toBe("true");
  expect(set.goals[0]!.completedAt).toBeNull();
  const again = mount(TodayGoals, { props: { set, name: "Enchanting" } });
  await nextTick();
  expect(again.get("button").text()).toContain("Done");
  await again.get("button").trigger("click");
  expect(again.get("button").text()).toBe("Mark done");
  await wrapper.setProps({ set: { ...set, id: "next-set" } });
  expect(wrapper.get("button").text()).toBe("Mark done");
});
test("automatically completed cards are muted, checked and cannot be undone locally", () => {
  const wrapper = mount(TodayGoals, {
    props: {
      name: "Enchanting",
      set: { ...set, goals: set.goals.map((g) => ({ ...g, completedAt: 90000 })) },
    },
  });
  expect(wrapper.get(".today-card").classes()).toContain("is-done");
  expect(wrapper.text()).toContain("✓");
  expect(wrapper.text()).toContain("Done");
  expect(wrapper.find("button").exists()).toBe(false);
});

test("unavailable and empty Today states offer a way forward", async () => {
  const wrapper = mount(TodayGoals, { props: { name: "Enchanting", unavailable: true } });
  expect(wrapper.text()).toContain("Bory could not check today's steps just now.");
  await wrapper.get("button").trigger("click");
  expect(wrapper.emitted("retry")).toHaveLength(1);
  await wrapper.setProps({ unavailable: false });
  expect(wrapper.text()).toContain("Browse your collection below.");
});

import TodayStrip from "../../app/components/TodayStrip.vue";
test("Today keeps its advice but does not link to a profession without a catalog", () => {
  const character = albumCharacter("unopened", "retail");
  for (const profession of character.professions) profession.total = null;
  const wrapper = mount(TodayStrip, { props: { character } });
  expect(wrapper.text()).toContain("Open your Enchanting window once");
  expect(wrapper.find('a[href*="/professions/"]').exists()).toBe(false);
});
