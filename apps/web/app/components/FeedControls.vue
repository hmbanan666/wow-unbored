<script setup lang="ts">
import { useSelectedCharacter } from "../composables/useSelectedCharacter";
import type { SharingState } from "#shared/character-feed";
import { characterKey } from "#shared/selected-character";
const props = defineProps<{
  href?: string;
  identity?: { game: string; realm: string; name: string };
}>();
const emit = defineEmits<{ changed: [] }>();
const { selected } = useSelectedCharacter();
const state = ref<SharingState | null>(null);
const busy = ref(false),
  message = ref(""),
  own = ref(false),
  mounted = ref(false);
let generation = 0;
const matches = computed(
  () =>
    state.value &&
    (!props.href || props.href === state.value.href) &&
    (!props.identity ||
      (props.identity.game === selected.value?.game &&
        props.identity.realm === selected.value?.realm &&
        props.identity.name === selected.value?.name)),
);
async function load() {
  const ticket = ++generation;
  state.value = null;
  message.value = "";
  own.value = false;
  if (!mounted.value || selected.value?.game !== "forever") return;
  try {
    const result = await $fetch<SharingState>("/api/me/feed/sharing", { cache: "no-store" });
    if (ticket === generation) state.value = result;
  } catch {
    if (ticket === generation) message.value = "Sharing settings are resting. Try again.";
  }
}
watch(() => (selected.value ? characterKey(selected.value) : ""), load);
onMounted(() => {
  mounted.value = true;
  void load();
});
onBeforeUnmount(() => {
  generation++;
});
async function toggle() {
  if (!state.value || busy.value) return;
  const ticket = generation;
  busy.value = true;
  message.value = "";
  try {
    const result = await $fetch<SharingState>("/api/me/feed/sharing", {
      method: "PUT",
      body: { enabled: !state.value.enabled },
    });
    if (ticket === generation) {
      state.value = result;
      own.value = false;
      emit("changed");
    }
  } catch {
    if (ticket === generation) message.value = "Could not change sharing. Please try again.";
  } finally {
    busy.value = false;
  }
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !own.value || !state.value?.enabled || busy.value) return;
  if (file.size > 12 * 1024 * 1024) {
    message.value = "Choose a screenshot under 12 MB.";
    input.value = "";
    return;
  }
  const ticket = generation;
  busy.value = true;
  message.value = "Adding your screenshot…";
  try {
    await $fetch("/api/me/feed/screenshots", {
      method: "POST",
      query: { generation: state.value.generation, own: "yes" },
      body: file,
      headers: { "content-type": "application/octet-stream" },
    });
    if (ticket === generation) {
      message.value = "Your moment is shared.";
      emit("changed");
    }
  } catch {
    if (ticket === generation)
      message.value =
        "Could not add this screenshot. Check sharing and try a PNG, JPEG or WebP under 12 MB.";
  } finally {
    busy.value = false;
    input.value = "";
  }
}
</script>
<template>
  <aside v-if="matches && state" class="feed-controls" aria-label="Your sharing settings">
    <div class="sharing-top">
      <div>
        <h2>Your story, your choice.</h2>
        <p>
          {{
            state.enabled
              ? "Your milestones and screenshots are public."
              : "Sharing is off. Your history stays with you."
          }}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        :aria-checked="state.enabled"
        :disabled="busy"
        @click="toggle"
      >
        Sharing {{ state.enabled ? "on" : "off" }}
      </button>
    </div>
    <p v-if="!state.enabled" class="sharing-note">
      Turning this on shares your recorded milestones. You can hide your feed again at any time.
    </p>
    <div v-else class="upload-controls">
      <label
        ><input v-model="own" type="checkbox" :disabled="busy" /> This is my own screenshot from the
        game.</label
      ><label class="upload-button"
        >Add a screenshot<input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          :disabled="!own || busy"
          @change="upload" /></label
      ><small>PNG, JPEG or WebP · up to 12 MB · compression only</small>
    </div>
    <NuxtLink :to="state.href">Open your public feed ↗</NuxtLink>
    <p role="status">{{ message }}</p>
  </aside>
  <p v-else-if="message" role="status">
    {{ message }} <button type="button" @click="load">Try again</button>
  </p>
</template>
<style scoped>
.feed-controls {
  max-width: 720px;
  margin: 24px auto;
  padding: 24px;
  border: 1px solid #806e5c;
  border-radius: 16px;
  background: #2a1c15;
}
.sharing-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}
h2 {
  font-size: 1.4rem;
  margin: 0 0 8px;
}
p {
  color: #b8a385;
  margin: 0;
}
button,
.upload-button {
  background: #7a2230;
  color: #eadbc0;
  border: 1px solid #b8a385;
  border-radius: 8px;
  padding: 10px 16px;
  cursor: pointer;
  flex-shrink: 0;
}
button[aria-checked="true"] {
  border-color: #e8b04a;
}
button:disabled {
  opacity: 0.6;
}
.sharing-note {
  margin: 16px 0;
}
.upload-controls {
  display: grid;
  gap: 14px;
  margin: 20px 0;
}
.upload-button {
  display: grid;
  gap: 8px;
}
small {
  color: #b8a385;
}
.feed-controls > a {
  display: inline-block;
  margin-top: 16px;
}
[role="status"]:not(:empty) {
  margin-top: 14px;
}
@media (max-width: 520px) {
  .sharing-top {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
