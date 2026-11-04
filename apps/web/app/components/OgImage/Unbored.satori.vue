<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    description?: string;
  }>(),
  {
    title: "Unbored",
    description: "Bory gives you one step at a time.",
  },
);
</script>

<template>
  <!-- Same lamp palette as the site: dark warm glow, gold gradient title. -->
  <div
    style="
      width: 1200px;
      height: 630px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      background-image: radial-gradient(circle at 50% 0%, #2a1c15 0%, #1e1410 55%, #140d0a 100%);
      color: #eadbc0;
      font-family: Alegreya;
      padding: 80px;
    "
  >
    <div style="display: flex; color: #e8b04a; font-size: 28px">Unbored</div>
    <div
      style="
        display: flex;
        font-size: 68px;
        font-weight: 700;
        margin-top: 16px;
        line-height: 1.1;
        background-image: linear-gradient(180deg, #f5d27a 0%, #e8b04a 55%, #c4922e 100%);
        background-clip: text;
        color: transparent;
      "
    >
      {{ title }}
    </div>
    <div style="display: flex; font-size: 28px; margin-top: 24px; line-height: 1.35">
      {{ description }}
    </div>
  </div>
</template>
