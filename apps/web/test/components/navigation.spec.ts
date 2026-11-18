import { expect, test, vi } from "vite-plus/test";
import { mount } from "@vue/test-utils";
import { reactive, nextTick } from "vue";
import Nav from "../../app/components/ds/Nav.vue";
import { SITE_NAV } from "../../shared/catalog";

test("both menus follow a guide's Game and clear it when leaving the guide", async () => {
  const route = reactive({
    path: "/guides/first-steps",
    fullPath: "/guides/first-steps",
    meta: { game: "forever" },
  });
  vi.stubGlobal("useRoute", () => route);
  const nav = mount(Nav, { props: { links: SITE_NAV } });
  for (const menu of nav.findAll("nav")) {
    expect(menu.findAll("a").map((a) => [a.text(), a.attributes("href")])).toEqual([
      ["WoW Forever", "/forever"],
      ["Professions", "/forever/professions"],
      ["WoW Retail", "/guides"],
    ]);
  }
  const current = () =>
    nav.findAll('a[aria-current="page"]').map((link) => link.attributes("href"));
  expect(current()).toEqual(["/forever", "/forever"]);
  route.meta.game = "retail";
  await nextTick();
  expect(current()).toEqual(["/guides", "/guides"]);
  route.path = route.fullPath = "/collections/first-mounts";
  route.meta.game = "forever";
  await nextTick();
  expect(current()).toEqual(["/guides", "/guides"]);
  for (const path of ["/forever/professions/enchanting", "/forever/recipes/enchanted-lute"]) {
    route.path = route.fullPath = path;
    await nextTick();
    expect(current()).toEqual(["/forever/professions", "/forever/professions"]);
  }
});
