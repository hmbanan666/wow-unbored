<script setup lang="ts">
/** Site header: wordmark plus the main links. Below 768px the links fold into a Menu. */
const props = defineProps<{ links: readonly { label: string; to: string }[] }>();
const route = useRoute();
const menu = ref<HTMLDetailsElement | null>(null);

function current(to: string): boolean {
  return route.path === to || route.path.startsWith(`${to}/`);
}

watch(
  () => route.fullPath,
  () => {
    if (menu.value) menu.value.open = false;
  },
);
const items = computed(() => props.links);
</script>

<template>
  <header class="ds-nav">
    <DsContainer width="wide" class="ds-nav__bar">
      <NuxtLink class="ds-nav__wordmark" to="/">Unbored</NuxtLink>
      <nav class="ds-nav__links" aria-label="Main">
        <NuxtLink
          v-for="link in items"
          :key="link.to"
          :to="link.to"
          :aria-current="current(link.to) ? 'page' : undefined"
          >{{ link.label }}</NuxtLink
        >
      </nav>
      <details ref="menu" class="ds-nav__menu">
        <summary aria-label="Menu">
          <span class="ds-nav__burger" aria-hidden="true"><span /></span>
          <span>Menu</span>
        </summary>
        <nav class="ds-nav__panel" aria-label="Main">
          <NuxtLink
            v-for="link in items"
            :key="link.to"
            :to="link.to"
            :aria-current="current(link.to) ? 'page' : undefined"
            >{{ link.label }}</NuxtLink
          >
        </nav>
      </details>
    </DsContainer>
  </header>
</template>

<style scoped>
.ds-nav {
  position: relative;
  z-index: 10;
  border-bottom: 1px solid transparent;
  border-image: linear-gradient(90deg, transparent, var(--lamp-line), transparent) 1;
}

.ds-nav__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  min-height: 4rem;
}

.ds-nav__wordmark {
  display: inline-flex;
  align-items: center;
  min-height: var(--tap);
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 700;
  letter-spacing: 0.01em;
  text-decoration: none;
  background: var(--lamp-gold-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.ds-nav__links {
  display: none;
}

.ds-nav__links a,
.ds-nav__panel a {
  display: flex;
  align-items: center;
  min-height: var(--tap);
  min-width: var(--tap);
  color: var(--lamp-muted);
  font-family: var(--font-ui);
  font-size: var(--text-base);
  font-weight: 500;
  text-decoration: none;
}

.ds-nav__links a:hover,
.ds-nav__links a[aria-current="page"],
.ds-nav__panel a:hover,
.ds-nav__panel a[aria-current="page"] {
  color: var(--lamp-gold-light);
}

.ds-nav__links a[aria-current="page"] {
  box-shadow: inset 0 -2px 0 var(--lamp-gold);
}

.ds-nav__menu summary {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap);
  min-width: var(--tap);
  padding: 0 var(--space-3);
  border: 1px solid var(--lamp-line);
  border-radius: var(--radius-md);
  color: var(--lamp-gold-light);
  font-family: var(--font-ui);
  font-weight: 500;
  list-style: none;
  cursor: pointer;
}

.ds-nav__menu summary::-webkit-details-marker {
  display: none;
}

.ds-nav__burger,
.ds-nav__burger span,
.ds-nav__burger::before,
.ds-nav__burger::after {
  display: block;
  width: 1.1rem;
  height: 2px;
  border-radius: 2px;
  background: currentColor;
}

.ds-nav__burger {
  position: relative;
  background: transparent;
}

.ds-nav__burger::before,
.ds-nav__burger::after {
  content: "";
  position: absolute;
  left: 0;
}

.ds-nav__burger::before {
  top: -6px;
}

.ds-nav__burger::after {
  top: 6px;
}

.ds-nav__menu[open] .ds-nav__burger span {
  opacity: 0;
}

.ds-nav__menu[open] .ds-nav__burger::before {
  top: 0;
  transform: rotate(45deg);
}

.ds-nav__menu[open] .ds-nav__burger::after {
  top: 0;
  transform: rotate(-45deg);
}

.ds-nav__panel {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  display: grid;
  padding: var(--space-2) var(--gutter) var(--space-4);
  border-bottom: 1px solid var(--lamp-line);
  background: var(--lamp-bg);
  box-shadow: 0 18px 30px rgb(0 0 0 / 0.45);
}

.ds-nav__panel a {
  min-height: 48px;
  border-bottom: 1px solid var(--lamp-line-soft);
  font-size: var(--text-lg);
}

.ds-nav__panel a:last-child {
  border-bottom: 0;
}

@media (min-width: 768px) {
  .ds-nav__links {
    display: flex;
    gap: var(--space-5);
  }

  .ds-nav__menu {
    display: none;
  }
}
</style>
