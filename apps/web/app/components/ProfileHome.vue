<script setup lang="ts">
import { characterHref, type CharacterProfessions } from "#shared/character-page";
defineProps<{ character: CharacterProfessions }>();
</script>

<template>
  <section class="professions">
    <h2>{{ character.name }}’s professions</h2>
    <ul v-if="character.professions.length">
      <li v-for="p in character.professions" :key="p.href">
        <NuxtLink :to="p.href">
          <span>{{ p.name }}</span>
          <small>{{
            p.known === null
              ? "Recipes unchecked"
              : `${p.known} recipe${p.known === 1 ? "" : "s"} known`
          }}</small>
          <span aria-hidden="true">→</span>
        </NuxtLink>
      </li>
    </ul>
    <p v-else>Open a profession window in the game once to see your recipes here.</p>
    <NuxtLink class="history" :to="`${characterHref(character)}/history`"
      >Character history</NuxtLink
    >
  </section>
</template>

<style scoped>
.professions {
  margin-block: var(--space-5);
}
h2 {
  color: var(--lamp-gold-light);
  font-size: var(--text-xl);
  overflow-wrap: anywhere;
}
ul {
  list-style: none;
  padding: 0;
  margin-block: var(--space-3);
}
li {
  border-bottom: 1px solid var(--lamp-line-soft);
}
li a {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: baseline;
  gap: var(--space-2);
  min-height: var(--tap);
  padding-block: var(--space-3);
  text-decoration: none;
}
li a:hover span:first-child {
  text-decoration: underline;
}
small,
.history {
  font: 500 var(--text-sm)/1.4 var(--font-ui);
  color: var(--lamp-muted);
}
.history {
  display: inline-block;
  padding-block: var(--space-2);
}
</style>
