<script setup lang="ts">
import { SITE_NAV } from "#shared/catalog";

const route = useRoute();
function current(to: string): boolean {
  return route.path === to || route.path.startsWith(`${to}/`);
}
</script>

<template>
  <header class="site-header">
    <NuxtLink class="wordmark" to="/">Unbored</NuxtLink>
    <nav class="site-nav" aria-label="Main">
      <NuxtLink
        v-for="link in SITE_NAV"
        :key="link.to"
        :to="link.to"
        :aria-current="current(link.to) ? 'page' : undefined"
        >{{ link.label }}</NuxtLink
      >
    </nav>
  </header>
</template>
