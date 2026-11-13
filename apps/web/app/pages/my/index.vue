<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useSelectedCharacter } from "../../composables/useSelectedCharacter";
import { characterKey } from "#shared/selected-character";
import { PROFILE_COPY, type ProfileHome } from "#shared/profile-home";
const picker = useSelectedCharacter();
const profile = ref<ProfileHome | null>(null);
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
    const result = await $fetch<{ ok: boolean; character?: ProfileHome }>(
      `/api/me/characters/${characterKey(picker.selected.value)}/profile`,
      { cache: "no-store" },
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
useSeoMeta({ title: PROFILE_COPY.title, robots: "noindex, nofollow" });
</script>
<template>
  <DsPage width="wide">
    <FeedControls />
    <ProfileHome v-if="profile" :character="profile" @retry="load" />
    <DsEmptyState
      v-else
      :level="1"
      :title="PROFILE_COPY.title"
      :text="
        status === 'error'
          ? PROFILE_COPY.failed
          : status === 'loading'
            ? PROFILE_COPY.loading
            : picker.state.value.status === 'ready'
              ? picker.state.value.signedIn
                ? 'Bory has not seen your characters yet. Play once and sync with the Companion.'
                : 'Open my profile in the Companion to sign in.'
              : PROFILE_COPY.loading
      "
    >
      <DsButton v-if="status === 'error'" @click="load">Try again</DsButton>
      <DsButton v-else-if="picker.state.value.status === 'ready'" to="/install#sign-in"
        >Open the Companion</DsButton
      >
    </DsEmptyState>
    <PhoneSignIn v-if="picker.state.value.signedIn" />
  </DsPage>
</template>
