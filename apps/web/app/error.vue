<script setup lang="ts">
import { CHARACTER_COPY } from "#shared/character-page";
import type { NuxtError } from "#app";

import { PRIVACY_URL, PUBLIC_COPY, REPO_URL, SITE_NAV } from "#shared/catalog";
import { SIGN_IN_COPY } from "#shared/sign-in";

const props = defineProps<{ error: NuxtError }>();
const known = new Set<string>([
  ...Object.values(PUBLIC_COPY),
  CHARACTER_COPY.en.notFound,
  ...Object.values(SIGN_IN_COPY.en),
]);
const line = computed(() => {
  const message = String(props.error.statusMessage || props.error.message || "");
  return known.has(message) ? message : PUBLIC_COPY.notFound;
});

useSeoMeta({
  robots: "noindex",
  title: () => line.value,
  ogTitle: () => line.value,
});
</script>

<template>
  <div class="site">
    <DsNav :links="SITE_NAV" />
    <DsPage>
      <DsEmptyState :level="1" :title="line">
        <DsButton to="/">Back home</DsButton>
        <DsButton to="/collections" variant="secondary">Collections</DsButton>
      </DsEmptyState>
    </DsPage>
    <DsFooter :links="SITE_NAV" :privacy="PRIVACY_URL" :source="REPO_URL" />
  </div>
</template>
