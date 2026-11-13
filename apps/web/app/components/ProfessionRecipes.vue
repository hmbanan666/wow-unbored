<script setup lang="ts">
import { CHARACTER_COPY, type Profession } from "#shared/character-page";
const props = defineProps<{ profession: Profession; lang: "en" | "ru" }>();
const copy = computed(() => CHARACTER_COPY[props.lang]);
function money(copper: number): string {
  return `${Math.floor(copper / 10000)}g ${Math.floor(copper / 100) % 100}s ${copper % 100}c`;
}
</script>

<template>
  <p v-if="profession.known !== null">
    {{ copy.known }}: {{ profession.known
    }}<template v-if="profession.total != null">{{ ` ${copy.of} ${profession.total}` }}</template>
  </p>
  <p v-else>{{ copy.open }}</p>
  <p v-if="profession.total == null">{{ copy.catalogEmpty }}</p>
  <p v-if="profession.uncatalogued">{{ copy.uncatalogued }}: {{ profession.uncatalogued }}</p>
  <template v-if="profession.known !== null && profession.total != null">
    <p v-if="!profession.missing.length">{{ copy.complete }}</p>
    <details v-else>
      <summary>
        {{ copy.missing }} ({{
          profession.missing.reduce((n, group) => n + group.recipes.length, 0)
        }})
      </summary>
      <section v-for="group in profession.missing" :key="group.id" class="recipe-category">
        <h3>{{ group.name }}</h3>
        <details class="source-explanation" :title="group.explanation">
          <summary :aria-label="`About ${group.name}`">What does this mean?</summary>
          <p>{{ group.explanation }}</p>
        </details>
        <ul>
          <li v-for="recipe in group.recipes" :key="recipe.spellId">
            <span>{{ recipe.name || copy.unnamed }}</span>
            <span>{{ copy.minSkill }}: {{ recipe.minSkill }}</span>
            <span v-if="recipe.band" :class="['recipe-band', `recipe-band--${recipe.band}`]">{{
              copy.bands[recipe.band]
            }}</span>
            <ul v-if="recipe.sources.length" class="recipe-places">
              <li
                v-for="source in recipe.sources"
                :key="`${source.kind}:${source.npcId}:${source.itemId}`"
              >
                {{ source.npcName }} · {{ source.zone }}
                <template v-if="source.x !== null && source.y !== null">
                  ({{ source.x }}, {{ source.y }})</template
                >
                ·
                {{
                  source.kind === "trainer"
                    ? "Trainer"
                    : source.limited
                      ? "Limited supply"
                      : "Vendor"
                }}
                <template v-if="source.cost !== null"> · {{ money(source.cost) }}</template>
                <template v-if="source.requiredSkill !== null">
                  · Required skill: {{ source.requiredSkill }}</template
                >
              </li>
            </ul>
            <span v-else-if="recipe.teachingItemNames.length">
              Comes from
              {{
                recipe.teachingItemNames
                  .map((item) => item.name || "a teaching item (name unavailable)")
                  .join(", ")
              }}.
            </span>
          </li>
        </ul>
      </section>
    </details>
  </template>
</template>

<style scoped>
summary {
  min-height: var(--tap);
  align-content: center;
  cursor: pointer;
}
summary:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
.recipe-category {
  margin-block: var(--space-4);
}
.recipe-category ul {
  list-style: none;
  padding: 0;
}
.recipe-category li {
  overflow-wrap: anywhere;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-block: var(--space-3);
}
.recipe-category li > span:first-child {
  flex-basis: 100%;
}
.recipe-places {
  flex-basis: 100%;
}
.recipe-band {
  font-weight: 600;
}
.recipe-band--orange {
  color: var(--recipe-orange);
}
.recipe-band--yellow {
  color: var(--recipe-yellow);
}
.recipe-band--green {
  color: var(--recipe-green);
}
.recipe-band--grey {
  color: var(--recipe-grey);
}
</style>
