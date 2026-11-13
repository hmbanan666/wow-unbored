<script setup lang="ts">
import { gameName, type Game } from "#shared/public-professions";
defineProps<{ otherGame: boolean; game: Game; status: string }>();
defineEmits<{ retry: [] }>();
</script>
<template>
  <p v-if="otherGame" class="overlay-status">
    Pick a {{ gameName(game) }} character in the header to see your recipes here.
  </p>
  <p v-else-if="status === 'loading'" class="overlay-status" role="status">
    Bory is checking your recipes…
  </p>
  <div v-else-if="status === 'error'" class="overlay-status" role="status">
    Bory could not check your recipes. Pick a character or
    <DsButton variant="ghost" @click="$emit('retry')">try again</DsButton>.
  </div>
</template>
<style scoped>
.overlay-status {
  margin-block: 1rem;
  color: var(--lamp-muted);
  font-family: var(--font-ui);
}
</style>
