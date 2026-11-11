<script setup lang="ts">
import { historyDay, moneyText, type HistoryChart } from "#shared/character-history";
const props = defineProps<{ chart: HistoryChart }>();
const model = computed(() => {
  const points = props.chart.points;
  const first = points[0]!,
    last = points.at(-1)!;
  let low = first.value,
    high = first.value;
  for (const p of points) {
    low = Math.min(low, p.value);
    high = Math.max(high, p.value);
  }
  const x = (at: number) => 160 + ((at - first.at) / Math.max(1, last.at - first.at)) * 520;
  const y = (value: number) => 170 - ((value - low) / Math.max(1, high - low)) * 135;
  return {
    first,
    last,
    low,
    high,
    path: points.map((p) => `${x(p.at)},${y(p.value)}`).join(" "),
    dots: points.map((p) => ({ ...p, x: x(p.at), y: y(p.value) })),
  };
});
const label = (v: number) => (props.chart.money ? moneyText(v) : String(v));
</script>
<template>
  <figure v-if="chart.points.length" class="history-chart">
    <figcaption>{{ chart.title }}</figcaption>
    <svg
      viewBox="0 0 720 220"
      role="img"
      :aria-label="`${chart.title}: ${label(model.first.value)} to ${label(model.last.value)}`"
    >
      <title>{{ chart.title }}</title>
      <path d="M160 25 V180 H690" fill="none" stroke="currentColor" opacity="0.4" />
      <text x="155" y="35" text-anchor="end">{{ label(model.high) }}</text>
      <text x="155" y="175" text-anchor="end">{{ label(model.low) }}</text>
      <text x="160" y="205">{{ historyDay(model.first.at) }}</text>
      <text x="680" y="205" text-anchor="end">{{ historyDay(model.last.at) }}</text>
      <polyline :points="model.path" fill="none" stroke="currentColor" stroke-width="2" />
      <circle v-for="p in model.dots" :key="p.at" :cx="p.x" :cy="p.y" r="3" fill="currentColor">
        <title>{{ historyDay(p.at) }}: {{ label(p.value) }}</title>
      </circle>
    </svg>
    <p>Latest: {{ label(model.last.value) }} · {{ historyDay(model.last.at) }} UTC</p>
  </figure>
</template>
<style scoped>
.history-chart {
  margin: 1.5rem 0;
}
figcaption {
  font-weight: 600;
}
svg {
  display: block;
  width: 100%;
  height: auto;
}
text {
  font-size: 11px;
  fill: currentColor;
}
p {
  font-size: 0.9rem;
}
</style>
