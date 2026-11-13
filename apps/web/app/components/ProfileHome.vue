<script setup lang="ts">
import { computed } from "vue";
import { type ProfileHome, PROFILE_COPY } from "#shared/profile-home";
import { characterHref } from "#shared/character-page";
import { historyDay, moneyText } from "#shared/character-history";
import { professionSlug, professionName } from "#shared/profession-album";
import { useTodayHints } from "../composables/useTodayHints";
const props = defineProps<{ character: ProfileHome }>();
defineEmits<{ retry: [] }>();
const hero = computed(() => props.character.hero);
const { done } = useTodayHints(() => props.character.today ?? []);
const next = computed(() => {
  for (const set of props.character.today ?? []) {
    const goal = set.goals.find((g) => !done(set, g));
    const profession = props.character.professions.find((p) => p.skillLine === set.skillLine);
    if (goal && profession) return { title: goal.title, href: href(profession) };
  }
  return null;
});
const href = (p: ProfileHome["professions"][number]) =>
  `/${props.character.game}/professions/${professionSlug(p)}`;
const number = (value: number) => value.toLocaleString("en-US");
const played = computed(() => {
  const hours = Math.floor((hero.value.played ?? 0) / 3600);
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
});
</script>
<template>
  <section class="profile-hero" aria-label="Character profile">
    <svg class="class-glyph" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="45" />
      <text x="50" y="64" text-anchor="middle">
        {{
          hero.className
            ?.split(/\s+/)
            .map((w) => w[0])
            .join("")
            .slice(0, 2) || "?"
        }}
      </text>
    </svg>
    <div class="identity">
      <h1>{{ character.name }}</h1>
      <p>{{ [hero.race, hero.className, hero.faction].filter(Boolean).join(" · ") }}</p>
      <DsChipRow
        ><DsChip tone="gold">{{ character.game === "forever" ? "Forever" : "Retail" }}</DsChip
        ><span class="realm">{{ character.realm }}</span></DsChipRow
      >
    </div>
    <div class="road">
      <span>{{ hero.cap ? `Road to ${hero.cap}` : "Level" }}</span>
      <div class="level">
        {{ hero.level ?? "—" }} <small v-if="hero.cap">/ {{ hero.cap }}</small>
      </div>
      <progress
        v-if="hero.cap && hero.level !== null"
        :value="hero.level"
        :max="hero.cap"
        :aria-label="`Road to ${hero.cap}`"
      />
      <p v-if="hero.level !== null && hero.cap && hero.level >= hero.cap">Level cap reached</p>
      <template v-else-if="hero.xp !== null && hero.xpMax && hero.xpMax > 0">
        <p>
          {{ number(hero.xp) }} / {{ number(hero.xpMax) }} XP ·
          {{ number(Math.max(0, hero.xpMax - hero.xp)) }} to next level
        </p>
        <progress
          class="xp"
          :value="hero.xp"
          :max="hero.xpMax"
          aria-label="Experience to next level"
        />
      </template>
      <p v-if="hero.rested !== null && hero.rested > 0">{{ number(hero.rested) }} rested XP</p>
    </div>
    <dl class="stats">
      <div>
        <dt>Played time</dt>
        <dd>{{ hero.played === null ? "Not seen yet" : played }}</dd>
      </div>
      <div>
        <dt>Item level</dt>
        <dd>{{ hero.ilvl ?? "Not seen yet" }}</dd>
      </div>
      <div>
        <dt>Gold</dt>
        <dd>{{ hero.money === null ? "Not seen yet" : moneyText(hero.money) }}</dd>
      </div>
    </dl>
    <div class="journey-block">
      <h2>Your journey</h2>
      <div
        v-if="character.journey.length"
        class="journey"
        tabindex="0"
        role="region"
        aria-label="Your journey, oldest to newest"
      >
        <ol>
          <li v-for="(stop, i) in character.journey" :key="`${stop.at}-${i}`">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="7" />
              <path v-if="stop.kind === 'level'" d="m8 13 4-4 4 4M12 9v8" />
            </svg>
            <strong>{{ stop.label }}</strong
            ><time :datetime="historyDay(stop.at)">{{ historyDay(stop.at) }}</time>
          </li>
        </ol>
      </div>
      <p v-else>Your next milestones will appear here after you play and sync.</p>
    </div>
    <div class="what-next">
      <strong>What next</strong>
      <NuxtLink v-if="next" :to="next.href"
        >{{ next.title }} <span aria-hidden="true">→</span></NuxtLink
      >
      <span v-else-if="character.today === null"
        >Bory could not check today's steps just now.
        <button type="button" @click="$emit('retry')">Try again</button></span
      >
      <span v-else>{{ PROFILE_COPY.fallback }}</span>
    </div>
  </section>
  <DsSection title="Professions">
    <DsCardGrid v-if="character.professions.length">
      <DsCard
        v-for="p in character.professions"
        :key="p.skillLine"
        :title="professionName(p)"
        :to="href(p)"
      >
        <p class="skill">
          {{ p.skill ?? "—" }} <span>/ {{ p.max ?? "—" }} skill</span>
        </p>
        <progress
          v-if="p.max && p.skill !== null"
          :value="p.skill"
          :max="p.max"
          :aria-label="`${professionName(p)} skill`"
        />
        <p>
          {{
            p.known === null
              ? "Open this profession in the game once"
              : `${number(p.known)} known${p.total === null ? " · recipe total not seen yet" : ` of ${number(p.total)}`}`
          }}
        </p>
      </DsCard>
    </DsCardGrid>
    <p v-else>{{ PROFILE_COPY.fallback }}</p>
  </DsSection>
  <TodayStrip :character="character" @retry="$emit('retry')" />
  <DsActions
    ><DsButton :to="`${characterHref(character)}/history`" variant="secondary"
      >Character history</DsButton
    ></DsActions
  >
</template>
<style scoped>
.profile-hero {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--space-5);
  margin-top: var(--space-5);
  padding: var(--space-5);
  border: 1px solid var(--lamp-line);
  border-radius: 1.375rem;
  background: linear-gradient(135deg, var(--lamp-glow), var(--lamp-bg) 65%, var(--lamp-burgundy));
  box-shadow: var(--shadow-card);
}
h1,
h2,
p {
  margin: 0;
}
h1 {
  font-size: var(--text-3xl);
  color: var(--lamp-gold-light);
}
h2 {
  font-size: var(--text-lg);
  margin-bottom: var(--space-4);
}
p,
.realm,
dt,
time,
.road > span {
  color: var(--lamp-muted);
  font: 500 var(--text-sm)/1.5 var(--font-ui);
}
.identity {
  min-width: 0;
  overflow-wrap: anywhere;
}
.identity p {
  margin-block: var(--space-2);
}
.class-glyph {
  width: 4.5rem;
  height: 4.5rem;
  color: var(--lamp-gold-light);
  filter: drop-shadow(0 0 10px var(--lamp-burgundy));
}
.class-glyph circle {
  fill: var(--lamp-bg);
  stroke: var(--lamp-gold);
  stroke-width: 2;
}
.class-glyph text {
  fill: currentColor;
  font: 700 40px var(--font-display);
}
.road,
.stats,
.journey-block,
.what-next {
  grid-column: 1 / -1;
  min-width: 0;
}
.level {
  font: 700 2.75rem/1.2 var(--font-ui);
  color: var(--lamp-gold-light);
}
.level small {
  font-size: var(--text-base);
  color: var(--lamp-muted);
}
progress {
  display: block;
  width: 100%;
  height: 0.6rem;
  margin-block: var(--space-2);
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--lamp-bg);
  overflow: hidden;
}
progress::-webkit-progress-bar {
  background: var(--lamp-bg);
}
progress::-webkit-progress-value {
  background: linear-gradient(90deg, var(--lamp-burgundy), var(--lamp-gold));
  border-radius: var(--radius-pill);
}
progress::-moz-progress-bar {
  background: var(--lamp-gold);
}
.xp {
  height: 0.25rem;
}
.stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4) var(--space-6);
  margin: 0;
  padding-block: var(--space-4);
  border-block: 1px solid var(--lamp-line-soft);
}
dd {
  margin: 0;
  color: var(--lamp-text);
  font: 700 var(--text-lg)/1.5 var(--font-ui);
}
.journey {
  overflow-x: auto;
  padding-bottom: var(--space-3);
}
.journey ol {
  display: flex;
  list-style: none;
  padding: 0;
  width: max-content;
}
.journey li {
  position: relative;
  width: 9rem;
  padding-inline: var(--space-2);
  text-align: center;
  font: 500 var(--text-sm)/1.3 var(--font-ui);
}
.journey li::before {
  content: "";
  position: absolute;
  top: 12px;
  left: 0;
  width: 100%;
  height: 1px;
  background: var(--lamp-gold-dark);
}
.journey li:first-child::before {
  left: 50%;
  width: 50%;
}
.journey li:last-child::before {
  width: 50%;
}
.journey li:only-child::before {
  display: none;
}
.journey svg {
  position: relative;
  width: 24px;
  height: 24px;
  fill: var(--lamp-gold);
  stroke: var(--lamp-bg);
}
.journey strong,
time {
  display: block;
  overflow-wrap: anywhere;
}
.journey strong {
  min-height: 2.7em;
  margin-block: var(--space-2);
}
.what-next {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  padding: var(--space-4);
  border: 1px solid var(--lamp-gold-dark);
  border-radius: var(--radius-md);
  background: var(--lamp-surface);
  font-family: var(--font-ui);
}
.what-next > strong {
  color: var(--lamp-gold);
}
.what-next button {
  min-height: var(--tap);
  background: var(--lamp-bg);
  color: var(--lamp-gold);
  border: 1px solid var(--lamp-line);
  border-radius: var(--radius-sm);
}
.skill {
  color: var(--lamp-gold-light);
  font-size: var(--text-xl);
  font-weight: 700;
}
.skill span {
  color: var(--lamp-muted);
  font-size: var(--text-sm);
  font-weight: 500;
}
@media (min-width: 1024px) {
  .profile-hero {
    grid-template-columns: auto minmax(0, 1fr) minmax(15rem, 20rem);
  }
  .road {
    grid-column: auto;
  }
  .class-glyph {
    width: 6rem;
    height: 6rem;
  }
}
</style>
