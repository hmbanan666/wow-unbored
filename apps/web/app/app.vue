<script setup lang="ts">
import { PRIVACY_URL, REPO_URL, SITE_NAV } from "#shared/catalog";
</script>

<template>
  <div class="site">
    <DsNav :links="SITE_NAV" />
    <NuxtPage />
    <DsFooter :privacy="PRIVACY_URL" :source="REPO_URL"
      ><CharacterPicker v-if="$route.path !== '/my'" /><NuxtLink v-else to="/my#settings"
        >Settings</NuxtLink
      ></DsFooter
    >
  </div>
</template>
