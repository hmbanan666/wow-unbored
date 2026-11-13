<script setup lang="ts">
import type { AlbumRecipe } from "@unbored/contracts/profession-progress";
defineProps<{ recipe: AlbumRecipe | null }>();
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
defineExpose({ open });
</script>
<template>
  <dialog
    ref="dialog"
    class="recipe-detail"
    :aria-labelledby="title"
    @close="closed"
    @keydown.tab.prevent="dialog?.querySelector('button')?.focus()"
  >
    <template v-if="recipe">
      <button
        class="close-detail"
        type="button"
        aria-label="Close recipe details"
        autofocus
        @click="dialog?.close()"
      >
        ×
      </button>
      <h2 :id="title">{{ recipe.name || "Recipe name unavailable" }}</h2>
      <p class="detail-meta">{{ recipe.category.name }}</p>
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
    </template>
  </dialog>
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
