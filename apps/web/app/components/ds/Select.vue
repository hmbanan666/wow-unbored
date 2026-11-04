<script setup lang="ts">
const model = defineModel<string>({ required: true });
defineProps<{ label: string; options: { value: string; label: string }[]; disabled?: boolean }>();
const id = useId();
</script>
<template>
  <div class="ds-select">
    <label :for="id">{{ label }}</label>
    <select :id="id" v-model="model" :disabled="disabled">
      <option v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </div>
</template>
<style scoped>
.ds-select {
  display: grid;
  gap: var(--space-2);
  font-family: var(--font-ui);
}
.ds-select select {
  min-height: var(--tap);
  width: 100%;
  min-width: 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--lamp-line);
  border-radius: var(--radius-sm);
  background: var(--lamp-bg);
  color: var(--lamp-text);
  font: inherit;
}
</style>
