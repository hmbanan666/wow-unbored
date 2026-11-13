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
      <p class="detail-meta">{{ recipe.category.name }}</p>
      <p v-if="!recipe.teachingItemNames.length">No formula item</p>
      <RecipeFormula
        v-if="recipe.teachingItemNames.length"
        :items="recipe.teachingItemNames"
        binding
      />
      <RecipePersonal v-if="inline && overlay" :overlay="overlay" />
      <h2 v-if="inline">Base difficulty</h2>
      <p v-if="!inline && recipe.known === true" class="known-message">
        You know this. Grey at {{ recipe.thresholds.grey }}.
      </p>
      <p v-else-if="!inline && recipe.known === null">
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
      <dl v-if="inline" class="thresholds">
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
      <h3>Reagents</h3>
      <ul v-if="recipe.reagents.length">
        <li v-for="reagent in recipe.reagents" :key="reagent.itemId">
          {{ reagent.count }}× {{ reagent.name || "Reagent name unavailable" }}
        </li>
      </ul>
      <p v-else>No reagents listed.</p>
      <template v-if="recipe.sources.length">
        <h3>Seen in the game</h3>
        <ul>
          <li v-for="(source, index) in recipe.sources" :key="index">
            {{ source.npcName }} · {{ source.zone
            }}<template v-if="source.x !== null && source.y !== null">
              ({{ source.x }}, {{ source.y }})</template
            >
            <template v-if="source.cost !== null"> · {{ source.cost }} copper</template>
            <span class="detail-meta">
              ·
              {{
                source.kind === "trainer"
                  ? "Trainer"
                  : source.limited
                    ? "Vendor, limited supply"
                    : "Vendor"
              }}</span
            >
          </li>
        </ul>
        <p class="detail-meta">Past sightings, not live availability.</p>
      </template>
      <p v-else>No trainer or vendor sightings yet.</p>
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
  margin-block: 1.5rem;
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
