<script setup lang="ts">
import { catalogHref, type PublicPage } from "#shared/catalog";
import {
  pathForPage,
  replacementFor,
  selectionOf,
  selectionConflict,
  type PathProgress,
  type PathSelection,
} from "#shared/personal-paths";
import { SIGN_IN_COPY } from "#shared/sign-in";

const props = defineProps<{ page?: PublicPage }>();
const { data, lang, copy, loading, signedOut, message, refresh } = usePaths();
const selected = ref("");
const busy = ref(false);
const notice = ref("");
const pending = ref<{ current: PathProgress; next: PathProgress } | null>(null);
const options = computed(() =>
  (data.value?.characters ?? []).map((row) => ({
    value: JSON.stringify([row.character, row.realm]),
    label: `${row.character} · ${row.realm}`,
  })),
);
watch(options, (rows) => {
  if (!rows.some((row) => row.value === selected.value)) selected.value = rows[0]?.value ?? "";
});
watch(selected, () => {
  pending.value = null;
  notice.value = "";
});
const chosen = computed(() =>
  data.value?.characters.find(
    (row) => JSON.stringify([row.character, row.realm]) === selected.value,
  ),
);
const progress = computed(() =>
  props.page ? pathForPage(chosen.value?.paths ?? [], props.page) : undefined,
);
const isActive = computed(
  () =>
    progress.value && chosen.value?.active && !replacementFor(chosen.value.active, progress.value),
);
function choose() {
  const next = progress.value;
  if (!next || !chosen.value) return;
  const current = chosen.value.active;
  if (current && replacementFor(current, next)) pending.value = { current, next };
  else void save(next, null);
}
async function save(next: PathProgress, expectedActive: PathSelection | null) {
  const character = chosen.value;
  if (!character) return;
  pending.value = null;
  busy.value = true;
  notice.value = copy.value.saving;
  try {
    const result = await $fetch<{ path: PathProgress }>("/api/paths/active", {
      method: "PUT",
      body: {
        character: character.character,
        realm: character.realm,
        path: selectionOf(next),
        expectedActive,
      },
    });
    character.active = result.path;
    notice.value = copy.value.saved;
  } catch (error) {
    const failure = error as { statusCode?: number; data?: { current?: PathProgress | null } };
    const conflict = selectionConflict(failure);
    if (conflict) {
      character.active = conflict.current;
      pending.value = conflict.current ? { current: conflict.current, next } : null;
      notice.value = conflict.current ? "" : copy.value.selectionChanged;
    } else if (failure.statusCode === 401) {
      data.value = null;
      signedOut.value = true;
      message.value = SIGN_IN_COPY[lang.value].closed;
      notice.value = "";
    } else notice.value = failure.statusCode === 429 ? copy.value.limited : copy.value.failed;
  } finally {
    busy.value = false;
  }
}
function confirm() {
  if (pending.value) void save(pending.value.next, selectionOf(pending.value.current));
}
function reopen() {
  window.location.reload();
}
</script>

<template>
  <DsSection :title="copy.title">
    <p v-if="loading" role="status">{{ copy.loading }}</p>
    <template v-else-if="message">
      <p role="status">{{ message }}</p>
      <DsActions>
        <DsButton v-if="!signedOut" @click="refresh">{{ copy.retry }}</DsButton>
        <DsButton v-else to="/install" variant="secondary">{{ copy.install }}</DsButton>
      </DsActions>
    </template>
    <p v-else-if="!options.length">{{ copy.empty }}</p>
    <template v-else-if="chosen">
      <DsSelect v-model="selected" :label="copy.character" :options="options" :disabled="busy" />
      <p v-if="!chosen.active">{{ copy.none }}</p>
      <DsActions v-else>
        <DsButton :to="catalogHref(chosen.active.kind, chosen.active.slug)!" variant="ghost"
          >{{ copy.active }}: {{ chosen.active.title }} · {{ chosen.active.done }} /
          {{ chosen.active.total }}</DsButton
        >
      </DsActions>
      <template v-if="page">
        <template v-if="progress">
          <DsProgress :done="progress.done" :total="progress.total" :label="copy.required" />
          <p v-if="isActive">{{ copy.selected }}</p>
          <DsActions v-else
            ><DsButton :disabled="busy" @click="choose">{{ copy.pick }}</DsButton></DsActions
          >
        </template>
        <template v-else>
          <p>{{ copy.changed }}</p>
          <DsButton @click="reopen">{{ copy.reopen }}</DsButton>
        </template>
      </template>
      <p v-if="notice" role="status">{{ notice }}</p>
    </template>
  </DsSection>
  <slot :progress="progress" :paths="chosen?.paths ?? []" :copy="copy" />
  <DsConfirm
    :open="!!pending"
    :title="copy.replace"
    :confirm="copy.confirm"
    :cancel="copy.cancel"
    @confirm="confirm"
    @cancel="pending = null"
  >
    <p v-if="pending">{{ pending.current.title }} → {{ pending.next.title }}</p>
    <p>{{ copy.replaceText }}</p>
  </DsConfirm>
</template>
