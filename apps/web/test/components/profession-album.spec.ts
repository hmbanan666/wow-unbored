import { expect, test, vi } from "vite-plus/test";
import { mount } from "@vue/test-utils";
import Album from "../../app/components/ProfessionAlbum.vue";
import { albumCharacter } from "../fixtures/profession-album";

test("album exposes accessible slots, disables zones without sightings and emits filter changes", async () => {
  const profession = albumCharacter().professions[0]!;
  const wrapper = mount(Album, { props: { profession, filter: "all", game: "forever" } });
  expect(wrapper.findAll(".recipe-slot")).toHaveLength(262);
  expect(wrapper.find('[aria-label="Runed Copper Rod, known"]').exists()).toBe(true);
  expect(wrapper.find('[aria-label="Arcane Forge, missing, hard"]').exists()).toBe(true);
  expect(wrapper.find("[data-zone-disabled]").attributes("disabled")).toBeDefined();
  expect(wrapper.find("[data-zone-disabled]").attributes("title")).toBe(
    "Zones appear after the first trainer or vendor sighting",
  );
  expect(wrapper.text()).toContain("Zones appear after the first trainer or vendor sighting");
  await wrapper
    .findAll("button")
    .find((b) => b.text() === "Missing")!
    .trigger("click");
  expect(wrapper.emitted("filter")?.[0]).toEqual(["missing"]);
  expect(wrapper.findAll(".missing-recipe")).toHaveLength(12);
  await wrapper
    .findAll("button")
    .find((b) => b.text().startsWith("Show all"))!
    .trigger("click");
  expect(wrapper.findAll(".missing-recipe")).toHaveLength(247);
});

test("unopened and absent catalog states give the player a way forward", () => {
  const profession = albumCharacter("unopened").professions[0]!;
  const wrapper = mount(Album, { props: { profession, filter: "all", game: "forever" } });
  expect(wrapper.text()).toContain(
    "Open your Enchanting window in the game once, then this fills in",
  );
  expect(wrapper.findAll(".recipe-slot")).toHaveLength(0);
  const absent = mount(Album, {
    props: { profession: { ...profession, total: null }, filter: "all", game: "forever" },
  });
  expect(absent.text()).toContain("Bory's recipe list isn't ready yet");
});

import { flushPromises } from "@vue/test-utils";
test("recipe details show formula facts, requirements, reagents and sighted places", async () => {
  const profession = albumCharacter().professions[0]!;
  const recipe = profession.album.find((r) => r.name === "Arcane Forge")!;
  recipe.sources = [
    {
      kind: "vendor",
      npcId: 1,
      npcName: "Fixture vendor",
      zone: "Orgrimmar",
      uiMapID: 1,
      x: 52.1,
      y: 34.2,
      cost: null,
      requiredSkill: null,
      limited: true,
      itemId: 1,
      firstSeen: 1,
      lastSeen: 2,
    },
  ];
  const showModal = vi.fn();
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(showModal);
  const wrapper = mount(Album, {
    props: { profession, filter: "all", game: "forever" },
    attachTo: document.body,
  });
  expect(wrapper.find("[data-zone-disabled]").exists()).toBe(false);
  expect(wrapper.find('select[aria-label="Zone"]').text()).toContain("Orgrimmar");
  await wrapper.find('[aria-label="Arcane Forge, missing, hard"]').trigger("click");
  await flushPromises();
  expect(showModal).toHaveBeenCalled();
  const dialog = wrapper.find("dialog");
  expect(dialog.attributes("aria-labelledby")).toBeTruthy();
  expect(dialog.text()).toContain("Blueprint: Arcane Forge");
  expect(dialog.text()).toContain("tradable");
  expect(dialog.text()).toContain("Required skill: 300");
  expect(dialog.text()).toContain("Maker's Spark");
  expect(dialog.text()).toContain("Fixture vendor · Orgrimmar (52.1, 34.2)");
  await dialog.trigger("close");
  await wrapper.find('[aria-label="Runed Copper Rod, known"]').trigger("click");
  await flushPromises();
  expect(dialog.text()).toContain("You know this. Grey at 10.");
});

test("filtering dims album slots, filters the list, and resets Show all", async () => {
  const wrapper = mount(Album, {
    props: { profession: albumCharacter().professions[0]!, filter: "all", game: "forever" },
  });
  await wrapper
    .findAll("button")
    .find((b) => b.text().startsWith("Show all"))!
    .trigger("click");
  await wrapper.setProps({ filter: "trainer" });
  expect(wrapper.findAll(".missing-recipe")).toHaveLength(0);
  expect(wrapper.findAll(".recipe-slot.is-dimmed")).toHaveLength(262);
  expect(wrapper.text()).toContain("No missing recipes match this filter");
  await wrapper.setProps({ filter: "all" });
  expect(wrapper.findAll(".missing-recipe")).toHaveLength(12);
});

test("public album has all named recipes and base filters without personal state; overlay retains unread slots", async () => {
  const { publicAlbum } = await import("../fixtures/public-professions");
  const { base, overlay } = publicAlbum("enchanting");
  const wrapper = mount(Album, { props: { base, filter: "all", game: "forever" } });
  expect(wrapper.findAll(".recipe-slot")).toHaveLength(262);
  expect(wrapper.find(".collection-ring").exists()).toBe(false);
  expect(wrapper.text()).toContain("Base difficulty");
  expect(wrapper.findAll("button").some((b) => b.text() === "Missing")).toBe(false);
  expect(wrapper.find('a[href="/forever/recipes/runed-copper-rod"]').exists()).toBe(true);
  await wrapper.setProps({ overlay });
  expect(wrapper.text()).toContain("Open your Enchanting window");
  expect(wrapper.findAll(".recipe-slot")).toHaveLength(262);
  expect(wrapper.findAll(".recipe-slot.is-known")).toHaveLength(0);
});

test("Tailoring overlay fills known slots and shows skill and easiest missing recipes", async () => {
  const { publicAlbum } = await import("../fixtures/public-professions");
  const { base, overlay } = publicAlbum("tailoring");
  const wrapper = mount(Album, { props: { base, overlay, filter: "all", game: "forever" } });
  expect(wrapper.findAll(".recipe-slot.is-known")).toHaveLength(7);
  expect(wrapper.text()).toContain("112 / 150");
  expect(wrapper.text()).toContain("Missing, easiest first");
});

import RecipeDetail from "../../app/components/RecipeDetail.vue";
test("single recipe base facts stay visible with a known or unread character overlay", async () => {
  const { publicAlbum } = await import("../fixtures/public-professions");
  const { base, overlay } = publicAlbum();
  const recipe = base.album.find((r) => r.name === "Runed Copper Rod")!;
  const wrapper = mount(RecipeDetail, { props: { recipe, inline: true, game: "forever" } });
  expect(wrapper.text()).toContain("Base difficulty");
  expect(wrapper.text()).toContain("from required skill");
  expect(wrapper.text()).not.toContain("your skill");
  expect(wrapper.find("aside").exists()).toBe(false);
  await wrapper.setProps({
    overlay: {
      character: overlay.character,
      skill: 145,
      max: 150,
      ...overlay.recipes[recipe.spellId]!,
    },
  });
  expect(wrapper.text()).toContain("Kania has not checked this yet");
  expect(wrapper.text()).toContain("145 / 150");
  const tailoring = publicAlbum("tailoring");
  const known = tailoring.base.album[0]!;
  await wrapper.setProps({
    recipe: known,
    overlay: {
      character: overlay.character,
      skill: 112,
      max: 150,
      ...tailoring.overlay.recipes[known.spellId]!,
    },
  });
  expect(wrapper.text()).toContain("Kania knows this");
  expect(wrapper.text()).toContain("Base difficulty");
});

test("a missing recipe card shows character reasons and the next step", async () => {
  const { publicAlbum } = await import("../fixtures/public-professions");
  const { base, overlay } = publicAlbum("tailoring");
  const recipe = base.album.find((r) => overlay.recipes[r.spellId]?.known === false)!;
  const wrapper = mount(RecipeDetail, {
    props: {
      recipe,
      inline: true,
      game: "forever",
      overlay: {
        character: overlay.character,
        skill: overlay.skill,
        max: overlay.max,
        ...overlay.recipes[recipe.spellId]!,
      },
    },
  });
  expect(wrapper.text()).toContain("Kania is missing this");
  expect(wrapper.text()).toContain("Open a trainer or recipe vendor");
  expect(wrapper.text()).toContain("Base difficulty");
});
