<script setup lang="ts">
import { CHARACTER_COPY, type CharacterPage } from "#shared/character-page";

type Result =
  | { ok: true; lang: "en" | "ru"; character: CharacterPage }
  | { ok: false; lang: "en" | "ru"; message: string };
const route = useRoute();
const endpoint = computed(
  () =>
    `/api/me/characters/${encodeURIComponent(String(route.params.game))}/${encodeURIComponent(String(route.params.realm))}/${encodeURIComponent(String(route.params.name))}`,
);
const { data, error, status, refresh } = await useFetch<Result>(endpoint);
const lang = computed(() => data.value?.lang || "en");
const copy = computed(() => CHARACTER_COPY[lang.value]);
const character = computed(() => (data.value?.ok ? data.value.character : null));
if (error.value?.statusCode === 404) {
  throw createError({
    statusCode: 404,
    message: (error.value.data as { message?: string } | undefined)?.message || copy.value.notFound,
  });
}
useSeoMeta({ title: () => character.value?.name || copy.value.title, robots: "noindex" });
</script>

<template>
  <DsPage>
    <DsButton to="/my" variant="ghost">{{ copy.back }}</DsButton>
    <DsEmptyState
      v-if="status === 'pending' || status === 'idle'"
      :level="1"
      :title="copy.title"
      :text="copy.loading"
    />
    <DsEmptyState
      v-else-if="!character"
      :level="1"
      :title="copy.title"
      :text="data && !data.ok ? data.message : copy.failed"
    >
      <DsButton v-if="error || !data" @click="refresh()">{{ copy.retry }}</DsButton>
    </DsEmptyState>
    <template v-else>
      <DsPageHeader :title="character.name" :eyebrow="character.realm" />
      <DsChip v-if="character.game === 'forever'">Forever</DsChip>
      <DsSection :title="copy.professions">
        <DsEmptyState v-if="!character.professions.length" :title="copy.empty" :text="copy.open" />
        <DsCardGrid v-else>
          <DsCard
            v-for="profession in character.professions"
            :key="profession.skillLine"
            :title="profession.name"
          >
            <p v-if="profession.skill !== null">
              {{ copy.skill }}: {{ profession.skill
              }}<template v-if="profession.max !== null"> / {{ profession.max }}</template>
            </p>
            <p v-if="profession.known !== null">
              {{ copy.known }}: {{ profession.known
              }}<template v-if="profession.total != null">{{
                ` ${copy.of} ${profession.total}`
              }}</template>
            </p>
            <p v-else>{{ copy.open }}</p>
            <p v-if="profession.total == null">{{ copy.catalogEmpty }}</p>
            <p v-if="profession.uncatalogued">
              {{ copy.uncatalogued }}: {{ profession.uncatalogued }}
            </p>
            <template v-if="profession.known !== null && profession.total != null">
              <p v-if="!profession.missing.length">{{ copy.complete }}</p>
              <details v-else>
                <summary>
                  {{ copy.missing }} ({{
                    profession.missing.reduce((n, group) => n + group.recipes.length, 0)
                  }})
                </summary>
                <section
                  v-for="group in profession.missing"
                  :key="group.category.id"
                  class="recipe-category"
                >
                  <h3>{{ group.category.name }}</h3>
                  <ul>
                    <li v-for="recipe in group.recipes" :key="recipe.spellId">
                      <span>{{ recipe.name || copy.unnamed }}</span>
                      <span>{{ copy.minSkill }}: {{ recipe.minSkill }}</span>
                      <span
                        v-if="recipe.band"
                        :class="['recipe-band', `recipe-band--${recipe.band}`]"
                        >{{ copy.bands[recipe.band] }}</span
                      >
                    </li>
                  </ul>
                </section>
              </details>
            </template>
          </DsCard>
        </DsCardGrid>
      </DsSection>
    </template>
  </DsPage>
</template>

<style scoped>
.recipe-category {
  margin-block: 1rem;
}
.recipe-category ul {
  list-style: none;
  padding: 0;
}
.recipe-category li {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-block: 0.75rem;
}
.recipe-category li > span:first-child {
  flex-basis: 100%;
}
.recipe-band {
  font-weight: 600;
}
.recipe-band--orange {
  color: #f0a14b;
}
.recipe-band--yellow {
  color: #e4cd69;
}
.recipe-band--green {
  color: #91c98b;
}
.recipe-band--grey {
  color: #b6b0a9;
}
</style>
