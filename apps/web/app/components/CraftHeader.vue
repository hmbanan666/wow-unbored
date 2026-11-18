<script setup lang="ts">
defineProps<{ title: string; eyebrow: string; lead?: string }>();
</script>
<template>
  <div class="craft-header">
    <DsPageHeader :title="title" :eyebrow="eyebrow" :lead="lead" />
    <span class="drafting" aria-hidden="true"><i class="arc" /><i class="hinge" /></span>
  </div>
</template>
<style scoped>
.craft-header {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border-block: 1px solid var(--lamp-line);
  padding: var(--space-5) clamp(4.4rem, 18%, 10rem) var(--space-5) var(--space-4);
  margin-block: var(--space-2) var(--space-5);
  background: linear-gradient(104deg, var(--lamp-glow) 30%, #2d2117 72%, #392a1a);
}
.craft-header :deep(.ds-page-header) {
  margin: 0;
}
.drafting {
  position: absolute;
  inset: 0 0 0 auto;
  width: clamp(4.1rem, 16%, 9rem);
  z-index: -1;
  background-image:
    linear-gradient(90deg, transparent 95%, #c9a26124 95%),
    linear-gradient(0deg, transparent 95%, #c9a26124 95%);
  background-size: 16px 16px;
  mask-image: linear-gradient(90deg, transparent, #000 20%);
  color: #cfa45e;
}
.arc,
.hinge {
  position: absolute;
  display: block;
}
.arc {
  width: 78%;
  aspect-ratio: 1;
  top: 50%;
  left: 50%;
  border: 1px dashed currentColor;
  border-radius: 50%;
  transform: translate(-50%, -36%);
  opacity: 0.55;
}
.hinge {
  left: 51%;
  top: 25%;
  width: 9px;
  height: 9px;
  border: 2px solid currentColor;
  border-radius: 50%;
}
.hinge::before,
.hinge::after {
  content: "";
  position: absolute;
  top: 5px;
  left: 1px;
  width: 3px;
  height: clamp(2.4rem, 5vw, 4.5rem);
  background: linear-gradient(#e6c583, #9f7950);
  transform-origin: top;
}
.hinge::before {
  transform: rotate(19deg);
}
.hinge::after {
  transform: rotate(-19deg);
}
@media (min-width: 768px) {
  .craft-header {
    padding-block: var(--space-6);
    padding-left: var(--space-6);
  }
}
</style>
