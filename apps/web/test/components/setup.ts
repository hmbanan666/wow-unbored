import { config, enableAutoUnmount } from "@vue/test-utils";
import { afterEach, vi } from "vite-plus/test";
import * as vue from "vue";

// Nuxt supplies these imports in the app; component tests use the same Vue runtime.
for (const name of [
  "computed",
  "ref",
  "watch",
  "onMounted",
  "onBeforeUnmount",
  "nextTick",
  "useId",
  "resolveComponent",
] as const) {
  vi.stubGlobal(name, vue[name]);
}
const modules = import.meta.glob("../../app/components/**/*.vue", {
  eager: true,
  import: "default",
});
for (const [path, component] of Object.entries(modules)) {
  const name = (path.includes("/ds/") ? "Ds" : "") + path.split("/").pop()!.replace(".vue", "");
  config.global.components[name] = component as vue.Component;
}
config.global.components.NuxtLink = vue.defineComponent({
  props: ["to"],
  setup:
    (props, { slots }) =>
    () =>
      vue.h("a", { href: props.to }, slots.default?.()),
});
for (const name of ["useSeoMeta", "defineOgImage", "useSchemaOrg"]) vi.stubGlobal(name, vi.fn());
for (const name of ["defineArticle", "defineItemList", "defineBreadcrumb"])
  vi.stubGlobal(name, (value: unknown) => value);
vi.stubGlobal("useSiteConfig", () => ({ url: "https://playunbored.com" }));
enableAutoUnmount(afterEach);
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});
