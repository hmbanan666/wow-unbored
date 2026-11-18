<script setup lang="ts">
defineProps<{ signedIn: boolean }>();
</script>
<template>
  <details class="settings" id="settings">
    <summary>Settings</summary>
    <p>
      <NuxtLink to="/install#sign-in">How to sign in</NuxtLink> ·
      <NuxtLink to="/install">Install Bory</NuxtLink>
    </p>
    <template v-if="signedIn">
      <PhoneSignIn />
      <FeedControls />
    </template>
  </details>
</template>
<style scoped>
.settings {
  margin-top: var(--space-6);
  padding-block: var(--space-3);
  border-top: 1px solid var(--lamp-line-soft);
}
summary {
  cursor: pointer;
}
summary {
  color: var(--lamp-muted);
  min-height: var(--tap);
  align-content: center;
  font-family: var(--font-ui);
}
.settings p {
  margin-block: var(--space-3);
}
</style>
