<script setup lang="ts">
import { moreGuides } from "#shared/forever-hub";
import {
  pageMessage,
  PUBLIC_COPY,
  type CatalogKind,
  type CatalogSummary,
  type PublicPage,
} from "#shared/catalog";

const props = defineProps<{ kind: CatalogKind }>();
const route = useRoute();
const slug = computed(() => String(route.params.slug ?? ""));

type Payload = PublicPage | { error: string; message: string };

const url = computed(() => `/api/catalog/${props.kind}/${encodeURIComponent(slug.value)}`);
const { data, error } = await useFetch<Payload>(url, { key: url });
const page = data.value && "headline" in data.value ? data.value : null;
if (!page) {
  const statusCode = error.value?.statusCode === 503 ? 503 : 404;
  throw createError({
    statusCode,
    statusMessage: pageMessage(
      data.value,
      error.value,
      statusCode === 503 ? PUBLIC_COPY.unavailable : PUBLIC_COPY.notFound,
    ),
    fatal: true,
  });
}
const siblings: CatalogSummary[] = [];
if (page.kind === "guide") {
  const { data: catalog } = await useFetch<{ pages: CatalogSummary[] }>("/api/catalog", {
    query: { kind: "guide", game: page.game },
  });
  siblings.push(...moreGuides(catalog.value?.pages ?? [], page));
}
</script>

<template>
  <PageView :page="page" :siblings="siblings" />
</template>
