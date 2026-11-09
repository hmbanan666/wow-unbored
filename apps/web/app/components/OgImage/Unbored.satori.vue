<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    game?: string;
    image?: string;
    imageFit?: "cover" | "contain";
  }>(),
  {
    title: "Unbored",
    description: "Bory gives you one step at a time.",
    game: "retail",
    image: "/bory.png",
    imageFit: "contain",
  },
);
</script>

<template>
  <div
    style="
      width: 1200px;
      height: 600px;
      display: flex;
      align-items: center;
      background-color: #1e1410;
      color: #eadbc0;
      font-family: Alegreya;
      padding: 56px;
      gap: 40px;
    "
  >
    <div style="display: flex; flex-direction: column; width: 688px">
      <div style="display: flex; align-items: center; gap: 24px; color: #e8b04a; font-size: 28px">
        <span>Unbored</span>
        <span
          v-if="game === 'forever'"
          style="border: 2px solid #a87820; border-radius: 12px; padding: 6px 18px; color: #f5d27a"
          >WoW Forever</span
        >
      </div>
      <div
        style="
          display: flex;
          font-size: 56px;
          font-weight: 700;
          margin-top: 20px;
          line-height: 1.1;
          color: #f5d27a;
        "
      >
        {{ title }}
      </div>
      <div style="display: flex; font-size: 28px; margin-top: 24px; line-height: 1.35">
        {{ description }}
      </div>
    </div>
    <img
      :src="image || '/bory.png'"
      alt=""
      width="360"
      height="400"
      :style="{
        objectFit: image ? imageFit : 'contain',
        borderRadius: '16px',
        backgroundColor:
          image && image !== '/bory.png' && imageFit === 'contain' ? '#181818' : 'transparent',
      }"
    />
  </div>
</template>
