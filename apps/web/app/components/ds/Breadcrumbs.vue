<script setup lang="ts">
/** Visible trail plus BreadcrumbList structured data. The last crumb is this page. */
const props = defineProps<{ trail: { label: string; to: string }[] }>();

useSchemaOrg([
  defineBreadcrumb({
    itemListElement: props.trail.map((crumb) => ({ name: crumb.label, item: crumb.to })),
  }),
]);
</script>

<template>
  <nav class="ds-crumbs" aria-label="Breadcrumb">
    <ol>
      <li v-for="(crumb, index) in trail" :key="crumb.to">
        <NuxtLink v-if="index < trail.length - 1" :to="crumb.to">{{ crumb.label }}</NuxtLink>
        <span v-else aria-current="page">{{ crumb.label }}</span>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.ds-crumbs ol {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: var(--space-2);
  margin: 0 0 var(--space-3);
  padding: 0;
  list-style: none;
  color: var(--lamp-muted);
  font-family: var(--font-ui);
  font-size: var(--text-sm);
}

.ds-crumbs li {
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

.ds-crumbs li + li::before {
  content: "›";
  margin-right: var(--space-2);
  color: var(--lamp-gold-dark);
}

.ds-crumbs a {
  display: inline-flex;
  align-items: center;
  min-height: var(--tap);
  min-width: var(--tap);
  justify-content: center;
  color: var(--lamp-muted);
  text-decoration: none;
}

.ds-crumbs li:first-child a {
  justify-content: flex-start;
}

.ds-crumbs a:hover {
  color: var(--lamp-gold-light);
}

/* On phones the H1 right below names this page, so the trail stops at its section. */
@media (max-width: 639px) {
  .ds-crumbs li:last-child {
    display: none;
  }
}

.ds-crumbs [aria-current="page"] {
  overflow: hidden;
  max-width: 16rem;
  color: var(--lamp-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
