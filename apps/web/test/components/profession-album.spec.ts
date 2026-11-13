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
import { defineComponent, h, ref, reactive, Suspense } from "vue";
import Page from "../../app/pages/my/[game]/[realm]/[name]/[profession].vue";

for (const game of ["forever", "retail"] as const) {
  test(`${game} profession route uses private character API and URL filter including back navigation`, async () => {
    const character = albumCharacter("empty", game);
    const route = reactive({
      params: { game, realm: character.realm, name: character.name, profession: "enchanting" },
      query: { f: "missing", keep: "value" },
    });
    const push = vi.fn();
    vi.stubGlobal("useRoute", () => route);
    vi.stubGlobal("useRouter", () => ({ push }));
    const fetch = vi.fn(async () => ({
      data: ref({ ok: true, character }),
      error: ref(null),
      status: ref("success"),
      refresh: vi.fn(),
    }));
    vi.stubGlobal("useFetch", fetch);
    const wrapper = mount(
      defineComponent({ render: () => h(Suspense, null, { default: () => h(Page) }) }),
    );
    await flushPromises();
    expect(fetch.mock.calls[0]?.[0].value).toBe(
      `/api/me/characters/${game}/CAMWOW%20EU4%20Realm%203%20PvE/Kania`,
    );
    expect(wrapper.find('button[aria-pressed="true"]').text()).toBe("Missing");
    await wrapper
      .findAll("button")
      .find((b) => b.text() === "Can get now")!
      .trigger("click");
    expect(push).toHaveBeenCalledWith({ query: { f: "now", keep: "value" } });
    route.query.f = "trainer";
    await flushPromises();
    expect(wrapper.find('button[aria-pressed="true"]').text()).toBe("Trainer");
    expect(vi.mocked(useSeoMeta)).toHaveBeenCalledWith(
      expect.objectContaining({ robots: "noindex, nofollow" }),
    );
  });
}

test("unknown profession slugs return 404", async () => {
  vi.stubGlobal("useRoute", () => ({
    params: { game: "forever", realm: "Realm", name: "Kania", profession: "unknown" },
    query: {},
  }));
  vi.stubGlobal("useRouter", () => ({ push: vi.fn() }));
  vi.stubGlobal("useFetch", async () => ({
    data: ref({ ok: true, character: albumCharacter() }),
    error: ref(null),
    status: ref("success"),
    refresh: vi.fn(),
  }));
  vi.stubGlobal("createError", (input: unknown) => input);
  const errors: unknown[] = [];
  mount(defineComponent({ render: () => h(Suspense, null, { default: () => h(Page) }) }), {
    global: { config: { errorHandler: (error) => errors.push(error) } },
  });
  await flushPromises();
  expect(errors).toContainEqual({ statusCode: 404, message: "Profession not found." });
});

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
