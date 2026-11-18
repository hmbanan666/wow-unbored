<script setup lang="ts">
import { gameName, type Game } from "#shared/public-professions";
import type { GuideLink } from "#shared/guide-references";
defineProps<{
  game: Game;
  signedIn: boolean;
  otherGame: boolean;
  status: string;
  fact?: string;
  action?: GuideLink;
}>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <aside class="character-check" aria-label="Check my character">
    <p v-if="fact" aria-live="polite">
      {{ fact }} <a v-if="action" :href="action.href">{{ action.title }}</a>
    </p>
    <p v-else-if="status === 'error'">
      Couldn’t check your recipes. <button @click="$emit('retry')">Try again</button>
    </p>
    <p v-else-if="status === 'loading'" role="status">Checking your recipes…</p>
    <p v-else-if="signedIn">
      <a href="#check-character">Pick a {{ otherGame ? gameName(game) + " " : "" }}character</a>
      to check your recipes.
    </p>
    <details v-else>
      <summary>Check my character</summary>
      <p>
        <a href="/install">Install Bory</a> and open your profession in the game.<br />
        <a href="/install#sign-in">Sign in from the Companion</a> to see which recipes you know.
      </p>
    </details>
  </aside>
</template>

<style scoped>
.character-check {
  min-height: 2.8em;
  margin-block: var(--space-2);
  color: var(--lamp-muted);
  font: 500 var(--text-sm)/1.4 var(--font-ui);
  overflow-wrap: anywhere;
}
p {
  margin: 0;
}
summary,
button,
a {
  color: var(--lamp-gold-light);
  text-underline-offset: 0.2em;
}
summary {
  cursor: pointer;
  width: fit-content;
}
button {
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
}
details p {
  margin-block: var(--space-2);
}
@media (max-width: 599px) {
  .character-check {
    min-height: 4.2em;
  }
}
</style>
