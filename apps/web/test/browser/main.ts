import * as vue from "vue";
import ProfessionPage from "../../app/pages/[game]/professions/[slug].vue";
import RecipePage from "../../app/pages/[game]/recipes/[slug].vue";
import Nav from "../../app/components/ds/Nav.vue";
import Picker from "../../app/components/CharacterPicker.vue";
import { publicAlbum } from "../fixtures/public-professions";
import { characterKey } from "../../shared/selected-character";
import { SITE_NAV } from "../../shared/catalog";
import "../../app/assets/css/main.css";

// Real pages and components, with only the Nuxt environment and HTTP boundary replaced.
Object.assign(globalThis, vue);
const query = new URLSearchParams(location.search);
const signedIn = query.get("overlay") === "1";
const enchanting = publicAlbum(),
  tailoring = publicAlbum("tailoring");
const albums = [enchanting, tailoring];
const c = { ...enchanting.overlay.character, level: 23, class: "WARLOCK" };
const characters = [c, { ...c, game: "retail", name: "Mira", level: 80, class: "MAGE" }];
if (signedIn)
  document.cookie = `unbored_character=${encodeURIComponent(characterKey(c))}; Path=/; SameSite=Lax`;
const route = vue.reactive({
  path: location.pathname,
  fullPath: location.pathname + location.search,
  meta: {},
  params: { game: "forever", slug: location.pathname.split("/").pop() || "enchanting" },
  query: Object.fromEntries(query),
});
const refreshRoute = () => {
  route.path = location.pathname;
  route.fullPath = location.pathname + location.search;
  route.params.slug = location.pathname.split("/").pop() || "enchanting";
  route.query = Object.fromEntries(new URLSearchParams(location.search));
};
window.addEventListener("popstate", refreshRoute);
const states = new Map<string, vue.Ref>();
Object.assign(globalThis, {
  useState: (key: string, init: () => unknown) => {
    if (!states.has(key)) states.set(key, vue.ref(init()));
    return states.get(key);
  },
  useRoute: () => route,
  useRouter: () => ({
    push: ({ query }: { query: Record<string, string> }) => {
      history.pushState(null, "", `${location.pathname}?${new URLSearchParams(query)}`);
      refreshRoute();
    },
  }),
  useFetch: async (endpoint: string) => {
    const slug = endpoint.split("/").pop();
    const album = albums.find((p) => p.base.slug === slug) ?? enchanting;
    const recipe = albums.flatMap((p) => p.base.album).find((r) => r.slug === slug);
    const owner = albums.find((p) => p.base.album.some((r) => r.slug === slug)) ?? enchanting;
    return {
      data: vue.ref(
        endpoint.includes("/recipes/") ? { recipe, profession: owner.base } : album.base,
      ),
      error: vue.ref(null),
      status: vue.ref("success"),
      refresh: () => {},
    };
  },
  $fetch: async (endpoint: string) => {
    if (endpoint === "/api/me/characters")
      return { signedIn, characters: signedIn ? characters : [] };
    const slug = endpoint.split("/").pop();
    if (endpoint.includes("/recipes/")) {
      const owner = albums.find((p) => p.base.album.some((r) => r.slug === slug))!;
      const recipe = owner.base.album.find((r) => r.slug === slug)!;
      return {
        character: c,
        skill: owner.overlay.skill,
        max: owner.overlay.max,
        ...owner.overlay.recipes[recipe.spellId],
      };
    }
    return albums.find((p) => p.base.slug === slug)!.overlay;
  },
  useSeoMeta: () => {},
  useHead: () => {},
  useSchemaOrg: () => {},
  defineOgImage: () => {},
  defineBreadcrumb: (v: unknown) => v,
  useSiteConfig: () => ({ url: "https://playunbored.com" }),
  createError: (value: { message: string }) => new Error(value.message),
});
const app = vue.createApp({
  render: () =>
    vue.h(vue.Fragment, null, [
      vue.h(
        "div",
        { style: "padding: 4px 20px; color: #b8a385; font: 12px system-ui" },
        "Local fixture · synthetic recipe observations",
      ),
      vue.h(Nav, { links: SITE_NAV }, { character: () => vue.h(Picker) }),
      vue.h(vue.Suspense, null, {
        default: () =>
          vue.h(route.path.includes("/recipes/") ? RecipePage : ProfessionPage, {
            key: route.path,
          }),
      }),
    ]),
});
const components = import.meta.glob("../../app/components/**/*.vue", {
  eager: true,
  import: "default",
});
for (const [path, component] of Object.entries(components))
  app.component(
    (path.includes("/ds/") ? "Ds" : "") + path.split("/").pop()!.replace(".vue", ""),
    component as vue.Component,
  );
app.component(
  "NuxtLink",
  vue.defineComponent({
    props: ["to"],
    setup:
      (props, { slots }) =>
      () =>
        vue.h("a", { href: props.to }, slots.default?.()),
  }),
);
app.mount("#app");
