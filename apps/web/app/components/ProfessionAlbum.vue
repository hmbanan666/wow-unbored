<script setup lang="ts">
import type { AlbumRecipe, Profession } from "@unbored/contracts/profession-progress";
import { CHARACTER_COPY } from "#shared/character-page";
import {
  ALBUM_FILTERS,
  albumCategories,
  easiestMissing,
  matchesAlbumFilter,
  professionName,
  recipeLabel,
  recipeMonogram,
} from "#shared/profession-album";
const props = defineProps<{ profession: Profession; filter: string; game: "retail" | "forever" }>();
const emit = defineEmits<{ filter: [value: string] }>();
const recipes = computed(() => props.profession.album);
const name = computed(() => professionName(props.profession));
const categories = computed(() => albumCategories(recipes.value));
const zones = computed(() =>
  [...new Set(recipes.value.flatMap((r) => r.sources.map((s) => s.zone)))].sort((a, b) =>
    a.localeCompare(b, "en"),
  ),
);
const missing = computed(() => easiestMissing(recipes.value, props.filter));
const showAll = ref(false);
watch(
  () => [props.filter, props.profession],
  () => {
    showAll.value = false;
  },
);
const visibleMissing = computed(() => (showAll.value ? missing.value : missing.value.slice(0, 12)));
const known = computed(() => recipes.value.filter((r) => r.known === true).length);
const now = computed(
  () => recipes.value.filter((r) => r.known === false && r.difficulty.canGetNow).length,
);
const labels = ["easy", "medium", "hard"] as const;
// Classic ranks are fixed caps. Retail expansion ranks are not inferred from their caps.
const rank = computed(() =>
  props.game === "forever"
    ? ({ 75: "Apprentice", 150: "Journeyman", 225: "Expert", 300: "Artisan" }[
        props.profession.max ?? 0
      ] ?? null)
    : null,
);
const selected = ref<AlbumRecipe | null>(null);
const detail = ref<{ open: (trigger: HTMLElement) => void }>();
const zoneId = useId();
async function open(recipe: AlbumRecipe, event: MouseEvent) {
  const trigger = event.currentTarget as HTMLElement;
  selected.value = recipe;
  await nextTick();
  detail.value?.open(trigger);
}
</script>
<template>
  <div class="profession-album">
    <!-- Today has its own future section before this component. -->
    <DsEmptyState
      v-if="profession.total === null"
      title="More recipes to come"
      :text="CHARACTER_COPY.en.catalogEmpty"
    />
    <DsEmptyState
      v-else-if="profession.known === null"
      :title="`${name} is waiting for you`"
      :text="`Open your ${name} window in the game once, then this fills in`"
    />
    <template v-else>
      <div class="album-layout">
        <section class="album-card summary-card" aria-label="Collection progress">
          <div
            class="collection-ring"
            :style="{ '--progress': `${(known / (profession.total || 1)) * 100}%` }"
          >
            <div>
              <strong>{{ known }}</strong
              ><span>of {{ profession.total }} recipes</span>
            </div>
          </div>
          <div class="album-stats">
            <div>
              <strong
                >{{ profession.skill ?? "Not seen"
                }}<small v-if="profession.max !== null"> / {{ profession.max }}</small></strong
              ><span
                >skill<template v-if="rank"> · {{ rank }}</template></span
              >
            </div>
            <div>
              <strong>{{ now }}</strong
              ><span>you can get now</span>
            </div>
          </div>
          <div class="difficulty-bar" aria-hidden="true">
            <i
              v-for="label in labels"
              :key="label"
              :class="label"
              :style="{ flex: profession.difficultyCounts[label] }"
            />
            <i class="known" :style="{ flex: known }" />
          </div>
          <div class="difficulty-legend">
            <span v-for="label in labels" :key="label"
              ><i :class="label" />{{ label }} <b>{{ profession.difficultyCounts[label] }}</b></span
            >
          </div>
          <p class="album-note">
            Difficulty reflects sources, skill and reagents. Each trainer or vendor you open in the
            game makes the list sharper for everyone.
          </p>
          <p v-if="!zones.length" class="album-note">
            No trainer or vendor sightings yet. Zones appear after the first sighting.
          </p>
          <p v-if="profession.uncatalogued" class="album-note">
            {{ profession.uncatalogued }} more known recipes are not in this collection yet.
          </p>
        </section>
        <section class="album-card collection-card" aria-label="Recipe album">
          <div class="album-filters" role="group" aria-label="Recipe filters">
            <button
              v-for="option in ALBUM_FILTERS"
              :key="option.id"
              type="button"
              class="filter-chip"
              :aria-pressed="filter === option.id"
              @click="emit('filter', option.id)"
            >
              {{ option.label }}
            </button>
            <span v-if="!zones.length" class="disabled-zone">
              <button
                type="button"
                class="filter-chip"
                disabled
                title="Zones appear after the first trainer or vendor sighting"
                data-zone-disabled
                :aria-describedby="zoneId"
              >
                Zone
              </button>
              <DsTooltip
                ><span class="zone-help" aria-label="Why zones are unavailable">?</span
                ><template #panel
                  ><span :id="zoneId"
                    >Zones appear after the first trainer or vendor sighting</span
                  ></template
                ></DsTooltip
              >
            </span>
            <label v-else class="zone-filter"
              >Zone
              <select
                aria-label="Zone"
                :value="filter.startsWith('zone:') ? filter : ''"
                @change="emit('filter', ($event.target as HTMLSelectElement).value || 'all')"
              >
                <option value="">All zones</option>
                <option v-for="zone in zones" :key="zone" :value="`zone:${zone}`">
                  {{ zone }}
                </option>
              </select>
            </label>
          </div>
          <div class="album-categories">
            <section v-for="category in categories" :key="category.id" class="album-category">
              <h2>
                <span>{{ category.name }}</span
                ><span>{{ category.known }} / {{ category.recipes.length }}</span>
              </h2>
              <div class="recipe-slots">
                <button
                  v-for="recipe in category.recipes"
                  :key="recipe.spellId"
                  type="button"
                  class="recipe-slot"
                  :class="{
                    'is-known': recipe.known,
                    'is-dimmed': !matchesAlbumFilter(recipe, filter),
                  }"
                  :aria-label="recipeLabel(recipe)"
                  :title="recipe.name || 'Recipe name unavailable'"
                  aria-haspopup="dialog"
                  @click="open(recipe, $event)"
                >
                  <span v-if="recipe.known">{{ recipeMonogram(recipe.name) }}</span>
                  <i
                    v-else-if="recipe.known === false"
                    :class="['difficulty-dot', recipe.difficulty.label]"
                    aria-hidden="true"
                  />
                  <span v-else aria-hidden="true">?</span>
                </button>
              </div>
            </section>
          </div>
        </section>
      </div>
      <section class="missing-section" aria-labelledby="missing-title">
        <div class="missing-heading">
          <h2 id="missing-title">Missing, easiest first</h2>
          <p aria-live="polite">
            {{ missing.length }} recipes · showing {{ visibleMissing.length }}
          </p>
        </div>
        <p v-if="!missing.length" class="album-note">
          {{
            recipes.some((r) => r.known === false)
              ? "No missing recipes match this filter. Try All to see the collection."
              : recipes.some((r) => r.known === null)
                ? "Open each profession tier in the game to fill in the rest."
                : "You know every recipe in this collection."
          }}
        </p>
        <div class="missing-list">
          <button
            v-for="recipe in visibleMissing"
            :key="recipe.spellId"
            type="button"
            class="missing-recipe"
            aria-haspopup="dialog"
            @click="open(recipe, $event)"
          >
            <RecipeDifficultyBadge :label="recipe.difficulty.label" />
            <span class="missing-description"
              ><strong>{{ recipe.name || "Recipe name unavailable" }}</strong
              ><span>{{ recipe.difficulty.reasons.join(" · ") }}</span></span
            >
            <RecipeFormula
              v-if="recipe.teachingItemNames.length"
              :items="recipe.teachingItemNames"
            /><span v-else class="formula-empty">No formula item</span>
          </button>
        </div>
        <DsButton v-if="missing.length > 12 && !showAll" variant="secondary" @click="showAll = true"
          >Show all {{ missing.length }}</DsButton
        >
      </section>
    </template>
    <section
      v-if="profession.routes?.length"
      class="album-card skill-plans"
      aria-label="Profession skill Plans"
    >
      <ProfessionRoute
        v-for="entry in profession.routes"
        :key="entry.route.skillLine"
        :route="entry.route"
        :name="entry.name"
      />
    </section>
    <RecipeDetail ref="detail" :recipe="selected" @close="selected = null" />
  </div>
</template>
<style scoped>
.profession-album {
  padding-top: var(--space-5);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
  --album-easy: #7fb069;
  --album-hard: #c8553d;
}
.album-layout {
  display: grid;
  gap: var(--space-4);
  align-items: start;
}
.album-card {
  min-width: 0;
  padding: var(--space-4);
  border: 1px solid var(--lamp-line-soft);
  border-radius: var(--radius-lg);
  background: var(--lamp-glow);
}
.summary-card {
  height: 100%;
}
.collection-ring {
  width: 150px;
  height: 150px;
  margin: var(--space-1) auto var(--space-4);
  border-radius: 50%;
  background: conic-gradient(var(--lamp-gold) var(--progress), rgb(234 219 192 / 0.09) 0);
  display: grid;
  place-items: center;
}
.collection-ring > div {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: var(--lamp-glow);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: var(--space-3);
}
.collection-ring strong {
  color: var(--lamp-gold-light);
  font-size: 2rem;
  line-height: 1;
}
.collection-ring span {
  color: var(--lamp-muted);
  font-size: var(--text-xs);
}
.album-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}
.album-stats > div {
  padding: var(--space-2);
  background: rgb(0 0 0 / 0.14);
  border-radius: var(--radius-md);
}
.album-stats strong {
  display: block;
  font-size: var(--text-xl);
}
.album-stats span,
.album-stats small {
  font-size: var(--text-xs);
  color: var(--lamp-muted);
}
.difficulty-bar {
  display: flex;
  height: 12px;
  margin: var(--space-3) 0 var(--space-2);
  border-radius: var(--radius-pill);
  overflow: hidden;
}
.difficulty-bar .known {
  background: var(--lamp-gold);
  opacity: 0.35;
}
.difficulty-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  color: var(--lamp-muted);
  font-size: var(--text-xs);
}
.difficulty-legend i {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  margin-right: var(--space-1);
}
.easy {
  background: var(--album-easy);
}
.medium {
  background: var(--lamp-gold);
}
.hard {
  background: var(--album-hard);
}
.album-note {
  color: var(--lamp-muted);
  font-size: var(--text-sm);
  margin-top: var(--space-3);
}
.album-filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-5);
}
.filter-chip,
select {
  min-height: var(--tap);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--lamp-line-soft);
  border-radius: var(--radius-pill);
  background: rgb(0 0 0 / 0.14);
  color: var(--lamp-text);
  font: inherit;
  cursor: pointer;
}
.filter-chip[aria-pressed="true"] {
  background: var(--lamp-burgundy);
  border-color: var(--lamp-burgundy);
  color: var(--lamp-gold-light);
}
.filter-chip:disabled {
  color: var(--lamp-faint);
  cursor: default;
}
.disabled-zone {
  display: inline-flex;
  gap: var(--space-1);
  align-items: center;
}
.zone-help {
  display: grid;
  place-items: center;
  width: var(--tap);
  height: var(--tap);
  color: var(--lamp-muted);
}
.zone-filter {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  max-width: 100%;
}
select {
  max-width: 100%;
}
.album-categories {
  display: grid;
  gap: var(--space-5);
}
.album-category {
  min-width: 0;
}
.album-category h2 {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  color: var(--lamp-muted);
  font: 700 var(--text-sm)/1.3 var(--font-ui);
}
.album-category h2 span:last-child {
  white-space: nowrap;
}
.recipe-slots {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
  gap: 6px;
}
.recipe-slot {
  position: relative;
  min-width: 44px;
  min-height: 44px;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border: 1px dashed #5a4636;
  border-radius: 10px;
  background: rgb(0 0 0 / 0.16);
  color: var(--lamp-faint);
  font: 700 var(--text-xs)/1 var(--font-ui);
  cursor: pointer;
}
.recipe-slot.is-known {
  background: radial-gradient(circle at 30% 25%, rgb(245 210 122 / 0.34), rgb(122 34 48 / 0.4) 70%);
  border: 1px solid var(--lamp-gold);
  color: var(--lamp-gold-light);
  box-shadow: 0 0 12px rgb(232 176 74 / 0.15);
}
.recipe-slot.is-dimmed {
  opacity: 0.22;
}
.recipe-slot:focus-visible {
  opacity: 1;
  outline: 2px solid var(--lamp-gold-light);
  outline-offset: 2px;
}
.recipe-slot:hover {
  border-color: var(--lamp-gold);
}
.difficulty-dot {
  position: absolute;
  bottom: 5px;
  right: 5px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.missing-section,
.skill-plans {
  margin-top: var(--space-6);
}
.missing-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}
.missing-heading h2 {
  color: var(--lamp-gold-light);
  font-size: var(--text-xl);
}
.missing-heading p {
  color: var(--lamp-muted);
  font-size: var(--text-xs);
}
.missing-list {
  display: grid;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}
.missing-recipe {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-3);
  min-height: var(--tap);
  text-align: left;
  color: var(--lamp-text);
  font: inherit;
  background: rgb(0 0 0 / 0.14);
  border: 1px solid var(--lamp-line-soft);
  border-radius: var(--radius-md);
  cursor: pointer;
  overflow-wrap: anywhere;
}
.missing-recipe:hover {
  border-color: var(--lamp-gold-dark);
}
.missing-description {
  display: grid;
  gap: var(--space-1);
}
.missing-description > span,
.formula-empty,
.missing-recipe :deep(.formula-list) {
  color: var(--lamp-muted);
  font-size: var(--text-xs);
}
.formula-empty,
.missing-recipe :deep(.formula-list) {
  grid-column: 2;
}
@media (min-width: 1024px) {
  .album-layout {
    grid-template-columns: 280px minmax(0, 1fr);
  }
  .album-categories {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .missing-recipe {
    grid-template-columns: auto minmax(0, 1fr) minmax(140px, 25%);
  }
  .formula-empty,
  .missing-recipe :deep(.formula-list) {
    grid-column: auto;
    text-align: right;
  }
}
</style>
