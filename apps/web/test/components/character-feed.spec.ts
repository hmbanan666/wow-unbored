import { test, expect, vi } from "vite-plus/test";
import { mount, config, flushPromises } from "@vue/test-utils";
import { createSSRApp, h, ref, Suspense } from "vue";
import { renderToString } from "@vue/server-renderer";
import FeedPage from "../../app/pages/[game]/players/[realm]/[name].vue";
import CommunityPage from "../../app/pages/[game]/feed.vue";
import FeedControls from "../../app/components/FeedControls.vue";
const character = { game: "forever", realm: "Realm", name: "Mira" };
const selected = "forever/Realm/Mira";
const stub = { shared: false, posts: [], next: null };
for (const component of [FeedPage, CommunityPage])
  test("public feed SSR ignores sign-in and character cookies", async () => {
    vi.stubGlobal("useRoute", () => ({
      params: { game: "forever", realm: "realm", name: "mira" },
      query: {},
    }));
    vi.stubGlobal("useFetch", async () => ({ data: ref(stub), error: ref(null) }));
    vi.stubGlobal("useHead", vi.fn());
    const privateFetch = vi.fn();
    vi.stubGlobal("$fetch", privateFetch);
    const render = async (signedIn: boolean) => {
      vi.stubGlobal("useState", () =>
        ref({
          status: "ready",
          signedIn,
          characters: signedIn ? [character] : [],
          selected: signedIn ? selected : "",
        }),
      );
      const app = createSSRApp({
        render: () => h(Suspense, null, { default: () => h(component) }),
      });
      for (const [name, value] of Object.entries(config.global.components))
        app.component(name, value);
      return renderToString(app);
    };
    const anonymous = await render(false);
    expect(await render(true)).toBe(anonymous);
    expect(anonymous).not.toContain("Sharing off");
    expect(anonymous).not.toContain("Mira");
    expect(privateFetch).not.toHaveBeenCalled();
  });
test("only the owner of the picked feed sees controls, with an explicit upload gate", async () => {
  const state = ref({ status: "ready", signedIn: true, characters: [character], selected });
  vi.stubGlobal("useState", () => state);
  const request = vi
    .fn()
    .mockResolvedValue({ enabled: false, href: "/forever/players/realm/mira", generation: "g" });
  vi.stubGlobal("$fetch", request);
  const controls = mount(FeedControls, { props: { href: "/forever/players/realm/mira" } });
  await flushPromises();
  expect(controls.get("[role=switch]").attributes("aria-checked")).toBe("false");
  expect(controls.find("input[type=file]").exists()).toBe(false);
  request.mockResolvedValue({
    enabled: true,
    href: "/forever/players/realm/mira",
    generation: "g",
  });
  await controls.get("button").trigger("click");
  await flushPromises();
  expect(controls.get("input[type=file]").attributes("disabled")).toBeDefined();
  await controls.get("input[type=checkbox]").setValue(true);
  expect(controls.get("input[type=file]").attributes("disabled")).toBeUndefined();
  await controls.setProps({ href: "/forever/players/realm/visitor" });
  expect(controls.find("[role=switch]").exists()).toBe(false);
  state.value = { status: "ready", signedIn: false, characters: [], selected: "" };
  await flushPromises();
  expect(controls.text()).toBe("");
});
