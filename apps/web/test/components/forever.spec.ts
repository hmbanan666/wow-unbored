import { expect, test, vi } from "vite-plus/test";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref, Suspense } from "vue";
import Forever from "../../app/pages/forever.vue";
import Guides from "../../app/pages/guides/index.vue";
import Home from "../../app/pages/index.vue";
import type { CatalogSummary } from "../../shared/catalog";

const entries: CatalogSummary[] = ["retail", "forever"].map((game) => ({
  game: game as "retail" | "forever",
  kind: "guide",
  slug: `${game}-start`,
  href: `/guides/${game}-start`,
  title: `${game} start`,
  description: "First steps.",
  tier: null,
  count: 0,
  updatedAt: null,
  icons: [],
}));

async function render(component: typeof Forever, pages = entries) {
  const fetch = vi.fn(async (url: string, options?: { query?: { game?: string } }) => ({
    data: ref(
      url === "/api/home"
        ? {
            game: "retail",
            kind: "page",
            title: "Home",
            headline: "Home",
            description: "Welcome.",
            blocks: [],
            items: [],
            media: {},
          }
        : {
            pages: pages.filter(
              (page) => !options?.query?.game || page.game === options.query.game,
            ),
          },
    ),
    error: ref(null),
  }));
  vi.stubGlobal("useFetch", fetch);
  vi.stubGlobal("defineWebPage", (value: unknown) => value);
  vi.stubGlobal("defineSoftwareApp", (value: unknown) => value);
  const wrapper = mount(
    defineComponent({ render: () => h(Suspense, null, { default: () => h(component) }) }),
  );
  await flushPromises();
  return { wrapper, fetch };
}

test("Forever index requests only Forever guides and links to stable guide URLs", async () => {
  const { wrapper, fetch } = await render(Forever);
  expect(fetch).toHaveBeenCalledWith("/api/catalog", { query: { kind: "guide", game: "forever" } });
  expect(wrapper.get("h1").text()).toBe("WoW Forever guides");
  expect(wrapper.text()).toContain("launched on 4 November 2026");
  expect(wrapper.get('a[href="/guides/forever-start"]').text()).toContain("forever start");
  expect(wrapper.find('a[href="/guides/retail-start"]').exists()).toBe(false);
});

test("retail index keeps a single Forever card and only retail guide cards", async () => {
  const { wrapper, fetch } = await render(Guides);
  expect(fetch).toHaveBeenCalledWith("/api/catalog", { query: { kind: "guide", game: "retail" } });
  expect(wrapper.findAll('a[href="/forever"]')).toHaveLength(1);
  expect(wrapper.find('a[href="/guides/forever-start"]').exists()).toBe(false);
  expect(wrapper.find('a[href="/guides/retail-start"]').exists()).toBe(true);
});

test("home features Forever only when it has a published guide", async () => {
  const { wrapper } = await render(Home);
  expect(wrapper.find('a[href="/forever"]').exists()).toBe(true);
  expect(wrapper.find('a[href="/guides/forever-start"]').exists()).toBe(false);
  const empty = await render(
    Home,
    entries.filter((page) => page.game === "retail"),
  );
  expect(empty.wrapper.find('a[href="/forever"]').exists()).toBe(false);
});
