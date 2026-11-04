<script setup lang="ts">
import type { MediaAsset } from "@unbored/contracts/game-media";

const props = withDefaults(
  defineProps<{
    kind: string;
    media?: MediaAsset;
    size?: "sm" | "md" | "lg";
    eager?: boolean;
    alt?: string;
  }>(),
  { size: "md", alt: "" },
);
const pixels = computed(() => ({ sm: 32, md: 44, lg: 56 })[props.size]);
const avif = computed(() => props.media?.variants.find((v) => v.format === "avif"));
const webp = computed(() => props.media?.variants.find((v) => v.format === "webp"));
const glyphs: Record<string, string> = {
  mount: "M7 4C2 12 4 21 12 21S22 12 17 4l-3 2c4 7 3 11-2 11S6 13 10 6ZM6 9h2m8 0h2M6 13h2m8 0h2",
  pet: "M7 15c-5 7 3 7 5 5 2 2 10 2 5-5l-3-3h-4ZM4 10a2 3 0 1 0 0-.1M9 6a2 3 0 1 0 0-.1M15 6a2 3 0 1 0 0-.1M20 10a2 3 0 1 0 0-.1",
  toy: "M3 9h18v4H3ZM5 13v8h14v-8M12 9v12M12 9C2 9 5 0 9 4ZM12 9c10 0 7-9 3-5Z",
  achievement: "M12 2 3 6v7c0 5 9 9 9 9s9-4 9-9V6ZM12 6l2 4 4 .5-3 3 1 4-4-2-4 2 1-4-3-3 4-.5Z",
  level: "m4 14 8-8 8 8M4 20l8-8 8 8M12 6V2",
  rep: "M5 22V3h14l-3 5 3 5H5",
  quest: "M6 3h13v15H8a3 3 0 0 1-3 3H3V6a3 3 0 0 1 6 0H5M8 18h13a3 3 0 0 1-3 3H5M13 7v5m0 3v.2",
  questLine:
    "m9 14-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m3 5 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0m-3-4 6-6",
  currency: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 6v12m3-10h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9",
  item: "M7 3h10l-2 5c9 9 6 13-3 13S0 17 9 8ZM8 8h8M9 13h6",
};
glyphs.renown = glyphs.rep!;
glyphs.reputation = glyphs.rep!;
glyphs.chain = glyphs.questLine!;
const glyph = computed(() => glyphs[props.kind] ?? glyphs.item);
</script>

<template>
  <span class="ds-game-icon" :class="`ds-game-icon--${size}`">
    <picture v-if="webp || avif">
      <source v-if="avif" type="image/avif" :srcset="`/media/${avif.file}`" />
      <source v-if="webp" type="image/webp" :srcset="`/media/${webp.file}`" />
      <img
        :src="`/media/${(webp || avif)!.file}`"
        :alt="alt"
        :width="pixels"
        :height="pixels"
        decoding="async"
        :loading="eager ? 'eager' : 'lazy'"
      />
    </picture>
    <svg
      v-else
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path :d="glyph" />
    </svg>
  </span>
</template>

<style scoped>
.ds-game-icon {
  display: inline-flex;
  flex: none;
  width: var(--game-icon-size, 44px);
  height: var(--game-icon-size, 44px);
  padding: 2px;
  vertical-align: middle;
  border: 1px solid var(--lamp-gold-dark);
  border-radius: 6px;
  background: var(--lamp-deep);
  box-shadow:
    inset 0 0 0 2px rgb(0 0 0 / 0.6),
    inset 0 1px 3px var(--lamp-gold-dark);
  color: var(--lamp-gold);
  overflow: hidden;
}
.ds-game-icon--sm {
  --game-icon-size: 32px;
}
.ds-game-icon--lg {
  --game-icon-size: 56px;
}
.ds-game-icon picture,
.ds-game-icon img {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 3px;
}
.ds-game-icon svg {
  width: 100%;
  height: 100%;
  padding: 4px;
}
</style>
