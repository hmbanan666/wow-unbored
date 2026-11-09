<script setup lang="ts">
import {
  FOREVER_TITLE as title,
  FOREVER_DESCRIPTION as description,
  type foreverHub,
  publicationDate,
  displayPublicationDate,
} from "#shared/forever-hub";
import { FOREVER_DATES } from "#shared/forever-dates";

defineProps<{ hub: ReturnType<typeof foreverHub>; unavailable: boolean }>();
defineEmits<{ refresh: [] }>();
</script>

<template>
  <DsPage width="wide" class="forever-hub">
    <DsPageHeader
      :trail="[
        { label: 'Home', to: '/' },
        { label: 'WoW Forever', to: '/forever' },
      ]"
      :title="title"
      :lead="description"
    />
    <DsProse class="hub-intro" data-hub-copy>
      <p>
        Level 60 is the cap in WoW Forever, a permanent game alongside modern WoW and Classic, set
        on the original continents after Warcraft III Reforged: Forsaken Kingdom and before Molten
        Core. Its additions include more than 1,000 quests, the Skyborne race, camping and the
        Legacy System, with guides below for your first character, class choice and early gold.
      </p>
      <p>
        The Legacy System offers account-wide challenges, perks and rewards, and Blizzard says all
        character advantages can be unlocked on one character. Start with a character you want to
        keep playing. You can explore another class later without treating it as a requirement for
        getting started.
        <a :href="FOREVER_DATES.entries[1].url">Blizzard's overview of Forever</a> explains the
        world and its new systems.
      </p>
    </DsProse>
    <div v-if="unavailable" class="hub-state" role="status">
      <p>The guides could not be loaded. Try again in a minute.</p>
      <DsButton @click="$emit('refresh')">Try again</DsButton>
    </div>
    <template v-else>
      <DsSection v-if="hub.start.length" title="Start here">
        <DsProse data-hub-copy>
          <p>
            At the first login, choose Enhanced if you want Blizzard's suggested starting settings.
            Choose Classic if you prefer its traditional presentation, then change individual
            settings in Game Menu &gt; Options when you need to. Open the beginner guide for the
            first decisions, or go straight to Enhanced vs Classic for the settings behind that
            choice.
          </p>
        </DsProse>
        <CatalogGrid :pages="hub.start" empty="" />
      </DsSection>
      <DsSection title="Key dates" data-hub-copy>
        <p class="ds-meta">
          Sources checked
          <time :datetime="FOREVER_DATES.checked">{{ FOREVER_DATES.checkedLabel }}</time
          >.
        </p>
        <dl class="hub-dates">
          <div v-for="date in FOREVER_DATES.entries" :key="date.title">
            <dt>{{ date.title }}</dt>
            <dd>
              <p>{{ date.text }}</p>
              <a :href="date.url">{{ date.source }}</a>
            </dd>
          </div>
        </dl>
      </DsSection>
      <DsSection
        v-for="group in hub.groups"
        :key="group.group"
        :title="group.title"
        :data-guide-group="group.group"
      >
        <DsProse data-hub-copy
          ><p>{{ group.intro }}</p></DsProse
        >
        <CatalogGrid :pages="group.pages" empty="" />
      </DsSection>
      <DsSection v-if="hub.ungrouped.length" title="More guides">
        <CatalogGrid :pages="hub.ungrouped" empty="" />
      </DsSection>
      <p v-if="!hub.listed.length" class="hub-state">
        The first WoW Forever guides are on their way.
      </p>
      <DsSection v-if="hub.recent.length" title="Recently updated">
        <ul class="hub-recent">
          <li v-for="page in hub.recent" :key="page.slug">
            <NuxtLink :to="page.href">{{ page.title }}</NuxtLink>
            <time :datetime="publicationDate(page.updatedAt!)">{{
              displayPublicationDate(page.updatedAt!)
            }}</time>
          </li>
        </ul>
      </DsSection>
    </template>
  </DsPage>
</template>

<style scoped>
.forever-hub {
  overflow-wrap: anywhere;
}
.hub-state {
  padding: var(--space-5);
  border: 1px solid var(--lamp-line-soft);
}
.forever-hub :deep(.ds-section > .ds-prose) {
  margin-bottom: var(--space-4);
}
.hub-intro {
  margin-top: var(--space-5);
}
.hub-dates {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-5);
  margin-top: var(--space-4);
}
.hub-dates > div {
  padding: var(--space-4);
  border: 1px solid var(--lamp-line-soft);
  border-radius: var(--radius-md);
}
.hub-dates dt {
  font-weight: 700;
}
.hub-dates dd {
  margin: 0;
}
.hub-dates p {
  margin-block: var(--space-3);
}
.hub-dates a {
  display: inline-flex;
  align-items: center;
  min-height: var(--tap);
  text-decoration: underline;
}
.hub-recent {
  list-style: none;
  padding: 0;
  display: grid;
  gap: var(--space-4);
}
.hub-recent li {
  display: flex;
  justify-content: space-between;
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-3);
}
.hub-recent a {
  display: flex;
  align-items: center;
  min-height: var(--tap);
  text-decoration: underline;
}
.hub-recent time {
  flex-shrink: 0;
  color: var(--lamp-muted);
}
@media (min-width: 48rem) {
  .hub-dates {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .hub-recent li {
    flex-direction: row;
    align-items: center;
  }
}
</style>
