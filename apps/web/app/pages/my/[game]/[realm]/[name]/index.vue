<script setup lang="ts">
import { CHARACTER_COPY, characterHref, type CharacterPage } from "#shared/character-page";

import { professionSlug } from "#shared/profession-album";

type Result = { ok: true; character: CharacterPage } | { ok: false; message: string };
const route = useRoute();
const endpoint = computed(
  () =>
    `/api/me/characters/${encodeURIComponent(String(route.params.game))}/${encodeURIComponent(String(route.params.realm))}/${encodeURIComponent(String(route.params.name))}`,
);
const { data, error, status, refresh } = await useFetch<Result>(endpoint);
const copy = CHARACTER_COPY;
const character = computed(() => (data.value?.ok ? data.value.character : null));
if (error.value?.statusCode === 404) {
  throw createError({
    statusCode: 404,
    message: (error.value.data as { message?: string } | undefined)?.message || copy.notFound,
  });
}
useSeoMeta({ title: () => character.value?.name || copy.title, robots: "noindex" });
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
      <DsButton :to="`${characterHref(character)}/history`">Character history</DsButton>
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
            <DsButton
              :to="`${characterHref(character)}/${professionSlug(profession)}`"
              variant="secondary"
              >Open collection</DsButton
            >
            <ProfessionRoute
              v-for="entry in profession.routes || []"
              :key="entry.route.skillLine"
              :route="entry.route"
              :name="entry.name"
            />
            <ProfessionRecipes :profession="profession" />
          </DsCard>
        </DsCardGrid>
      </DsSection>
    </template>
  </DsPage>
</template>
