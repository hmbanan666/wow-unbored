<script setup lang="ts">
import { PRIVACY_URL, REPO_URL, SITE_NAV } from "#shared/catalog";
</script>

<template>
  <footer class="site-footer">
    <nav class="footer-nav" aria-label="Footer">
      <NuxtLink v-for="link in SITE_NAV" :key="link.to" :to="link.to">{{ link.label }}</NuxtLink>
      <a :href="REPO_URL" rel="noopener">Source on GitHub</a>
    </nav>
    <p>
      Bory only learns about your own characters.
      <a :href="PRIVACY_URL" rel="noopener">What he knows</a>
    </p>
    <p class="meta">
      Unbored is a fan-made addon, not affiliated with Blizzard Entertainment. World of Warcraft is
      a trademark of Blizzard Entertainment.
    </p>
  </footer>
</template>
