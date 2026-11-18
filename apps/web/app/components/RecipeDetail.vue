<script setup lang="ts">
import type { PublicRecipe, Game } from "#shared/public-professions";
defineProps<{ recipe: PublicRecipe; game: Game }>();
</script>
<template>
  <section class="recipe-inline">
    <div class="field-columns">
      <section class="materials">
        <h2>Materials</h2>
        <ul v-if="recipe.reagents.length" class="shopping-list">
          <li v-for="r in recipe.reagents" :key="r.itemId">
            <span>{{ r.name || "Unnamed material" }}</span
            ><strong>× {{ r.count }}</strong>
          </li>
        </ul>
        <p v-else>No materials are listed.</p>
        <p v-if="recipe.craftedItemNames.length" class="output">
          Makes
          <strong>{{
            recipe.craftedItemNames.map((r) => r.name || "an unnamed item").join(", ")
          }}</strong>
        </p>
      </section>
      <section class="learning">
        <h2>Where to learn it</h2>
        <RecipeFormula
          v-if="recipe.teachingItemNames.length"
          :items="recipe.teachingItemNames"
          binding
        />
        <RecipeSources :sources="recipe.sources" />
      </section>
    </div>

    <h2>Skill and difficulty</h2>
    <p>Required skill: {{ recipe.difficulty.requiredSkill ?? "unconfirmed" }}</p>
    <dl class="thresholds">
      <div>
        <dt>Orange</dt>
        <dd>{{ game === "forever" ? "from required skill" : recipe.thresholds.orange }}</dd>
      </div>
      <div>
        <dt>Yellow</dt>
        <dd>{{ recipe.thresholds.yellow }}</dd>
      </div>
      <div>
        <dt>Green</dt>
        <dd>{{ recipe.thresholds.green }}</dd>
      </div>
      <div>
        <dt>Grey</dt>
        <dd>{{ recipe.thresholds.grey }}</dd>
      </div>
    </dl>
    <details class="base-difficulty">
      <summary>Base difficulty · {{ recipe.difficulty.label }}</summary>
      <ul>
        <li v-for="reason in recipe.difficulty.reasons" :key="reason">{{ reason }}</li>
      </ul>
    </details>
  </section>
</template>
<style scoped>
.recipe-inline {
  overflow-wrap: anywhere;
  width: 100%;
  max-width: none;
  max-height: none;
  margin-block: var(--space-4) var(--space-6);
  padding: 0;
  border: 0;
  background: none;
  box-shadow: none;
  font-family: inherit;
  font-size: var(--text-base);
}
h2 {
  color: var(--lamp-gold-light);
  font-size: var(--text-xl);
}
p,
ul {
  margin-top: var(--space-3);
}
.field-columns {
  display: grid;
  gap: var(--space-5);
  border-block: 1px solid var(--lamp-line);
  padding-block: var(--space-4);
  margin-bottom: var(--space-5);
}
.field-columns h2 {
  margin-bottom: var(--space-3);
  padding: 0;
}
.shopping-list {
  padding: 0;
  list-style: none;
}
.shopping-list li {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--lamp-line-soft);
}
.shopping-list strong {
  color: var(--lamp-gold-light);
  white-space: nowrap;
}
.output strong {
  margin-left: var(--space-1);
}
.base-difficulty {
  margin-top: var(--space-4);
}
.base-difficulty summary {
  min-height: var(--tap);
  align-content: center;
  cursor: pointer;
}
@media (min-width: 640px) {
  .field-columns {
    grid-template-columns: 1fr 1fr;
    gap: var(--space-6);
  }
  .learning {
    padding-left: var(--space-5);
    border-left: 1px solid var(--lamp-line-soft);
  }
}
.thresholds {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 2rem;
  margin-top: 1.5rem;
}
.thresholds dt {
  color: var(--lamp-muted);
}
.thresholds dd {
  margin: 0.25rem 0;
}
</style>
