<script setup lang="ts">
/** The main landmark with page padding. */
withDefaults(defineProps<{ width?: "narrow" | "wide" }>(), { width: "narrow" });
</script>

<template>
  <DsContainer as="main" :width="width" class="ds-page"><slot /></DsContainer>
</template>

<style scoped>
.ds-page {
  padding-top: var(--space-4);
  padding-bottom: var(--space-8);
}
</style>
