<script setup lang="ts">
import { TELEGRAM_URL } from "#shared/catalog";
defineProps<{
  privacy: string;
  source: string;
}>();
</script>

<template>
  <footer class="ds-footer">
    <DsContainer width="wide">
      <nav class="ds-footer__links" aria-label="Footer">
        <NuxtLink to="/install">Get Bory</NuxtLink>
        <NuxtLink to="/my">My page</NuxtLink>
        <NuxtLink to="/forever/feed">Community feed</NuxtLink>
        <NuxtLink to="/about">About</NuxtLink>
        <a :href="TELEGRAM_URL" rel="noopener">Telegram</a>
        <a :href="source" rel="noopener">Source on GitHub</a>
      </nav>
      <div id="check-character"><slot /></div>
      <p class="ds-footer__privacy">
        Bory only learns about your own characters.
        <a :href="privacy" rel="noopener">Privacy</a>
      </p>
      <p class="ds-meta">
        World of Warcraft and Blizzard Entertainment are trademarks or registered trademarks of
        Blizzard Entertainment, Inc. Game icons and renders come from the Blizzard Game Data API.
        Unbored is a fan project, not affiliated with Blizzard.
      </p>
    </DsContainer>
  </footer>
</template>

<style scoped>
.ds-footer {
  margin-top: auto;
  padding: var(--space-6) 0 var(--space-6);
  border-top: 1px solid transparent;
  border-image: linear-gradient(90deg, transparent, var(--lamp-line), transparent) 1;
  color: var(--lamp-muted);
}

.ds-footer__links {
  display: flex;
  flex-wrap: wrap;
  column-gap: var(--space-5);
  margin-bottom: var(--space-3);
}

.ds-footer__links a {
  display: inline-flex;
  align-items: center;
  min-height: var(--tap);
  min-width: var(--tap);
  color: var(--lamp-muted);
  font-family: var(--font-ui);
  text-decoration: none;
}

.ds-footer__links a:hover,
.ds-footer__privacy a:hover {
  color: var(--lamp-gold-light);
}

.ds-footer__privacy {
  margin-bottom: var(--space-3);
}

.ds-footer__privacy a {
  color: var(--lamp-gold);
}
</style>
