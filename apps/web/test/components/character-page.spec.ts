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
