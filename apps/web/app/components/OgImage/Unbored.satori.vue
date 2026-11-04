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
  <div
    style="
      width: 1200px;
      height: 630px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      background: #1e1410;
      color: #eadbc0;
      padding: 80px;
    "
  >
    <div style="display: flex; color: #e8b04a; font-size: 28px">Unbored</div>
    <div style="display: flex; color: #f5d27a; font-size: 64px; margin-top: 16px; line-height: 1.1">
      {{ title }}
    </div>
    <div style="display: flex; font-size: 28px; margin-top: 24px; line-height: 1.35">
      {{ description }}
    </div>
  </div>
</template>
