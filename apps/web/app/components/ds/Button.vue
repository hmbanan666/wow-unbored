<script setup lang="ts">
/** A link that looks like a button. External https links open in a new tab. */
const props = withDefaults(
  defineProps<{
    to?: string;
    disabled?: boolean;
    /** Server routes such as downloads must bypass client navigation. */
    external?: boolean;
    variant?: "primary" | "secondary" | "ghost";
    block?: boolean;
  }>(),
  { variant: "primary" },
);
const NuxtLink = resolveComponent("NuxtLink");
const offsite = computed(() => /^https?:/.test(props.to || ""));
</script>

<template>
  <component
    :is="to ? NuxtLink : 'button'"
    :type="to ? undefined : 'button'"
    :disabled="disabled"
    :to="to"
    class="ds-button"
    :class="[`ds-button--${variant}`, { 'ds-button--block': block }]"
    :target="offsite ? '_blank' : undefined"
    :rel="offsite ? 'noopener' : undefined"
    :external="external || offsite"
  >
    <slot />
  </component>
</template>

<style scoped>
.ds-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: 48px;
  padding: 0 var(--space-5);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-family: var(--font-ui);
  font-size: var(--text-base);
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
  text-decoration: none;
  transition:
    filter 0.15s,
    border-color 0.15s,
    background-color 0.15s;
}

.ds-button:disabled {
  opacity: 0.6;
  cursor: wait;
}

.ds-button--primary {
  background: var(--lamp-gold-gradient);
  color: var(--lamp-deep);
  box-shadow: 0 6px 20px rgb(232 176 74 / 0.18);
}

.ds-button--primary:hover {
  color: var(--lamp-deep);
  filter: brightness(1.08);
}

.ds-button--secondary {
  border-color: var(--lamp-line);
  background: var(--lamp-surface);
  color: var(--lamp-gold-light);
}

.ds-button--secondary:hover {
  border-color: var(--lamp-gold);
}

.ds-button--ghost {
  min-height: var(--tap);
  padding: 0 var(--space-2);
  margin-left: calc(-1 * var(--space-2));
  color: var(--lamp-gold);
}

.ds-button--ghost:hover {
  color: var(--lamp-gold-light);
  text-decoration: underline;
}

.ds-button--block {
  width: 100%;
}

@media (min-width: 480px) {
  .ds-button--block {
    width: auto;
  }
}
</style>
