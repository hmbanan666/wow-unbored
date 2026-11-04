<script setup lang="ts">
/** Centred column with the page gutter. `narrow` for reading, `wide` for card grids and lists. */
withDefaults(defineProps<{ width?: "narrow" | "wide"; as?: string }>(), {
  width: "narrow",
  as: "div",
});
</script>

<template>
  <component :is="as" class="ds-container" :class="`ds-container--${width}`">
    <slot />
  </component>
</template>

<style scoped>
.ds-container {
  width: 100%;
  max-width: calc(var(--container-narrow) + 2 * var(--gutter));
  margin-inline: auto;
  padding-inline: var(--gutter);
  box-sizing: border-box;
}

.ds-container--wide {
  max-width: calc(var(--container-wide) + 2 * var(--gutter));
}
</style>
