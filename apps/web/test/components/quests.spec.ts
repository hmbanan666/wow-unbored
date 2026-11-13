import { test, expect, vi } from "vite-plus/test";
import { mount, config } from "@vue/test-utils";
import { createSSRApp, h, ref, Suspense } from "vue";
import { renderToString } from "@vue/server-renderer";
import QuestDetail from "../../app/components/QuestDetail.vue";
import QuestChainDetail from "../../app/components/QuestChainDetail.vue";
import QuestIndex from "../../app/components/QuestIndex.vue";
import QuestPage from "../../app/pages/[game]/quests/[slug].vue";
import ChainPage from "../../app/pages/[game]/quests/chains/[slug].vue";
import IndexPage from "../../app/pages/[game]/quests/index.vue";
import { questFixture, chainFixture, questOverlayFixture } from "../fixtures/quests";

test("quest detail and chain steps show observed places and personal progress", () => {
  const quest = mount(QuestDetail, {
    props: { quest: questFixture, overlay: questOverlayFixture },
  });
  expect(quest.text()).toContain("Marshal of Northshire");
  expect(quest.text()).toContain("48.2, 42.1");
  expect(quest.text()).toContain("Kania · Done");
  const chain = mount(QuestChainDetail, {
    props: { chain: chainFixture, overlay: questOverlayFixture },
  });
  expect(chain.text()).toContain("Next step");
  expect(chain.text()).toContain("In your quest log");
  expect(chain.findAll("a")[0]?.attributes("href")).toBe("/forever/quests/a-beginning");
});
test("the empty index and missing observations explain how to fill them", () => {
  expect(mount(QuestIndex, { props: { quests: [], chains: [] } }).text()).toContain(
    "Accept or turn in a quest",
  );
  const detail = mount(QuestDetail, {
    props: { quest: { ...questFixture, title: null, accept: [], turnIn: [] } },
  });
  expect(detail.text()).toContain("English title has not been observed");
  expect(detail.text()).toContain("No location observed yet");
});
for (const [component, data, slug] of [
  [QuestPage, questFixture, "a-beginning"],
  [ChainPage, chainFixture, "first-steps"],
  [IndexPage, { quests: [questFixture], chains: [chainFixture] }, ""],
] as const) {
  test(`public quest SSR is identical with or without a picked character (${slug || "index"})`, async () => {
    vi.stubGlobal("useRoute", () => ({ params: { game: "forever", slug } }));
    vi.stubGlobal("useFetch", async () => ({ data: ref(data), error: ref(null) }));
    vi.stubGlobal("useHead", vi.fn());
    vi.stubGlobal("createError", (v: unknown) => new Error(JSON.stringify(v)));
    const privateFetch = vi.fn();
    vi.stubGlobal("$fetch", privateFetch);
    const render = async (signedIn: boolean) => {
      vi.stubGlobal("useState", () =>
        ref({
          status: "ready",
          signedIn,
          characters: signedIn ? [questOverlayFixture.character] : [],
          selected: signedIn ? "forever/Realm/Kania" : "",
        }),
      );
      const app = createSSRApp({
        render: () => h(Suspense, null, { default: () => h(component) }),
      });
      for (const [name, c] of Object.entries(config.global.components)) app.component(name, c);
      return renderToString(app);
    };
    const anonymous = await render(false);
    expect(await render(true)).toBe(anonymous);
    expect(anonymous).not.toContain("Kania");
    expect(privateFetch).not.toHaveBeenCalled();
  });
}

test("a quest links to chains where it really is the next step", () => {
  const quest = mount(QuestDetail, {
    props: {
      quest: questFixture,
      overlay: {
        ...questOverlayFixture,
        nextChains: [{ slug: "first-steps", title: "First steps in Elwynn" }],
      },
    },
  });
  expect(quest.text()).toContain("Next step in First steps in Elwynn");
  expect(quest.get("a").attributes("href")).toBe("/forever/quests/chains/first-steps");
});
