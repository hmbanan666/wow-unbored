<script setup lang="ts">
import type { MediaAsset } from "@unbored/contracts/game-media";
const props = withDefaults(
  defineProps<{
    media: MediaAsset;
    alt: string;
    render?: boolean;
    eager?: boolean;
    maxWidth?: number;
    sizes?: string;
    desktopOnly?: boolean;
  }>(),
  { maxWidth: 640, sizes: "(min-width: 768px) 640px, calc(100vw - 32px)" },
);
const variants = computed(() => {
  const small = props.media.variants.filter((v) => v.width <= props.maxWidth);
  if (small.length) return small;
  const width = Math.min(...props.media.variants.map((v) => v.width));
  return props.media.variants.filter((v) => v.width === width);
});
const srcset = (format: string) =>
  variants.value
    .filter((v) => v.format === format)
    .map((v) => `/media/${v.file} ${v.width}w`)
    .join(", ");
const fallback = computed(
  () => variants.value.find((v) => v.format === "webp") || variants.value[0],
);
// The fallback occupies no network request on phones; desktop sources select the real art.
const blank =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/%3E";
</script>

<template>
  <picture v-if="fallback" class="ds-game-art" :class="{ 'ds-game-art--render': render }">
    <source
      v-if="srcset('avif')"
      type="image/avif"
      :media="desktopOnly ? '(min-width: 768px)' : undefined"
      :srcset="srcset('avif')"
      :sizes="sizes"
    />
    <source
      v-if="srcset('webp')"
      type="image/webp"
      :media="desktopOnly ? '(min-width: 768px)' : undefined"
      :srcset="srcset('webp')"
      :sizes="sizes"
    />
    <img
      :src="desktopOnly ? blank : `/media/${fallback.file}`"
      :alt="alt"
      :width="media.width"
      :height="media.height"
      :loading="eager ? 'eager' : 'lazy'"
      :fetchpriority="eager ? 'high' : undefined"
      decoding="async"
    />
  </picture>
</template>

<style scoped>
.ds-game-art {
  display: block;
  overflow: hidden;
  border-radius: var(--radius-sm);
}
.ds-game-art img {
  display: block;
  width: 100%;
  height: 100%;
}
.ds-game-art--render {
  position: relative;
  background: radial-gradient(ellipse at 50% 55%, var(--lamp-glow), var(--lamp-bg) 72%);
}
.ds-game-art--render img {
  object-fit: contain;
}
.ds-game-art--render::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse, transparent 45%, var(--lamp-bg) 85%);
}
</style>
