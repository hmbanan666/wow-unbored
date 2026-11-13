<script setup lang="ts">
import { computed } from "vue";
import type { CharacterPage } from "#shared/character-page";
import { professionSlug } from "#shared/profession-album";
import { useTodayHints } from "../composables/useTodayHints";
const props = defineProps<{ character: CharacterPage }>();
defineEmits<{ retry: [] }>();
const { done } = useTodayHints(() => props.character.today ?? []);
const entries = computed(() =>
  (props.character.today ?? []).flatMap((set) => {
    const profession = props.character.professions.find((p) => p.skillLine === set.skillLine);
    const goal = set.goals.find((g) => !done(set, g));
    return profession && goal
      ? [
          {
            skillLine: set.skillLine,
            title: goal.title,
            name: set.profession,
            href: profession.total
              ? `/${props.character.game}/professions/${professionSlug(profession)}`
              : null,
          },
        ]
      : [];
  }),
);
</script>
<template>
  <DsSection title="Today">
    <p v-if="character.today === null">
      Bory could not check today's steps just now.
      <DsButton variant="secondary" @click="$emit('retry')">Try again</DsButton>
    </p>
    <ul v-else-if="entries.length" class="today-strip">
      <li v-for="entry in entries" :key="entry.skillLine">
        <NuxtLink v-if="entry.href" :to="entry.href"
          ><strong>{{ entry.name }}</strong
          ><span>{{ entry.title }}</span
          ><span aria-hidden="true">→</span></NuxtLink
        >
        <div v-else class="unlinked-goal">
          <strong>{{ entry.name }}</strong
          ><span>{{ entry.title }}</span>
        </div>
      </li>
    </ul>
    <p v-else>No open steps right now. Open a profession collection to see what's next.</p>
  </DsSection>
</template>
<style scoped>
.today-strip {
  list-style: none;
  padding: 0;
  margin: 0;
}
a,
.unlinked-goal {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  padding: 0.85rem 0;
  border-bottom: 1px solid var(--lamp-line);
}
strong {
  color: var(--lamp-gold);
}
span {
  color: var(--lamp-muted);
}
</style>
