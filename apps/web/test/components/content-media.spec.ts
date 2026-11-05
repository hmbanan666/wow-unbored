import { expect, test, vi } from "vite-plus/test";
import { mount } from "@vue/test-utils";
import EntryBody from "../../app/components/EntryBody.vue";
import PageView from "../../app/components/PageView.vue";
import CatalogCard from "../../app/components/CatalogCard.vue";
import CollectionItems from "../../app/components/CollectionItems.vue";
import gameHeaderSource from "../../app/components/ds/GameHeader.vue?raw";
import gameFigureSource from "../../app/components/ds/GameFigure.vue?raw";
import gameTooltipSource from "../../app/components/ds/GameTooltip.vue?raw";
import tooltipSource from "../../app/components/ds/Tooltip.vue?raw";
import { PATH_COPY } from "../../shared/personal-paths";
import type { PublicPage } from "../../shared/catalog";

const asset = {
  name: "Golden Yak",
  alt: "A golden yak",
  width: 600,
  height: 600,
  variants: [
    { file: "0123456789abcdef-320.webp", width: 320, height: 320, format: "webp" as const },
    { file: "0123456789abcdef-600.webp", width: 600, height: 600, format: "webp" as const },
  ],
};
const icon = {
  ...asset,
  width: 56,
  height: 56,
  variants: [{ file: "0123456789abcdef-56.webp", width: 56, height: 56, format: "webp" as const }],
};
const item = {
  kind: "mount" as const,
  id: 460,
  name: "Golden Yak",
  source: { type: "vendor" as const, lines: ["Visit the summit."] },
  chance: false,
  note: "Bring gold.",
  url: "https://example.com/source",
};
const page: PublicPage = {
  game: "retail",
  kind: "guide",
  slug: "yak",
  title: "Meet the yak",
  headline: "Meet the yak",
  description: "A friend for the road.",
  tier: null,
  build: null,
  updatedAt: null,
  items: [item],
  blocks: [{ type: "paragraph", text: "Ride [[mount:460]]." }],
  hero: { kind: "mount", id: 460 },
  media: { "mount:460": { icon, render: asset } },
};

test("paragraph/list references expose names and details without links or closed render downloads", async () => {
  vi.spyOn(window, "matchMedia").mockReturnValue({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  } as unknown as MediaQueryList);
  const wrapper = mount(EntryBody, {
    props: {
      blocks: [...page.blocks, { type: "list", items: ["Find [[mount:460]]", "[[pet:999]]"] }],
      items: page.items,
      media: page.media,
    },
  });
  expect(wrapper.text()).toContain("Ride Golden Yak");
  expect(wrapper.html()).not.toContain("[[");
  expect(wrapper.find("a").exists()).toBe(false);
  expect(wrapper.findAll('[role="tooltip"]')).toHaveLength(2);
  expect(wrapper.html()).not.toContain("320.webp");
  await wrapper.get("button").trigger("click");
  expect(wrapper.html()).toContain("320.webp");
  expect(wrapper.html()).not.toContain("600.webp");
  expect(wrapper.get(".ds-game-tooltip__art img").attributes()).toMatchObject({
    width: "600",
    height: "600",
  });
  expect(wrapper.get(".ds-game-tooltip__art picture").classes()).toContain("ds-game-art--render");
  expect(gameTooltipSource).toMatch(
    /\.ds-game-tooltip__art\s*\{[^}]*background: var\(--render-bg\)/,
  );
  expect(tooltipSource).toMatch(
    /\.ds-tooltip__panel:has\(\.ds-game-tooltip__art\)\s*\{[^}]*background: var\(--render-bg\)/,
  );
});
test("figures have alt, caption and lazy pictures; absent media leaves no figure", () => {
  const blocks = [
    {
      type: "figure" as const,
      ref: { kind: "mount" as const, id: 460 },
      alt: "Yak at the summit",
      caption: "A good companion.",
    },
  ];
  const wrapper = mount(EntryBody, { props: { blocks, media: page.media } });
  expect(wrapper.get("figure img").attributes("alt")).toBe("Yak at the summit");
  expect(wrapper.get("figure img").attributes("loading")).toBe("lazy");
  expect(wrapper.get("figcaption").text()).toBe("A good companion.");
  expect(wrapper.get("figure").classes()).toContain("ds-game-figure--render");
  expect(wrapper.get("figure picture").classes()).toContain("ds-game-art--render");
  expect(gameFigureSource).toMatch(
    /\.ds-game-figure--render\s*\{[^}]*background: var\(--render-bg\)/,
  );
  // Prose uses the same spacing once its client styles load.
  expect(gameFigureSource).toContain("margin: var(--space-4) 0;");
  expect(mount(EntryBody, { props: { blocks } }).find("figure").exists()).toBe(false);
});
test("hero is the only eager image; guides without media preserve heading, prose, items and CTA", () => {
  const wrapper = mount(PageView, { props: { page } });
  expect(wrapper.get(".ds-game-header img").attributes("fetchpriority")).toBe("high");
  expect(wrapper.findAll('img[loading="eager"]')).toHaveLength(1);
  expect(wrapper.get("h1").text()).toBe(page.headline);
  const plain = mount(PageView, {
    props: {
      page: {
        ...page,
        hero: undefined,
        media: {},
        blocks: [{ type: "paragraph", text: "Start here." }],
      },
    },
  });
  expect(plain.find(".ds-game-header").exists()).toBe(false);
  expect(plain.find("img").exists()).toBe(false);
  expect(plain.get("h1").text()).toBe(page.headline);
  expect(plain.text()).toContain("Start here.");
  expect(plain.text()).toContain("How to get it");
  expect(plain.get('a[href="/install"]').text()).toBe("Get Unbored");
});
test("collection and path without a hero show up to six icons", () => {
  vi.stubGlobal("usePaths", () => ({ state: { value: { status: "signed-out" } } }));
  for (const kind of ["collection", "path"] as const) {
    const wrapper = mount(PageView, {
      props: {
        page: {
          ...page,
          kind,
          hero: undefined,
          items: Array.from({ length: 8 }, (_, i) => ({ ...item, id: i + 1 })),
        },
      },
      global: { stubs: { PersonalPaths: true } },
    });
    expect(wrapper.findAll(".ds-game-header .ds-game-icon")).toHaveLength(6);
  }
});
test("catalog cards remain real links and show at most five decorative icons above their title", () => {
  const wrapper = mount(CatalogCard, {
    props: {
      page: {
        ...page,
        kind: "collection",
        href: "/collections/yak",
        count: 8,
        icons: Array.from({ length: 7 }, (_, i) => ({ kind: "mount", id: i + 1, icon })),
      },
    },
  });
  expect(wrapper.get("a").attributes("href")).toBe("/collections/yak");
  expect(wrapper.findAll(".ds-game-icon")).toHaveLength(5);
  expect(wrapper.html().indexOf("ds-game-icon")).toBeLessThan(
    wrapper.html().indexOf("ds-card__title"),
  );
  expect(wrapper.find("button").exists()).toBe(false);
});
test("rich item rows keep chips, source, notes, progress and lazy desktop art", () => {
  const wrapper = mount(CollectionItems, { props: { items: page.items, media: page.media } });
  expect(wrapper.find(".ds-item__head .ds-game-icon").exists()).toBe(true);
  expect(wrapper.get("h2").text()).toContain("Golden Yak");
  expect(wrapper.text()).toContain("Guaranteed");
  expect(wrapper.text()).toContain("Bring gold.");
  expect(wrapper.get("a").attributes("href")).toBe(item.url);
  expect(wrapper.get(".ds-item__render img").attributes()).toMatchObject({
    width: "600",
    height: "600",
  });
  expect(wrapper.get(".ds-item__render img").attributes("loading")).toBe("lazy");
  expect(wrapper.get(".ds-item__render source").attributes("media")).toBe("(min-width: 768px)");
  expect(wrapper.get(".ds-item__render").classes()).toContain("ds-game-art--render");
});

test.each(["guide", "collection", "path"] as const)(
  "%s render hero has a solid matching frame",
  (kind) => {
    const wrapper = mount(PageView, {
      props: { page: { ...page, kind } },
      global: { stubs: { PersonalPaths: true } },
    });
    expect(wrapper.get(".ds-game-header img").attributes()).toMatchObject({
      width: "600",
      height: "600",
    });
    expect(wrapper.get(".ds-game-header__art").classes()).toContain("ds-game-header__art--render");
    expect(wrapper.get(".ds-game-header picture").classes()).toContain("ds-game-art--render");
    expect(gameHeaderSource).toMatch(
      /\.ds-game-header__art--render\s*\{[^}]*background: var\(--render-bg\)/,
    );
  },
);

test.each(["guide", "collection", "path"] as const)(
  "%s tile and own-image heroes fill the frame and keep their authored alt",
  (kind) => {
    const media = { "instance:42": { tile: asset }, "image:0123456789abcdef": { image: asset } };
    for (const hero of [
      { kind: "instance" as const, id: 42, alt: "The entrance" },
      { image: "0123456789abcdef", alt: "Our view" },
    ]) {
      const wrapper = mount(PageView, {
        props: { page: { ...page, kind, media, hero } },
        global: { stubs: { PersonalPaths: true } },
      });
      expect(wrapper.get(".ds-game-header img").attributes("alt")).toBe(hero.alt);
      expect(wrapper.find(".ds-game-header .ds-game-art--render").exists()).toBe(false);
      expect(wrapper.get(".ds-game-header picture").classes()).toContain("ds-game-art--cover");
      expect(wrapper.get(".ds-game-header__art").classes()).not.toContain(
        "ds-game-header__art--render",
      );
    }
    expect(gameHeaderSource).not.toContain("object-fit: contain");
  },
);

test.each(["retail", "forever"] as const)("%s guide own images use cover fitting", (game) => {
  const wrapper = mount(PageView, {
    props: {
      page: {
        ...page,
        game,
        items: [],
        hero: { image: "0123456789abcdef", alt: "Our screenshot" },
        blocks: [{ type: "figure", image: "0123456789abcdef", alt: "Our view" }],
        media: { "image:0123456789abcdef": { image: asset } },
      },
    },
  });
  expect(wrapper.get(".ds-game-header picture").classes()).toContain("ds-game-art--cover");
  expect(wrapper.get(".ds-game-header img").attributes()).toMatchObject({
    alt: "Our screenshot",
    loading: "eager",
  });
  expect(wrapper.get("figure picture").classes()).toContain("ds-game-art--cover");
  expect(wrapper.get("figure img").attributes()).toMatchObject({
    alt: "Our view",
    loading: "lazy",
  });
});

test("tile and own-image figures use cover without render backgrounds", () => {
  const media = { "instance:42": { tile: asset }, "image:0123456789abcdef": { image: asset } };
  const wrapper = mount(EntryBody, {
    props: {
      media,
      blocks: [
        { type: "figure", ref: { kind: "instance", id: 42 }, alt: "The entrance" },
        { type: "figure", image: "0123456789abcdef", alt: "Our view" },
      ],
    },
  });
  expect(wrapper.findAll("figure .ds-game-art--cover")).toHaveLength(2);
  expect(wrapper.find(".ds-game-figure--render").exists()).toBe(false);
});

test("media rows retain personal done and optional goal chips", () => {
  const wrapper = mount(CollectionItems, {
    props: {
      items: [item],
      media: page.media,
      progress: {
        kind: "collection",
        slug: "yak",
        locale: "en",
        title: "Yak",
        version: 1,
        done: 1,
        total: 1,
        goals: [{ position: 0, done: true, required: false }],
      },
      copy: PATH_COPY.en,
    },
  });
  expect(wrapper.text()).toContain(PATH_COPY.en.done);
  expect(wrapper.text()).toContain(PATH_COPY.en.optional);
});

test("Forever guide shows its own trail, evidence, badge and Article game without progress or art", () => {
  const schema = vi.fn();
  vi.stubGlobal("useSchemaOrg", schema);
  const forever: PublicPage = {
    ...page,
    game: "forever",
    hero: undefined,
    items: [],
    media: {},
    build: null,
    blocks: [{ type: "callout", tone: "forecast", text: "Rankings are early forecasts." }],
    sources: [{ label: "Launch notes", url: "https://example.com/launch", accessed: "2026-11-05" }],
    asOf: { date: "2026-11-05", build: "1.60.1.x", note: "Launch build." },
  };
  const wrapper = mount(PageView, { props: { page: forever } });
  expect(wrapper.get('nav[aria-label="Breadcrumb"]').text()).toContain("WoW Forever");
  expect(wrapper.get('nav[aria-label="Breadcrumb"] a[href="/forever"]').exists()).toBe(true);
  expect(wrapper.find(".ds-chip").text()).toBe("WoW Forever");
  expect(wrapper.text()).toContain("Checked against build 1.60.1.x on 5 Nov 2026");
  expect(wrapper.text()).toContain("Launch build.");
  expect(wrapper.text()).toContain("Rankings are early forecasts.");
  expect(wrapper.get('a[href="https://example.com/launch"]').attributes()).toMatchObject({
    target: "_blank",
    rel: "nofollow noopener noreferrer",
  });
  expect(wrapper.text()).toContain(" · Accessed 5 Nov 2026");
  expect(wrapper.text()).not.toContain("\u2014");
  expect(wrapper.findComponent({ name: "PersonalPaths" }).exists()).toBe(false);
  expect(wrapper.find('a[href="/install"]').exists()).toBe(false);
  expect(wrapper.findAll("img, picture")).toHaveLength(0);
  const nodes = schema.mock.calls.flatMap((call) => call[0]);
  expect(nodes.find((node) => node.headline)).toMatchObject({
    about: { "@type": "VideoGame", name: "World of Warcraft: Forever" },
  });
  expect(nodes.find((node) => node.itemListElement?.[0]?.name === "Home").itemListElement).toEqual([
    { name: "Home", item: "/" },
    { name: "WoW Forever", item: "/forever" },
    { name: page.title, item: "/guides/yak" },
  ]);
  schema.mockClear();
  const retail = mount(PageView, { props: { page } });
  expect(retail.get('nav[aria-label="Breadcrumb"]').text()).toContain("Guides");
  expect(schema.mock.calls.flatMap((call) => call[0]).find((node) => node.headline)).toMatchObject({
    about: { "@type": "VideoGame", name: "World of Warcraft" },
  });
});
