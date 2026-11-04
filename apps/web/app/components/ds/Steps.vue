<script setup lang="ts">
/** Numbered how-to steps with a gold number, title and text. */
defineProps<{ steps: { title: string; text?: string }[] }>();
</script>

<template>
  <ol class="ds-steps">
    <li v-for="(step, index) in steps" :key="step.title" class="ds-steps__step">
      <span class="ds-steps__n" aria-hidden="true">{{ index + 1 }}</span>
      <div>
        <strong class="ds-steps__title">{{ step.title }}</strong>
        <p v-if="step.text || $slots[`step-${index}`]">
          <slot :name="`step-${index}`">{{ step.text }}</slot>
        </p>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.ds-steps {
  display: grid;
  gap: var(--space-5);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ds-steps__step {
  display: grid;
  grid-template-columns: 2.25rem minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
}

.ds-steps__n {
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: var(--radius-pill);
  background: var(--lamp-gold-gradient);
  color: var(--lamp-deep);
  font-family: var(--font-ui);
  font-weight: 700;
}

.ds-steps__title {
  display: block;
  margin-bottom: var(--space-1);
  color: var(--lamp-gold-light);
  font-family: var(--font-display);
  font-size: var(--text-lg);
  line-height: var(--leading-snug);
}
</style>
