import * as vue from "vue";
import ProfessionPage from "../../app/pages/my/[game]/[realm]/[name]/[profession].vue";
import CharacterPage from "../../app/pages/my/[game]/[realm]/[name]/index.vue";
import { albumCharacter } from "../fixtures/profession-album";
import "../../app/assets/css/main.css";

// Browser fixture harness uses the real page and components with only its API boundary replaced.
Object.assign(globalThis, vue);
const query = new URLSearchParams(location.search);
const state = query.get("state");
const character = albumCharacter(
  state === "unopened" || state === "empty" ? state : "known",
  query.get("game") === "retail" ? "retail" : "forever",
);
const route = vue.reactive({
  params: {
    game: character.game,
    realm: character.realm,
    name: character.name,
    profession: location.pathname.split("/").pop() || "enchanting",
  },
  query: Object.fromEntries(query),
});
const refreshRoute = () => {
  route.query = Object.fromEntries(new URLSearchParams(location.search));
  route.params.profession = location.pathname.split("/").pop() || "enchanting";
};
window.addEventListener("popstate", refreshRoute);
Object.assign(globalThis, {
  useRoute: () => route,
  useRouter: () => ({
    push: ({ query }: { query: Record<string, string> }) => {
      history.pushState(null, "", `${location.pathname}?${new URLSearchParams(query)}`);
      refreshRoute();
    },
  }),
  useFetch: async () => ({
    data: vue.ref({ ok: true, lang: "en", character }),
    error: vue.ref(null),
    status: vue.ref("success"),
    refresh: () => {},
  }),
  useSeoMeta: () => {},
  createError: (value: { message: string }) => new Error(value.message),
});
const app = vue.createApp({
  render: () =>
    vue.h(vue.Fragment, null, [
      vue.h(
        "div",
        { style: "padding: 8px 20px; background: #2a1c15; color: #b8a385; font: 13px system-ui" },
        "Local fixture · Kania · example recipe state · private page",
      ),
      vue.h(vue.Suspense, null, {
        default: () =>
          vue.h(route.params.profession === "Kania" ? CharacterPage : ProfessionPage, {
            key: route.params.profession,
          }),
      }),
    ]),
});
const components = import.meta.glob("../../app/components/**/*.vue", {
  eager: true,
  import: "default",
});
for (const [path, component] of Object.entries(components)) {
  app.component(
    (path.includes("/ds/") ? "Ds" : "") + path.split("/").pop()!.replace(".vue", ""),
    component as vue.Component,
  );
}
app.component(
  "NuxtLink",
  vue.defineComponent({
    props: ["to"],
    setup:
      (props, { slots }) =>
      () =>
        vue.h(
          "a",
          {
            href: props.to,
            onClick: (event: MouseEvent) => {
              event.preventDefault();
              history.pushState(null, "", props.to + location.search);
              refreshRoute();
            },
          },
          slots.default?.(),
        ),
  }),
);
app.mount("#app");
