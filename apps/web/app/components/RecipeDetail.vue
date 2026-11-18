<script setup lang="ts">
import type { AlbumRecipe } from "@unbored/contracts/profession-progress";
import type { PublicRecipe, SingleRecipeOverlay, Game } from "#shared/public-professions";
const props = defineProps<{
  recipe: AlbumRecipe | PublicRecipe | null;
  inline?: boolean;
  game?: Game;
  overlay?: SingleRecipeOverlay | null;
}>();
const crafted = computed(() =>
  props.recipe && "craftedItemNames" in props.recipe ? props.recipe.craftedItemNames : [],
);
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
const title = useId();
let opener: HTMLElement | null = null;
function open(trigger: HTMLElement) {
  opener = trigger;
  dialog.value?.showModal();
}
function closed() {
  emit("close");
  opener?.focus();
}
function trapTab(event: KeyboardEvent) {
  event.preventDefault();
  dialog.value?.querySelector("button")?.focus();
}
defineExpose({ open });
</script>
<template>
  <component
    :is="inline ? 'section' : 'dialog'"
    ref="dialog"
    class="recipe-detail"
    :class="{ 'recipe-inline': inline }"
    :aria-labelledby="inline ? undefined : title"
    @close="closed"
    @keydown.tab="!inline && trapTab($event)"
  >
    <template v-if="recipe">
      <button
        v-if="!inline"
        class="close-detail"
        type="button"
        aria-label="Close recipe details"
        autofocus
        @click="dialog?.close()"
      >
        ×
      </button>
      <h2 v-if="!inline" :id="title">{{ recipe.name || "Recipe name unavailable" }}</h2>
      <div v-if="inline" class="field-columns">
        <section class="materials">
          <h2>Materials</h2>
          <ul v-if="recipe.reagents.length" class="shopping-list">
            <li v-for="r in recipe.reagents" :key="r.itemId">
              <span>{{ r.name || "Unnamed material" }}</span
              ><strong>× {{ r.count }}</strong>
            </li>
          </ul>
          <p v-else>No materials are listed.</p>
          <p v-if="crafted.length" class="output">
            Makes <strong>{{ crafted.map((r) => r.name || "an unnamed item").join(", ") }}</strong>
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
      <template v-if="inline">
        <RecipePersonal v-if="overlay" :overlay="overlay" />
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
      </template>
      <template v-else>
        <p class="detail-meta">{{ recipe.category.name }}</p>
        <p v-if="!recipe.teachingItemNames.length">No formula item</p>
        <RecipeFormula
          v-if="recipe.teachingItemNames.length"
          :items="recipe.teachingItemNames"
          binding
        />
        <p v-if="recipe.known === true" class="known-message">
          You know this. Grey at {{ recipe.thresholds.grey }}.
        </p>
        <p v-else-if="recipe.known === null">
          Open this profession in the game to check what you know.
        </p>
        <template v-else>
          <RecipeDifficultyBadge :label="recipe.difficulty.label" />
          <ul>
            <li v-for="reason in recipe.difficulty.reasons" :key="reason">{{ reason }}</li>
          </ul>
        </template>
        <p>Required skill: {{ recipe.difficulty.requiredSkill ?? "unknown until seen" }}</p>
        <p v-if="crafted.length">
          Creates: {{ crafted.map((r) => r.name || "Item name unavailable").join(", ") }}
        </p>
        <h3>Reagents</h3>
        <ul v-if="recipe.reagents.length">
          <li v-for="reagent in recipe.reagents" :key="reagent.itemId">
            {{ reagent.count }}× {{ reagent.name || "Reagent name unavailable" }}
          </li>
        </ul>
        <p v-else>No reagents listed.</p>
        <RecipeSources :sources="recipe.sources" />
      </template>
    </template>
  </component>
</template>
<style scoped>
.recipe-detail {
  position: fixed;
  inset: auto var(--space-5) var(--space-5) auto;
  margin: 0;
  width: 380px;
  max-width: calc(100vw - 48px);
  max-height: calc(100dvh - 48px);
  overflow: auto;
  overscroll-behavior: contain;
  padding: var(--space-5);
  border: 1px solid var(--lamp-gold);
  border-radius: var(--radius-lg);
  background: var(--lamp-bg);
  color: var(--lamp-text);
  box-shadow: var(--shadow-card);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}
.recipe-detail::backdrop {
  background: rgb(20 13 10 / 0.4);
}
h2 {
  color: var(--lamp-gold-light);
  font-size: var(--text-xl);
  padding-right: var(--space-6);
}
h3 {
  font-size: var(--text-base);
  margin-top: var(--space-4);
}
p,
ul,
.difficulty-badge {
  margin-top: var(--space-3);
}
ul {
  padding-left: var(--space-5);
}
.detail-meta {
  color: var(--lamp-muted);
}
.close-detail {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  min-width: var(--tap);
  min-height: var(--tap);
  background: none;
  border: 0;
  color: var(--lamp-muted);
  font-size: var(--text-xl);
  cursor: pointer;
}
.known-message {
  color: var(--lamp-gold-light);
}
@media (max-width: 639px) {
  .recipe-detail {
    inset: auto 0 0;
    width: 100%;
    max-width: 100%;
    max-height: 85dvh;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    padding-bottom: max(var(--space-5), env(safe-area-inset-bottom));
  }
}
</style>

<style scoped>
.recipe-inline {
  position: static;
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
