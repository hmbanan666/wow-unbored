<script setup lang="ts">
import {
  recipeHref,
  type Game,
  type ProfessionOverlay,
  type PublicProfession,
} from "#shared/public-professions";
import { ALBUM_FILTERS, albumCategories, matchesAlbumFilter } from "#shared/profession-album";
import { learningSource, byRecipeSkill } from "#shared/recipe-editorial";

const props = defineProps<{
  base: PublicProfession;
  overlay?: ProfessionOverlay | null;
  game: Game;
  filter: string;
}>();
const emit = defineEmits<{ filter: [value: string] }>();
const query = ref("");
const limit = ref(12);
const categories = computed(() => albumCategories(props.base.album));
const zones = computed(() =>
  [...new Set(props.base.album.flatMap((r) => r.sources.map((s) => s.zone)))].sort(),
);
const matches = computed(() =>
  props.base.album
    .filter(
      (r) =>
        matchesAlbumFilter({ ...r, ...props.overlay?.recipes[r.spellId] }, props.filter) &&
        r.name?.toLowerCase().includes(query.value.trim().toLowerCase()),
    )
    .sort(byRecipeSkill),
);
const groups = computed(() => albumCategories(matches.value.slice(0, limit.value)));
const controls = computed(() =>
  ALBUM_FILTERS.filter((f) => props.overlay || !["now", "missing"].includes(f.id)),
);
watch(
  () => [query.value, props.filter, props.base.album],
  () => {
    limit.value = 12;
  },
);
</script>
<template>
  <section class="directory" aria-label="Named recipes">
    <p v-if="!base.album.length">No named recipes have been recorded yet.</p>
    <div class="tools">
      <label
        >Find a recipe<input
          id="find-recipe"
          type="search"
          v-model="query"
          placeholder="Recipe name"
      /></label>
      <label
        >Filter recipes<select
          :value="filter"
          @change="emit('filter', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="f in controls" :key="f.id" :value="f.id">
            {{ f.id === "all" ? "All recipes" : f.label }}
          </option>
          <option v-if="filter.startsWith('npc:')" :value="filter">{{ filter.slice(4) }}</option>
          <optgroup label="Recipe type">
            <option v-for="c in categories" :key="c.id" :value="'category:' + c.id">
              {{ c.name }}
            </option>
          </optgroup>
          <optgroup v-if="zones.length" label="Observed zone">
            <option v-for="z in zones" :key="z" :value="'zone:' + z">{{ z }}</option>
          </optgroup>
        </select></label
      >
    </div>
    <p class="count" aria-live="polite">
      Showing {{ Math.min(limit, matches.length) }} of {{ matches.length }} recipes
    </p>
    <section v-for="group in groups" :key="group.id" class="group">
      <h2>{{ group.name }}</h2>
      <ul>
        <li v-for="r in group.recipes" :key="r.spellId">
          <a :href="recipeHref(game, r.slug)"
            ><span>{{ r.name }}</span
            ><small>{{ learningSource(r) }}</small></a
          >
          <span class="skill"
            >{{
              r.difficulty.requiredSkill === null
                ? "Skill unconfirmed"
                : "Skill " + r.difficulty.requiredSkill
            }}<small v-if="overlay?.recipes[r.spellId]?.known" class="known">Known</small></span
          >
        </li>
      </ul>
    </section>
    <p v-if="!matches.length && base.album.length">
      Try another recipe name or choose All recipes.
    </p>
    <DsButton v-if="limit < matches.length" variant="secondary" @click="limit += 12"
      >Show more recipes</DsButton
    >
  </section>
</template>
<style scoped>
.directory {
  margin-bottom: var(--space-6);
}
.tools {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-3);
}
label,
.count,
.skill,
small {
  font: 500 var(--text-sm)/1.35 var(--font-ui);
  color: var(--lamp-muted);
}
label {
  display: grid;
  gap: var(--space-1);
}
input,
select {
  width: 100%;
  min-width: 0;
  min-height: var(--tap);
  border-radius: var(--radius-sm);
  background: var(--lamp-bg);
  border: 1px solid var(--lamp-line);
  color: var(--lamp-text);
  padding: var(--space-2);
  font: inherit;
}
.count {
  margin: var(--space-3) 0;
}
.group {
  margin: var(--space-5) 0;
}
h2 {
  font-size: var(--text-xl);
  border-bottom: 1px solid var(--lamp-gold-dark);
  padding-bottom: var(--space-2);
}
ul {
  list-style: none;
  padding: 0;
}
li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  border-bottom: 1px solid var(--lamp-line-soft);
}
li a {
  display: grid;
  flex: 1;
  gap: 2px;
  text-decoration: none;
  padding: var(--space-2) 0;
  min-height: var(--tap);
  font: 700 var(--text-lg)/1.25 var(--font-body);
  overflow-wrap: anywhere;
}
li a:hover span {
  text-decoration: underline;
}
.skill {
  align-self: start;
  padding-block: var(--space-2);
  min-width: 5ch;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.known {
  display: block;
  color: var(--lamp-gold-light);
}
@media (min-width: 640px) {
  .tools {
    grid-template-columns: 2fr 1fr;
  }
}
</style>
