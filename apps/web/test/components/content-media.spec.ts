import { expect, test, vi } from "vite-plus/test";
import { mount } from "@vue/test-utils";
import EntryBody from "../../app/components/EntryBody.vue";
import PageView from "../../app/components/PageView.vue";
import CatalogCard from "../../app/components/CatalogCard.vue";
import CollectionItems from "../../app/components/CollectionItems.vue";
import { PATH_COPY } from "../../shared/personal-paths";
import type { PublicPage } from "../../shared/catalog";

const asset = {
  name: "Golden Yak",
  alt: "A golden yak",
  width: 320,
  height: 240,
  variants: [
    { file: "0123456789abcdef-320.webp", width: 320, height: 240, format: "webp" as const },
    { file: "0123456789abcdef-640.webp", width: 640, height: 480, format: "webp" as const },
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
  expect(wrapper.html()).not.toContain("640.webp");
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
  expect(wrapper.get(".ds-item__render img").attributes("loading")).toBe("lazy");
  expect(wrapper.get(".ds-item__render source").attributes("media")).toBe("(min-width: 768px)");
});

test("tile and own-image heroes keep their authored alt and figures omit missing art", () => {
  const media = { "instance:42": { tile: asset }, "image:0123456789abcdef": { image: asset } };
  for (const hero of [
    { kind: "instance" as const, id: 42, alt: "The entrance" },
    { image: "0123456789abcdef", alt: "Our view" },
  ]) {
    const wrapper = mount(PageView, { props: { page: { ...page, media, hero } } });
    expect(wrapper.get(".ds-game-header img").attributes("alt")).toBe(hero.alt);
    expect(wrapper.find(".ds-game-header .ds-game-art--render").exists()).toBe(false);
  }
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
