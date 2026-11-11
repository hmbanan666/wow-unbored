<script setup lang="ts">
import { type CharacterHistory } from "#shared/character-history";
import { characterHref } from "#shared/character-page";
type Result = { ok: true; history: CharacterHistory } | { ok: false; message: string };
const route = useRoute();
const identity = computed(() => ({
  game: route.params.game === "forever" ? ("forever" as const) : ("retail" as const),
  realm: String(route.params.realm),
  name: String(route.params.name),
}));
const back = computed(() => characterHref(identity.value));
const selected = computed(() => (typeof route.query.types === "string" ? route.query.types : ""));
const query = computed(() => ({
  types: selected.value,
  ...(typeof route.query.cursor === "string" ? { cursor: route.query.cursor } : {}),
}));
const { data, error, status, refresh } = await useFetch<Result>(
  () =>
    `/api/me/characters/${encodeURIComponent(String(route.params.game))}/${encodeURIComponent(identity.value.realm)}/${encodeURIComponent(identity.value.name)}/history`,
  { query },
);
const history = computed(() => (data.value?.ok ? data.value.history : null));
if (error.value?.statusCode === 404)
  throw createError({ statusCode: 404, message: "Character not found." });
useSeoMeta({ title: () => `${identity.value.name} history`, robots: "noindex, nofollow" });
</script>
<template>
  <DsPage>
    <DsButton :to="back" variant="ghost">Back to character</DsButton>
    <DsPageHeader :title="`${identity.name} history`" :eyebrow="identity.realm" />
    <DsEmptyState
      v-if="status === 'pending' || status === 'idle'"
      title="Loading history"
      text="Your character's story is on its way."
    />
    <DsEmptyState
      v-else-if="!history"
      title="History is unavailable"
      :text="data && !data.ok ? data.message : 'Please try again.'"
    >
      <DsButton @click="refresh()">Try again</DsButton>
    </DsEmptyState>
    <template v-else>
      <p>
        Recorded changes from your play. Dates are UTC; charts show the last recorded value each
        day.
      </p>
      <HistoryChart v-for="chart in history.charts" :key="chart.key" :chart="chart" />
      <CharacterHistoryTimeline
        :history="history"
        :back="back"
        :selected="selected"
        :cursor="Boolean(route.query.cursor)"
      />
    </template>
  </DsPage>
</template>
