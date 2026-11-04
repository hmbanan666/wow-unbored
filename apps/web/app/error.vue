<script setup lang="ts">
import type { NuxtError } from "#app";

import { PUBLIC_COPY } from "#shared/catalog";

const props = defineProps<{ error: NuxtError }>();
const known = new Set<string>(Object.values(PUBLIC_COPY));
const line = computed(() => {
  const message = String(props.error.statusMessage || props.error.message || "");
  return known.has(message) ? message : PUBLIC_COPY.notFound;
});

useSeoMeta({
  title: () => line.value,
  ogTitle: () => line.value,
});
</script>

<template>
  <div class="site">
    <header class="site-header">
      <NuxtLink class="wordmark" to="/">Unbored</NuxtLink>
    </header>
    <main class="page">
      <h1>{{ line }}</h1>
      <p>
        <NuxtLink to="/">Back home</NuxtLink>
      </p>
    </main>
  </div>
</template>
