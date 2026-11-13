<script setup lang="ts">
// Owned legacy requests are redirected by profession-redirect middleware before rendering.
useSeoMeta({ title: "Collection not found", robots: "noindex, nofollow" });
</script>
<template>
  <DsPage>
    <DsEmptyState
      :level="1"
      title="Collection not found"
      text="Open My page to choose one of your characters."
    >
      <DsButton to="/my">My page</DsButton>
    </DsEmptyState>
  </DsPage>
</template>
