import { expect, test } from "vite-plus/test";
import { mount } from "@vue/test-utils";
import NamedRecipes from "../../app/components/NamedRecipes.vue";
import RecipeDetail from "../../app/components/RecipeDetail.vue";
import { publicAlbum } from "../fixtures/public-professions";
test("public recipes are named, searchable and progressively disclosed", async () => {
  const { base, overlay } = publicAlbum();
  const wrapper = mount(NamedRecipes, { props: { base, filter: "all", game: "forever" } });
  expect(wrapper.findAll(".directory li a")).toHaveLength(12);
  await wrapper.get(".directory button").trigger("click");
  expect(wrapper.findAll(".directory li a")).toHaveLength(24);
  await wrapper.get('input[type="search"]').setValue("runed copper rod");
  expect(wrapper.findAll(".directory li a")).toHaveLength(1);
  expect(wrapper.get(".directory li a").attributes("href")).toBe(
    "/forever/recipes/runed-copper-rod",
  );
  await wrapper.setProps({ filter: "trainer" });
  expect(wrapper.findAll(".directory li a")).toHaveLength(0);
  await wrapper.setProps({ overlay, filter: "all" });
  expect(wrapper.get(".directory li").text()).toContain("Runed Copper Rod");
});

test("a selected character adds only known markers to the named recipe directory", async () => {
  const { base, overlay } = publicAlbum("tailoring");
  const wrapper = mount(NamedRecipes, { props: { base, overlay, filter: "all", game: "forever" } });
  await wrapper.setProps({ filter: "category:100" });
  expect(wrapper.findAll(".directory .known")).toHaveLength(7);
  expect(wrapper.find(".collection-ring").exists()).toBe(false);
  expect(wrapper.find(".missing-section").exists()).toBe(false);
  expect(wrapper.get(".directory").text()).not.toContain("Unchecked");
});

test("a recipe keeps its public formula, skill and material facts together", () => {
  const recipe = publicAlbum().base.album.find((r) => r.name === "Arcane Forge")!;
  const wrapper = mount(RecipeDetail, { props: { recipe, game: "forever" } });
  expect(wrapper.text()).toContain("Blueprint: Arcane Forge");
  expect(wrapper.text()).toContain("Required skill: 300");
  expect(wrapper.text()).toContain("Maker's Spark");
  expect(wrapper.text()).toContain("from required skill");
  expect(wrapper.text()).toContain("Base difficulty");
});
