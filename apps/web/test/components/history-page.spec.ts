import { expect, test, vi } from "vite-plus/test";
import { flushPromises, mount, config } from "@vue/test-utils";
// Sharing has its own mounted/SSR tests; these tests exercise history/profile loading.
config.global.stubs.FeedControls = true;
import { defineComponent, h, ref, Suspense, createSSRApp } from "vue";
import { renderToString } from "@vue/server-renderer";
import Page from "../../app/pages/my/[game]/[realm]/[name]/history.vue";
import Chart from "../../app/components/HistoryChart.vue";

for (const game of ["retail", "forever"]) {
  test(`${game} history renders charts, UTC days, type links and cursor navigation`, async () => {
    vi.stubGlobal("useRoute", () => ({
      params: { game, realm: "Realm", name: "Mira" },
      query: {},
    }));
    vi.stubGlobal("useFetch", async () => ({
      data: ref({
        ok: true,
        history: {
          game,
          realm: "Realm",
          name: "Mira",
          charts: [
            {
              key: "level_up:",
              title: "Level over time",
              money: false,
              points: [
                { at: 1790000000, value: 10 },
                { at: 1790086400, value: 11 },
              ],
            },
            {
              key: "gold_close:",
              title: "Gold over time",
              money: true,
              points: [{ at: 1790000000, value: 12345 }],
            },
            {
              key: "skill_step:171",
              title: "Alchemy skill",
              money: false,
              points: [{ at: 1790000000, value: 13 }],
            },
          ],
          events: [
            {
              id: 1,
              type: "recipe_learned",
              at: 1790000000,
              label: "Recipe learned: Swiftness Potion",
            },
          ],
          next: { at: 1790000000, id: 1 },
        },
      }),
      error: ref(null),
      status: ref("success"),
      refresh: vi.fn(),
    }));
    const wrapper = mount(
      defineComponent({ render: () => h(Suspense, null, { default: () => h(Page) }) }),
    );
    await flushPromises();
    expect(wrapper.findAll("svg")).toHaveLength(3);
    expect(wrapper.text()).toContain("1g 23s 45c");
    expect(wrapper.text()).toContain("Swiftness Potion");
    expect(wrapper.find('a[aria-current="page"]').text()).toBe("All changes");
    expect(
      wrapper.findAll("a").some((a) => a.attributes("href")?.includes("cursor=1790000000%3A1")),
    ).toBe(true);
    expect(vi.mocked(useSeoMeta)).toHaveBeenCalledWith(
      expect.objectContaining({ robots: "noindex, nofollow" }),
    );
  });
}

test("empty history gives a way forward", async () => {
  vi.stubGlobal("useRoute", () => ({
    params: { game: "retail", realm: "Realm", name: "Mira" },
    query: {},
  }));
  vi.stubGlobal("useFetch", async () => ({
    data: ref({ ok: true, history: { events: [], charts: [], next: null } }),
    error: ref(null),
    status: ref("success"),
    refresh: vi.fn(),
  }));
  const wrapper = mount(
    defineComponent({ render: () => h(Suspense, null, { default: () => h(Page) }) }),
  );
  await flushPromises();
  expect(wrapper.text()).toContain("No changes recorded yet");
  expect(wrapper.text()).toContain("Companion");
  expect(wrapper.findAll("svg")).toHaveLength(0);
});

test("inline SVG renders on the server with dated points and accessible values", async () => {
  const html = await renderToString(
    createSSRApp(Chart, {
      chart: {
        key: "gold",
        title: "Gold over time",
        money: true,
        points: [{ at: 1790000000, value: 12345 }],
      },
    }),
  );
  expect(html).toContain("<svg");
  expect(html).toContain('role="img"');
  expect(html).toContain("1g 23s 45c");
  expect(html).not.toContain("NaN");
});
