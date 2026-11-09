<script lang="ts">
// Used only by mounted interactions; no state is shared between server requests.
let dismissActive: (() => void) | undefined;
</script>
<script setup lang="ts">
defineProps<{ fallbackHref?: string }>();
const mounted = ref(false);
const id = useId();
const root = ref<HTMLElement>();
const trigger = ref<HTMLElement>();
const panel = ref<HTMLElement>();
const fine = ref(false);
const open = ref(false);
const position = ref({ left: "16px", top: "16px", maxHeight: "calc(100dvh - 32px)" });
let opening: ReturnType<typeof setTimeout> | undefined;
let closing: ReturnType<typeof setTimeout> | undefined;
let query: MediaQueryList | undefined;
let keyboard = false;

function cancelTimers() {
  clearTimeout(opening);
  clearTimeout(closing);
}
function close() {
  cancelTimers();
  open.value = false;
  if (dismissActive === close) dismissActive = undefined;
}
async function show() {
  cancelTimers();
  dismissActive?.();
  dismissActive = close;
  open.value = true;
  position.value.maxHeight = "calc(100dvh - 32px)";
  await nextTick();
  if (!open.value || !trigger.value || !panel.value) return;
  const anchor = trigger.value.getBoundingClientRect();
  const box = panel.value.getBoundingClientRect();
  const gutter = 16,
    gap = 8;
  const below = window.innerHeight - anchor.bottom - gutter - gap;
  const above = anchor.top - gutter - gap;
  const flip = box.height > below && above > below;
  const height = Math.min(box.height, Math.max(0, flip ? above : below));
  position.value = {
    left: `${Math.max(gutter, Math.min(anchor.left, document.documentElement.clientWidth - box.width - gutter))}px`,
    top: `${Math.max(gutter, flip ? anchor.top - gap - height : anchor.bottom + gap)}px`,
    maxHeight: `${Math.max(0, flip ? above : below)}px`,
  };
}
function keepOpen() {
  clearTimeout(closing);
}
function enter() {
  clearTimeout(closing);
  if (fine.value && !open.value) opening = setTimeout(show, 120);
}
function leave() {
  clearTimeout(opening);
  if (fine.value && document.activeElement !== trigger.value) closing = setTimeout(close, 120);
}
function blur() {
  closing = setTimeout(close, 120);
}
function outside(event: Event) {
  keyboard = false;
  if (!root.value?.contains(event.target as Node)) close();
}
function key(event: KeyboardEvent) {
  if (event.key === "Tab") keyboard = true;
  if (event.key === "Escape") close();
}
function scroll(event: Event) {
  if (!panel.value?.contains(event.target as Node)) close();
}
function inputChanged() {
  close();
  fine.value = query?.matches ?? false;
}
onMounted(() => {
  mounted.value = true;
  query = window.matchMedia("(hover: hover) and (pointer: fine)");
  const focused = document.activeElement === trigger.value;
  fine.value = query.matches;
  if (focused) nextTick(() => trigger.value?.focus());
  query.addEventListener("change", inputChanged);
  document.addEventListener("pointerdown", outside);
  document.addEventListener("keydown", key);
  window.addEventListener("resize", close);
  document.addEventListener("scroll", scroll, true);
});
onBeforeUnmount(() => {
  close();
  query?.removeEventListener("change", inputChanged);
  document.removeEventListener("pointerdown", outside);
  document.removeEventListener("keydown", key);
  window.removeEventListener("resize", close);
  document.removeEventListener("scroll", scroll, true);
});
</script>

<template>
  <span ref="root" class="ds-tooltip">
    <component
      :is="!mounted && fallbackHref ? 'a' : fine ? 'span' : 'button'"
      :href="!mounted ? fallbackHref : undefined"
      ref="trigger"
      class="ds-tooltip__trigger"
      :type="(!mounted && fallbackHref) || fine ? undefined : 'button'"
      :tabindex="fine ? 0 : undefined"
      :aria-describedby="id"
      :aria-expanded="fine ? undefined : open"
      :aria-controls="fine ? undefined : id"
      @keydown.enter.prevent="open ? close() : show()"
      @keydown.space.prevent="open ? close() : show()"
      @mouseenter="enter"
      @mouseleave="leave"
      @focus="(fine || keyboard) && show()"
      @blur="blur()"
      @click="!fine && (open ? close() : show())"
      ><slot
    /></component>
    <span
      :id="id"
      ref="panel"
      class="ds-tooltip__panel"
      role="tooltip"
      :data-open="open"
      :style="position"
      @mouseenter="keepOpen"
      @mouseleave="leave"
    >
      <slot name="panel" :open="open" />
    </span>
  </span>
</template>

<style scoped>
.ds-tooltip {
  display: inline;
}
.ds-tooltip__trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  max-width: 100%;
  min-height: var(--tap);
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: inherit;
  vertical-align: middle;
  cursor: help;
  overflow-wrap: anywhere;
}
button.ds-tooltip__trigger {
  cursor: pointer;
}
.ds-tooltip__panel {
  position: fixed;
  z-index: 30;
  display: block;
  width: 20rem;
  max-width: calc(100vw - 32px);
  overflow: auto;
  overscroll-behavior: contain;
  padding: var(--space-4);
  border: 1px solid var(--lamp-gold-dark);
  border-radius: var(--radius-md);
  background: var(--lamp-bg);
  box-shadow: var(--shadow-card);
  color: var(--lamp-text);
  font-family: var(--font-body);
  font-size: var(--text-base);
  font-weight: 400;
  line-height: var(--leading-snug);
  text-align: left;
  visibility: hidden;
  pointer-events: none;
  overflow-wrap: anywhere;
}
.ds-tooltip__panel[data-open="true"] {
  visibility: visible;
  pointer-events: auto;
}
.ds-tooltip__panel:has(.ds-game-tooltip__art) {
  background: var(--render-bg);
}
</style>
