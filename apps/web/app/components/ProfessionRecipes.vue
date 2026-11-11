<script setup lang="ts">
import { CHARACTER_COPY, type Profession } from "#shared/character-page";
const props = defineProps<{ profession: Profession; lang: "en" | "ru" }>();
const copy = computed(() => CHARACTER_COPY[props.lang]);
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
      <section v-for="group in profession.missing" :key="group.category.id" class="recipe-category">
        <h3>{{ group.category.name }}</h3>
        <ul>
          <li v-for="recipe in group.recipes" :key="recipe.spellId">
            <span>{{ recipe.name || copy.unnamed }}</span>
            <span>{{ copy.minSkill }}: {{ recipe.minSkill }}</span>
            <span v-if="recipe.band" :class="['recipe-band', `recipe-band--${recipe.band}`]">{{
              copy.bands[recipe.band]
            }}</span>
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
