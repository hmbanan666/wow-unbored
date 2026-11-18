<script setup lang="ts">
import type { AlbumRecipe } from "@unbored/contracts/profession-progress";
defineProps<{ sources: AlbumRecipe["sources"] }>();
</script>
<template>
  <template v-if="sources.length">
    <ul>
      <li v-for="(source, index) in sources" :key="index">
        {{ source.npcName }} · {{ source.zone
        }}<template v-if="source.x !== null && source.y !== null">
          ({{ source.x }}, {{ source.y }})</template
        >
        <template v-if="source.cost !== null"> · {{ source.cost }} copper</template>
        <span class="detail-meta">
          ·
          {{
            source.kind === "trainer"
              ? "Trainer"
              : source.limited
                ? "Vendor, limited supply"
                : "Vendor"
          }}</span
        >
      </li>
    </ul>
    <p class="detail-meta">Players recorded these visits in game. Stock and prices can change.</p>
  </template>
  <p v-else>No trainer or vendor visit has been recorded for this recipe.</p>
</template>
<style scoped>
ul {
  padding-left: var(--space-4);
}
p,
ul {
  margin-top: var(--space-2);
}
.detail-meta {
  color: var(--lamp-muted);
}
</style>
