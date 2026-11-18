<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useSelectedCharacter } from "../../composables/useSelectedCharacter";
import { characterKey } from "#shared/selected-character";
import type { CharacterProfessions } from "#shared/character-page";
const picker = useSelectedCharacter();
const profile = ref<CharacterProfessions | null>(null);
const status = ref("idle");
const mounted = ref(false);
let generation = 0;
async function load() {
  const request = ++generation;
  profile.value = null;
  if (!mounted.value || !picker.selected.value) {
    status.value = "idle";
    return;
  }
  status.value = "loading";
  try {
    const result = await $fetch<{ ok: boolean; character?: CharacterProfessions }>(
      `/api/me/characters/${characterKey(picker.selected.value)}`,
      { query: { view: "professions" }, cache: "no-store" },
    );
    if (request !== generation) return;
    if (!result.ok || !result.character) {
      status.value = "error";
      return;
    }
    profile.value = result.character;
    status.value = "ready";
  } catch {
    if (request === generation) status.value = "error";
  }
}
watch(
  () => [mounted.value, picker.state.value.status, picker.state.value.selected],
  () => {
    if (
      mounted.value &&
      picker.state.value.status === "ready" &&
      !picker.selected.value &&
      picker.state.value.characters[0]
    ) {
      picker.choose(characterKey(picker.state.value.characters[0]));
      return;
    }
    void load();
  },
);
onMounted(() => {
  mounted.value = true;
});
onBeforeUnmount(() => {
  generation++;
});
useSeoMeta({ title: "My page", robots: "noindex, nofollow" });
</script>
<template>
  <DsPage width="narrow">
    <DsPageHeader title="My page" />
    <template
      v-if="mounted && picker.state.value.status === 'ready' && picker.state.value.signedIn"
    >
      <CharacterPicker v-if="picker.state.value.characters.length" />
      <p v-else>
        Open a profession in the game, then log out with the Companion running to bring your
        character here.
      </p>
      <ProfileHome v-if="profile" :character="profile" />
      <p v-else-if="status === 'error'" role="status">
        Bory couldn't check your character just now. <button @click="load">Try again</button>
      </p>
      <p v-else-if="status === 'loading'" role="status">Checking your professions…</p>
    </template>
    <p v-else-if="mounted && picker.state.value.status === 'error'" role="status">
      Couldn’t load your characters. <button @click="picker.refresh">Try again</button>
    </p>
    <p v-else-if="mounted && picker.state.value.status === 'loading'" role="status">
      Checking your characters…
    </p>
    <p v-else>
      Choose <strong>Open my profile</strong> in the Companion to see your characters here.
    </p>
    <details class="settings" id="settings">
      <summary>Settings</summary>
      <p>
        <NuxtLink to="/install#sign-in">How to sign in</NuxtLink> ·
        <NuxtLink to="/install">Install Bory</NuxtLink>
      </p>
      <template v-if="mounted && picker.state.value.signedIn">
        <PhoneSignIn />
        <FeedControls />
      </template>
    </details>
  </DsPage>
</template>
<style scoped>
.settings {
  margin-top: var(--space-6);
  padding-block: var(--space-3);
  border-top: 1px solid var(--lamp-line-soft);
}
summary,
button {
  cursor: pointer;
}
summary {
  color: var(--lamp-muted);
  min-height: var(--tap);
  align-content: center;
  font-family: var(--font-ui);
}
.settings p {
  margin-block: var(--space-3);
}
</style>
