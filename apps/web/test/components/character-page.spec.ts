import { expect, test, vi } from "vite-plus/test";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref, Suspense } from "vue";
import CharacterPage from "../../app/pages/my/[game]/[realm]/[name].vue";
import { CHARACTER_COPY } from "../../shared/character-page";

for (const game of ["retail", "forever"]) {
  test(`${game} character renders skill and known recipes`, async () => {
    vi.stubGlobal("useRoute", () => ({ params: { game, realm: "Realm", name: "Mira" } }));
    vi.stubGlobal("useFetch", async () => ({
      data: ref({
        ok: true,
        lang: "en",
        character: {
          game,
          realm: "Realm",
          name: "Mira",
          professions: [
            { skillLine: 171, name: "Alchemy", skill: 112, max: 150, known: 4 },
            { skillLine: 185, name: "Cooking", skill: 1, max: 75, known: null },
          ],
        },
      }),
      error: ref(null),
      status: ref("success"),
      refresh: vi.fn(),
    }));
    const wrapper = mount(
      defineComponent({ render: () => h(Suspense, null, { default: () => h(CharacterPage) }) }),
    );
    await flushPromises();
    expect(wrapper.text()).toContain("Alchemy");
    expect(wrapper.text()).toContain("112 / 150");
    expect(wrapper.text()).toContain("Known recipes: 4");
    expect(wrapper.text()).toContain(CHARACTER_COPY.en.catalogEmpty);
    expect(wrapper.text()).not.toContain("of 0");
    expect(wrapper.text()).toContain(CHARACTER_COPY.en.open);
    expect(wrapper.find('a[href="/my"]').exists()).toBe(true);
    expect(vi.mocked(useSeoMeta)).toHaveBeenCalledWith(
      expect.objectContaining({ robots: "noindex" }),
    );
  });
}

test("unseen professions have Russian guidance, with no fabricated zero", async () => {
  vi.stubGlobal("useRoute", () => ({ params: { game: "forever", realm: "Realm", name: "Mira" } }));
  vi.stubGlobal("useFetch", async () => ({
    data: ref({
      ok: true,
      lang: "ru",
      character: { name: "Mira", realm: "Realm", game: "forever", professions: [] },
    }),
    error: ref(null),
    status: ref("success"),
    refresh: vi.fn(),
  }));
  const wrapper = mount(
    defineComponent({ render: () => h(Suspense, null, { default: () => h(CharacterPage) }) }),
  );
  await flushPromises();
  expect(wrapper.text()).toContain(CHARACTER_COPY.ru.empty);
  expect(wrapper.text()).toContain(CHARACTER_COPY.ru.open);
  expect(wrapper.text()).not.toContain("0 / 0");
});

test("catalog recipes render totals, sources, colour text and uncatalogued count", async () => {
  vi.stubGlobal("useRoute", () => ({ params: { game: "forever", realm: "Realm", name: "Mira" } }));
  vi.stubGlobal("useFetch", async () => ({
    data: ref({
      ok: true,
      lang: "en",
      character: {
        game: "forever",
        realm: "Realm",
        name: "Mira",
        professions: [
          {
            skillLine: 171,
            name: "Alchemy",
            skill: 100,
            max: 150,
            known: 2,
            total: 4,
            uncatalogued: 1,
            missing: [
              {
                id: "unseen",
                name: "Not seen yet",
                explanation: "No place has been seen yet.",
                recipes: [
                  {
                    spellId: 2334,
                    name: "Elixir of Minor Fortitude",
                    minSkill: 50,
                    band: "green",
                    sources: [],
                    teachingItemNames: [],
                  },
                  {
                    spellId: 2330,
                    name: null,
                    minSkill: 1,
                    band: "grey",
                    sources: [],
                    teachingItemNames: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    }),
    error: ref(null),
    status: ref("success"),
    refresh: vi.fn(),
  }));
  const wrapper = mount(
    defineComponent({ render: () => h(Suspense, null, { default: () => h(CharacterPage) }) }),
  );
  await flushPromises();
  expect(wrapper.text()).toContain("Known recipes: 2 of 4");
  expect(wrapper.text()).toContain("Known recipes not yet in this list: 1");
  expect(wrapper.find("summary").text()).toContain("Missing recipes (2)");
  expect(wrapper.find("h3").text()).toBe("Not seen yet");
  expect(wrapper.text()).toContain("Elixir of Minor Fortitude");
  expect(wrapper.text()).toContain("Minimum skill: 50");
  expect(wrapper.find(".recipe-band--green").text()).toBe("Green");
  expect(wrapper.text()).toContain(CHARACTER_COPY.en.unnamed);
  expect(wrapper.text()).not.toContain("2330");
});

test("source groups show past stock, places, item-only evidence and tap explanations", async () => {
  const { default: ProfessionRecipes } = await import("../../app/components/ProfessionRecipes.vue");
  const { professionViews } = await import("../../shared/character-page");
  const { SOURCE_GROUPS } = await import("@unbored/contracts/recipe-sources");
  const catalog = Array.from({ length: 5 }, (_, i) => ({
    spellId: i + 1,
    skillLine: 171,
    name: `Recipe ${i + 1}`,
    category: { id: 1, name: "Potions", order: 0 },
    minSkill: 1,
    thresholds: { orange: 1, yellow: 2, green: 3, grey: 4 },
    skillUps: 1,
    acquireMethod: 0,
    reagents: [],
    craftedItems: [],
    teachingItems: i === 3 ? [2555] : [],
  }));
  const place = {
    npcId: 123,
    npcName: "Recipe vendor",
    zone: "Elwynn Forest",
    uiMapID: 1429,
    x: 12.3,
    y: 45.6,
    cost: 12345,
    requiredSkill: 50,
    itemId: null,
    firstSeen: 1,
    lastSeen: 2,
  };
  const [profession] = professionViews(
    { list: [{ skillLine: 171, name: "Alchemy", skill: 50 }] },
    { byProfession: { "171": { learned: ["ids1"] } } },
    catalog,
    [
      { spellId: 1, sources: [{ ...place, kind: "trainer", limited: false }], teachingItems: [] },
      { spellId: 2, sources: [{ ...place, kind: "vendor", limited: false }], teachingItems: [] },
      { spellId: 3, sources: [{ ...place, kind: "vendor", limited: true }], teachingItems: [] },
      {
        spellId: 4,
        sources: [],
        teachingItems: [{ itemId: 2555, name: "Recipe: Swiftness Potion" }],
      },
    ],
  );
  const wrapper = mount(ProfessionRecipes, { props: { profession, lang: "en" } });
  expect(wrapper.findAll("h3").map((h) => h.text())).toEqual(SOURCE_GROUPS.map((g) => g.name));
  expect(wrapper.text()).toContain("Elwynn Forest");
  expect(wrapper.text()).toContain("1g 23s 45c");
  expect(wrapper.text()).toContain("Required skill: 50");
  expect(wrapper.text()).toContain("Comes from Recipe: Swiftness Potion.");
  expect(wrapper.findAll(".source-explanation summary")).toHaveLength(5);
  expect(wrapper.text()).toContain("not live availability");
  expect(wrapper.text()).not.toContain("—");
  const complete = professionViews(
    { list: [{ skillLine: 171, name: "Alchemy" }] },
    { byProfession: { "171": { learned: ["ids1", "1,1,1,1,1"] } } },
    catalog,
  )[0];
  await wrapper.setProps({ profession: complete });
  expect(wrapper.text()).toContain("You know every recipe in this list.");
});
