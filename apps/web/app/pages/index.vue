<script setup lang="ts">
import { pageMessage, PUBLIC_COPY, type PublicPage } from "#shared/catalog";

type Payload = PublicPage | { error: string; message: string };

const { data, error } = await useFetch<Payload>("/api/home");
const page = data.value && "headline" in data.value ? data.value : null;
if (!page) {
  throw createError({
    statusCode: 503,
    statusMessage: pageMessage(data.value, error.value, PUBLIC_COPY.unavailable),
    fatal: true,
  });
}
</script>

<template>
  <PageView :page="page" />
</template>
