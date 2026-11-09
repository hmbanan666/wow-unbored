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

async function render(component: typeof Forever, pages = entries, unavailable = false) {
  const refresh = vi.fn();
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
    error: ref(unavailable ? { statusCode: 503 } : null),
    refresh,
  }));
  vi.stubGlobal("useFetch", fetch);
  vi.stubGlobal("defineWebPage", (value: unknown) => value);
  vi.stubGlobal("defineSoftwareApp", (value: unknown) => value);
  const wrapper = mount(
    defineComponent({ render: () => h(Suspense, null, { default: () => h(component) }) }),
  );
  await flushPromises();
  return { wrapper, fetch, refresh };
}

test("Forever index requests only Forever guides and links to stable guide URLs", async () => {
  const { wrapper, fetch } = await render(Forever);
  expect(fetch).toHaveBeenCalledWith("/api/catalog", { query: { kind: "guide", game: "forever" } });
  expect(wrapper.get("h1").text()).toBe("WoW Forever Guides: Classes, Systems and Gold");
  expect(wrapper.text()).toContain("4 November 2026");
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

test("Forever distinguishes unavailable content from an empty catalog and offers retry", async () => {
  const { wrapper, refresh } = await render(Forever, [], true);
  expect(wrapper.text()).not.toContain("The first WoW Forever guides are on their way.");
  expect(wrapper.find("img").exists()).toBe(false);
  const retry = wrapper.findAll("button").find((button) => button.text() === "Try again");
  expect(retry).toBeDefined();
  await retry!.trigger("click");
  expect(refresh).toHaveBeenCalledOnce();
});

test("hub uses groups, hides empty topics, adds a published FAQ and lists recent publication dates", async () => {
  const guide = entries[1]!;
  const pages: CatalogSummary[] = [
    {
      ...guide,
      slug: "wow-forever-beginners-guide",
      href: "/guides/wow-forever-beginners-guide",
      group: "first-steps",
      updatedAt: 1793865600,
    },
    {
      ...guide,
      slug: "wow-forever-enhanced-vs-classic-preset",
      href: "/guides/wow-forever-enhanced-vs-classic-preset",
      group: "systems",
      updatedAt: 1794211200,
    },
    {
      ...guide,
      slug: "a-new-system",
      href: "/guides/a-new-system",
      group: "systems",
      updatedAt: 1794124800,
    },
  ];
  const { wrapper } = await render(Forever, pages);
  expect(wrapper.findAll("h1")).toHaveLength(1);
  const sections = wrapper.findAll("section");
  const systems = sections.find((s) => s.find("h2").text() === "Systems")!;
  expect(systems.find('a[href="/guides/a-new-system"]').exists()).toBe(true);
  expect(wrapper.text()).not.toContain("Dungeons and raids");
  const start = sections.find((s) => s.find("h2").text() === "Start here")!;
  expect(start.findAll('a[href^="/guides/"]')).toHaveLength(2);
  const recent = sections.find((s) => s.find("h2").text() === "Recently updated")!;
  expect(recent.findAll("time").map((t) => t.attributes("datetime"))).toEqual([
    "2026-11-09",
    "2026-11-08",
    "2026-11-05",
  ]);
  const faq = {
    ...guide,
    slug: "wow-forever-faq",
    href: "/guides/wow-forever-faq",
    group: "first-steps" as const,
  };
  const withFaq = await render(Forever, [...pages, faq]);
  expect(
    withFaq.wrapper
      .findAll("section")
      .find((s) => s.find("h2").text() === "Start here")!
      .findAll('a[href^="/guides/"]'),
  ).toHaveLength(3);
});

test("empty Forever hub keeps its introduction without a mascot or empty topic sections", async () => {
  const { wrapper } = await render(Forever, []);
  expect(wrapper.text()).toContain("The first WoW Forever guides are on their way.");
  expect(wrapper.find("img").exists()).toBe(false);
  expect(wrapper.find("[data-guide-group]").exists()).toBe(false);
});
