<script setup lang="ts">
/** Bory in his gold frame. Decorative: the page text says the same thing. */
withDefaults(defineProps<{ size?: "md" | "lg" }>(), { size: "md" });
</script>

<template>
  <div class="ds-portrait" :class="`ds-portrait--${size}`" aria-hidden="true">
    <img class="ds-portrait__bory" src="/bory.webp" alt="" width="256" height="256" />
    <img src="/bory-frame.webp" alt="" width="256" height="256" />
  </div>
</template>

<style scoped>
.ds-portrait {
  position: relative;
  width: 6.5rem;
  height: 6.5rem;
  flex: none;
}

.ds-portrait--lg {
  width: 8rem;
  height: 8rem;
}

.ds-portrait img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.ds-portrait .ds-portrait__bory {
  inset: 8%;
  width: 84%;
  height: 84%;
  margin: auto;
  border-radius: 50%;
}
</style>
