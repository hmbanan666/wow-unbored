<script setup lang="ts">
import { PRIVACY_URL, REPO_URL, SITE_NAV } from "#shared/catalog";
</script>

<template>
  <div class="site">
    <DsNav :links="SITE_NAV" />
    <NuxtPage />
    <DsFooter :links="SITE_NAV" :privacy="PRIVACY_URL" :source="REPO_URL" />
  </div>
</template>
