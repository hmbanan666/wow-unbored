import type { PublicPage } from "#shared/catalog";

/** Resolve the Game before the header renders, on the server and on navigation. */
export default defineNuxtRouteMiddleware(async (to) => {
  const url = `/api/catalog/guide/${encodeURIComponent(String(to.params.slug))}`;
  const { data } = await useFetch<PublicPage>(url, { key: url });
  to.meta.game = data.value?.game;
});
