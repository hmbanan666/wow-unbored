<script setup lang="ts">
import { type foreverHub, publicationDate, displayPublicationDate } from "#shared/forever-hub";
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
      title="WoW Forever field guides"
      lead="Choose your first character, find a quest or learn a craft."
    />
    <div v-if="unavailable" class="hub-state" role="status">
      <p>The guides could not be loaded. Try again in a minute.</p>
      <DsButton @click="$emit('refresh')">Try again</DsButton>
    </div>
    <template v-else>
      <DsSection v-if="hub.start.length" title="Start here">
        <ul class="hub-start">
          <li v-for="page in hub.start" :key="page.href">
            <NuxtLink :to="page.href">{{ page.title }} <span aria-hidden="true">→</span></NuxtLink>
          </li>
        </ul>
      </DsSection>
      <div class="topic-spread">
        <section v-for="group in hub.groups" :key="group.group" :data-guide-group="group.group">
          <h2>{{ group.title }}</h2>
          <ul>
            <li v-for="page in group.pages" :key="page.href">
              <NuxtLink :to="page.href">{{ page.title }}</NuxtLink>
            </li>
          </ul>
        </section>
        <section v-if="hub.ungrouped.length">
          <h2>More guides</h2>
          <ul>
            <li v-for="page in hub.ungrouped" :key="page.href">
              <NuxtLink :to="page.href">{{ page.title }}</NuxtLink>
            </li>
          </ul>
        </section>
      </div>
      <p v-if="!hub.listed.length" class="hub-state">
        The first WoW Forever guides are on their way.
      </p>
    </template>
    <DsSection title="Recipes and quests">
      <DsCardGrid>
        <DsCard
          to="/forever/professions"
          title="Look up a recipe"
          text="Browse by profession to find materials and places to learn a craft."
        />
        <DsCard
          to="/forever/quests"
          title="Find a quest"
          text="Look up where players picked up a quest or turned it in."
        />
      </DsCardGrid>
    </DsSection>
    <DsSection v-if="!unavailable && hub.recent.length" title="Recently updated">
      <ul class="hub-recent">
        <li v-for="page in hub.recent" :key="page.slug">
          <NuxtLink :to="page.href">{{ page.title }}</NuxtLink>
          <time :datetime="publicationDate(page.updatedAt!)">{{
            displayPublicationDate(page.updatedAt!)
          }}</time>
        </li>
      </ul>
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
.hub-start {
  list-style: none;
  padding: 0 var(--space-4);
  background: var(--lamp-surface);
  border-left: 3px solid var(--lamp-gold-dark);
}
.hub-start li + li {
  border-top: 1px solid var(--lamp-line-soft);
}
.hub-start a {
  min-height: var(--tap);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-4);
  padding-block: var(--space-3);
  text-decoration: none;
  color: var(--lamp-text);
}
.hub-start a:hover {
  text-decoration: underline;
}
.hub-start span {
  color: var(--lamp-gold);
}
.topic-spread {
  display: grid;
  gap: var(--space-6);
  margin-top: var(--space-7);
}
.topic-spread section {
  padding-top: var(--space-4);
  border-top: 1px solid var(--lamp-line);
}
.topic-spread h2 {
  margin: 0;
  font: 700 var(--text-2xl)/1.2 var(--font-display);
}
.topic-spread ul {
  padding: 0;
  list-style: none;
  margin-top: var(--space-3);
}
.topic-spread a {
  display: flex;
  align-items: center;
  min-height: var(--tap);
  padding-block: var(--space-2);
}
@media (min-width: 640px) {
  .topic-spread {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
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
