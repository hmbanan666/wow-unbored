<script setup lang="ts">
import {
  formatDay,
  MY_PAGE_COPY,
  type MyCharacter,
  type MyEntry,
  type MyCompletion,
} from "#shared/my-page";
import { characterHref, CHARACTER_COPY } from "#shared/character-page";
import { catalogHref } from "#shared/catalog";
import { SIGN_IN_COPY } from "#shared/sign-in";

type Me =
  | {
      ok: true;
      characters: MyCharacter[];
      plans: MyEntry[];
      wins: MyEntry[];
      completions: MyCompletion[];
    }
  | { ok: false; closed: boolean; message: string };

const { data, status, refresh } = await useFetch<Me>("/api/me", { server: false });
const paths = usePaths();
function activeFor(character: MyCharacter) {
  return paths.data.value?.characters.find(
    (row) =>
      (row.game ?? "retail") === character.game &&
      row.character === character.name &&
      row.realm === character.realm,
  )?.active;
}
const copy = MY_PAGE_COPY;
const signedOut = computed(() => {
  const page = data.value;
  if (!page || page.ok) return "";
  return page.message || (page.closed ? SIGN_IN_COPY.closed : SIGN_IN_COPY.missing);
});

useSeoMeta({
  title: copy.title,
  robots: "noindex",
});
</script>

<template>
  <DsPage>
    <DsEmptyState
      v-if="status === 'pending' || status === 'idle'"
      :level="1"
      :title="copy.title"
      :text="paths.copy.loading"
    />
    <DsEmptyState
      v-else-if="signedOut || !data || !data.ok"
      :level="1"
      :title="copy.title"
      :text="signedOut || paths.copy.failed"
      ><DsButton v-if="!data" @click="refresh()">{{ paths.copy.retry }}</DsButton></DsEmptyState
    >
    <template v-else>
      <DsPageHeader :title="copy.title" />
      <PhoneSignIn />
      <p v-if="!data.characters.length">{{ copy.emptyCharacters }}</p>
      <DsCardGrid v-else>
        <DsCard
          v-for="character in data.characters"
          :key="`${character.game}-${character.realm}-${character.name}`"
          :eyebrow="[character.realm, character.className].filter(Boolean).join(' · ')"
          :title="character.name"
        >
          <DsButton :to="characterHref(character)" variant="ghost">{{
            CHARACTER_COPY.view
          }}</DsButton>
          <DsChipRow>
            <DsChip v-if="character.game === 'forever'">Forever</DsChip>
            <DsChip v-if="character.level">{{ copy.level }} {{ character.level }}</DsChip>
            <DsChip v-if="character.ilvl" tone="gold">{{ copy.ilvl }} {{ character.ilvl }}</DsChip>
            <DsChip v-if="character.keystone" tone="gold"
              >{{ copy.keystone }} +{{ character.keystone }}</DsChip
            >
            <DsChip v-for="faction in character.renown" :key="faction.name"
              >{{ copy.renown }} {{ faction.level }} · {{ faction.name }}</DsChip
            >
          </DsChipRow>
          <p v-if="paths.loading.value" role="status">{{ paths.copy.loading }}</p>
          <template v-else-if="paths.message.value">
            <p role="status">{{ paths.message.value }}</p>
            <DsButton v-if="!paths.signedOut.value" @click="paths.refresh">{{
              paths.copy.retry
            }}</DsButton>
          </template>
          <template v-else-if="activeFor(character)">
            <DsButton
              :to="catalogHref(activeFor(character)!.kind, activeFor(character)!.slug)!"
              variant="ghost"
              >{{ paths.copy.active }}: {{ activeFor(character)!.title }}</DsButton
            >
            <DsProgress
              :done="activeFor(character)!.done"
              :total="activeFor(character)!.total"
              :label="paths.copy.required"
            />
          </template>
          <template v-else>
            <p>{{ paths.copy.none }}</p>
            <DsButton to="/paths" variant="ghost">{{ paths.copy.browse }}</DsButton>
          </template>
        </DsCard>
      </DsCardGrid>
      <DsSection :title="copy.completions">
        <p v-if="!data.completions.length">{{ copy.emptyCompletions }}</p>
        <DsCardGrid v-else>
          <DsCard
            v-for="entry in data.completions"
            :key="`${entry.game}-${entry.at}-${entry.character}-${entry.href}-${entry.version}`"
            :to="entry.href"
            :title="entry.title"
            :eyebrow="`${formatDay(entry.at)} · ${entry.character} · ${entry.realm}`"
          />
        </DsCardGrid>
      </DsSection>
      <DsSection :title="copy.plans">
        <p v-if="!data.plans.length" class="ds-meta">{{ copy.emptyPlans }}</p>
        <DsProse v-else>
          <ul>
            <li v-for="plan in data.plans" :key="`${plan.game}-${plan.at}-${plan.title}`">
              <span class="ds-meta">{{ formatDay(plan.at) }} · {{ plan.character }}</span
              ><br />
              {{ plan.title }}
            </li>
          </ul>
        </DsProse>
      </DsSection>
      <DsSection :title="copy.wins">
        <p v-if="!data.wins.length" class="ds-meta">{{ copy.emptyWins }}</p>
        <DsProse v-else>
          <ul>
            <li v-for="win in data.wins" :key="`${win.game}-${win.at}-${win.title}`">
              <span class="ds-meta">{{ formatDay(win.at) }} · {{ win.character }}</span
              ><br />
              {{ win.title }}
            </li>
          </ul>
        </DsProse>
      </DsSection>
    </template>
  </DsPage>
</template>
