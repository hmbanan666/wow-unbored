<script setup lang="ts">
import type { SingleRecipeOverlay } from "#shared/public-professions";
defineProps<{ overlay: SingleRecipeOverlay }>();
</script>
<template>
  <aside class="recipe-personal" aria-label="Your recipe">
    <h2>
      {{ overlay.character.name }}
      {{
        overlay.known === true
          ? "knows this"
          : overlay.known === false
            ? "is missing this"
            : "has not checked this yet"
      }}
    </h2>
    <p>
      Skill: {{ overlay.skill ?? "not seen"
      }}<template v-if="overlay.max !== null"> / {{ overlay.max }}</template>
    </p>
    <template v-if="overlay.known !== true">
      <RecipeDifficultyBadge :label="overlay.difficulty.label" />
      <ul>
        <li v-for="reason in overlay.difficulty.reasons" :key="reason">{{ reason }}</li>
      </ul>
      <p v-if="overlay.known === null">
        Open this profession in the game once to check your recipes.
      </p>
      <p v-else-if="overlay.difficulty.canGetNow">
        Can get now ·
        {{
          overlay.difficulty.source === "tradable_formula"
            ? "Look for the formula at the auction house or ask a friend."
            : "Visit one of the observed sources below."
        }}
      </p>
      <p
        v-else-if="
          overlay.difficulty.requiredSkill !== null &&
          (overlay.skill === null || overlay.difficulty.requiredSkill > overlay.skill)
        "
      >
        Raise your profession skill to {{ overlay.difficulty.requiredSkill }} first.
      </p>
      <p v-else>Open a trainer or recipe vendor in the game to help find a source.</p>
    </template>
    <p v-else>Ready for your next craft. Check the reagents below.</p>
  </aside>
</template>
<style scoped>
.recipe-personal {
  margin-block: 1rem 2rem;
  padding: 1rem;
  border: 1px solid var(--lamp-line);
  border-radius: var(--radius-md);
  background: var(--lamp-glow);
}
h2 {
  color: var(--lamp-gold-light);
  font-size: var(--text-xl);
}
p,
ul {
  margin-top: 0.75rem;
}
ul {
  padding-left: 1.25rem;
}
</style>
