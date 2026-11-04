<script setup lang="ts">
const props = defineProps<{ open: boolean; title: string; confirm: string; cancel: string }>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();
const dialog = ref<HTMLDialogElement>();
const titleId = useId();
watch(
  () => props.open,
  async (open) => {
    await nextTick();
    if (open) dialog.value?.showModal();
    else dialog.value?.close();
  },
);
</script>
<template>
  <dialog
    ref="dialog"
    class="ds-confirm"
    :aria-labelledby="titleId"
    @cancel.prevent="emit('cancel')"
  >
    <DsHeading :id="titleId" :level="2">{{ title }}</DsHeading>
    <slot />
    <DsActions>
      <DsButton variant="secondary" autofocus @click="emit('cancel')">{{ cancel }}</DsButton>
      <DsButton @click="emit('confirm')">{{ confirm }}</DsButton>
    </DsActions>
  </dialog>
</template>
<style scoped>
.ds-confirm {
  width: min(var(--container-narrow), calc(100% - var(--gutter) * 2));
  max-height: calc(100% - var(--gutter) * 2);
  overflow: auto;
  padding: var(--space-5);
  border: 1px solid var(--lamp-line);
  border-radius: var(--radius-lg);
  background: var(--lamp-bg);
  color: var(--lamp-text);
  box-shadow: var(--shadow-card);
}
.ds-confirm::backdrop {
  background: var(--lamp-surface);
}
.ds-confirm > * + * {
  margin-top: var(--space-4);
}
</style>
