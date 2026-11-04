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
  <nav class="breadcrumbs" aria-label="Breadcrumb">
    <ol>
      <li v-for="(crumb, index) in trail" :key="crumb.to">
        <NuxtLink v-if="index < trail.length - 1" :to="crumb.to">{{ crumb.label }}</NuxtLink>
        <span v-else aria-current="page">{{ crumb.label }}</span>
      </li>
    </ol>
  </nav>
</template>
