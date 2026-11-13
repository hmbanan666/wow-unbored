<script setup lang="ts">
import { characterHref, type CharacterPage } from "#shared/character-page";
import { albumFilter, professionName, professionSlug } from "#shared/profession-album";

type Result = { ok: true; character: CharacterPage } | { ok: false; message: string };
const route = useRoute();
const router = useRouter();
const endpoint = computed(
  () =>
    `/api/me/characters/${encodeURIComponent(String(route.params.game))}/${encodeURIComponent(String(route.params.realm))}/${encodeURIComponent(String(route.params.name))}`,
);
const { data, error, status, refresh } = await useFetch<Result>(endpoint);
const character = computed(() => (data.value?.ok ? data.value.character : null));
const profession = computed(() =>
  character.value?.professions.find((p) => professionSlug(p) === route.params.profession),
);
if (error.value?.statusCode === 404)
  throw createError({ statusCode: 404, message: "Character not found." });
if (character.value && !profession.value)
  throw createError({ statusCode: 404, message: "Profession not found." });
const filter = computed(() => albumFilter(route.query.f));
function selectFilter(value: string) {
  const query = { ...route.query };
  if (value === "all") delete query.f;
  else query.f = value;
  return router.push({ query });
}
useSeoMeta({
  title: () =>
    profession.value
      ? `${professionName(profession.value)} · ${character.value?.name}`
      : "Profession collection",
  robots: "noindex, nofollow",
});
</script>
<template>
  <DsPage width="wide">
    <template v-if="character && profession">
      <DsButton :to="characterHref(character)" variant="ghost"
        >Back to {{ character.name }}</DsButton
      >
      <DsPageHeader
        :title="professionName(profession)"
        :eyebrow="`${character.name} · ${character.game === 'forever' ? 'Forever' : 'Retail'}`"
        lead="Your collection, one recipe at a time."
      />
      <TodayGoals
        :set="character.today?.find((s) => s.skillLine === profession!.skillLine)"
        :name="professionName(profession)"
        :unavailable="character.today === null"
        @retry="refresh()"
      />
      <ProfessionAlbum
        :key="profession.skillLine"
        :profession="profession"
        :game="character.game"
        :filter="filter"
        @filter="selectFilter"
      />
    </template>
    <DsEmptyState
      v-else-if="status === 'pending' || status === 'idle'"
      :level="1"
      title="Your profession collection"
      text="Bory is checking your recipes."
    />
    <DsEmptyState
      v-else
      :level="1"
      title="Your profession collection"
      :text="data && !data.ok ? data.message : 'Bory could not check your recipes just now.'"
    >
      <DsButton v-if="error || !data" @click="refresh()">Try again</DsButton>
      <DsButton to="/my" variant="ghost">My page</DsButton>
    </DsEmptyState>
  </DsPage>
</template>
