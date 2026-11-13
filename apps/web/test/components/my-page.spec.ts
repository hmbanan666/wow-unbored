import { expect, test, vi } from "vite-plus/test";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref, Suspense } from "vue";
import MyPage from "../../app/pages/my/index.vue";
import { characterView } from "../../shared/my-page";
import { PATH_COPY } from "../../shared/personal-paths";

test("same-named Forever and Retail characters have separate chips and active Paths", async () => {
  const characters = (["retail", "forever"] as const).map((game) =>
    characterView({
      game,
      name: "Mira",
      realm: "Realm",
      className: "Mage",
      level: 23,
      charBody: {},
      mplusBody: {},
      reputationBody: {},
    }),
  );
  vi.stubGlobal("useFetch", async () => ({
    data: ref({ ok: true, characters, plans: [], wins: [], completions: [] }),
    status: ref("success"),
    refresh: vi.fn(),
  }));
  vi.stubGlobal("usePaths", () => ({
    data: ref({
      characters: [
        {
          character: "Mira",
          realm: "Realm",
          game: "retail",
          active: { kind: "path", slug: "retail-path", title: "Retail path", done: 1, total: 2 },
        },
      ],
    }),
    copy: PATH_COPY,
    loading: ref(false),
    message: ref(""),
    signedOut: ref(false),
    refresh: vi.fn(),
  }));
  const wrapper = mount(
    defineComponent({ render: () => h(Suspense, null, { default: () => h(MyPage) }) }),
  );
  await flushPromises();
  const cards = wrapper.findAll(".ds-card");
  expect(cards).toHaveLength(2);
  expect(cards[0]!.find('a[href="/my/retail/Realm/Mira"]').exists()).toBe(true);
  expect(cards[1]!.find('a[href="/my/forever/Realm/Mira"]').exists()).toBe(true);
  expect(cards[0]!.text()).not.toContain("Forever");
  expect(cards[0]!.text()).toContain("Retail path");
  expect(cards[1]!.text()).toContain("Forever");
  expect(cards[1]!.text()).not.toContain("Retail path");
});
