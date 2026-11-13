<script setup lang="ts">
import { useSelectedCharacter } from "../composables/useSelectedCharacter";
import { characterKey } from "#shared/selected-character";
import { gameName } from "#shared/public-professions";
const { state, choose, refresh } = useSelectedCharacter();
const id = useId();
</script>
<template>
  <div class="character-picker">
    <template v-if="state.status === 'ready' && state.signedIn">
      <label :for="id">Character</label>
      <select
        v-if="state.characters.length"
        :id="id"
        :value="state.selected"
        @change="choose(($event.target as HTMLSelectElement).value)"
      >
        <option value="">Pick a character</option>
        <optgroup
          v-for="game in ['forever', 'retail'] as const"
          :key="game"
          :label="gameName(game)"
        >
          <option
            v-for="c in state.characters.filter((c) => c.game === game)"
            :key="characterKey(c)"
            :value="characterKey(c)"
          >
            {{ c.name }} · {{ c.level ?? "?" }} {{ c.class?.replaceAll("_", " ") || "" }} ·
            {{ c.realm }}
          </option>
        </optgroup>
      </select>
      <NuxtLink v-else to="/install#sign-in"
        >Open the Companion to bring your characters here</NuxtLink
      >
    </template>
    <button v-else-if="state.status === 'error'" type="button" @click="refresh">
      Characters unavailable. Try again
    </button>
    <span v-else-if="state.status === 'loading'" role="status">Checking characters…</span>
    <NuxtLink v-else to="/install#sign-in">Sign in from the Companion</NuxtLink>
  </div>
</template>
<style scoped>
.character-picker {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  max-width: 100%;
  font: 500 var(--text-sm)/1.3 var(--font-ui);
}
select,
button {
  min-height: var(--tap);
  min-width: 0;
  max-width: 100%;
  width: 15rem;
  padding: 0.5rem;
  border: 1px solid var(--lamp-line);
  border-radius: var(--radius-md);
  background: var(--lamp-bg);
  color: var(--lamp-text);
  font: inherit;
}
a {
  color: var(--lamp-muted);
  display: inline-flex;
  align-items: center;
  min-height: var(--tap);
}
</style>
