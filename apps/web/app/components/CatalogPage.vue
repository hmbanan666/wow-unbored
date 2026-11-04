<script setup lang="ts">
import { pageMessage, PUBLIC_COPY, type PublicPage } from "#shared/catalog";

const props = defineProps<{ kind: "path" | "collection" }>();
const route = useRoute();
const slug = computed(() => String(route.params.slug ?? ""));

type Payload = PublicPage | { error: string; message: string };

const { data, error } = await useFetch<Payload>(
  () => `/api/catalog/${props.kind}/${encodeURIComponent(slug.value)}`,
);
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
</script>

<template>
  <PageView :page="page" />
</template>
