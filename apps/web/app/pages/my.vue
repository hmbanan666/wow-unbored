<script setup lang="ts">
import { formatDay, MY_PAGE_COPY, type MyCharacter, type MyEntry } from "#shared/my-page";
import { SIGN_IN_COPY } from "#shared/sign-in";

type Me =
  | {
      ok: true;
      lang: "en" | "ru";
      characters: MyCharacter[];
      plans: MyEntry[];
      wins: MyEntry[];
    }
  | { ok: false; lang: "en" | "ru"; closed: boolean; message: string };

const { data } = await useFetch<Me>("/api/me");
const lang = computed(() => data.value?.lang || "en");
const copy = computed(() => MY_PAGE_COPY[lang.value]);
const signedOut = computed(() => {
  const page = data.value;
  if (!page || page.ok) return "";
  return (
    page.message ||
    (page.closed ? SIGN_IN_COPY[lang.value].closed : SIGN_IN_COPY[lang.value].missing)
  );
});

useSeoMeta({
  title: () => copy.value.title,
  robots: "noindex",
});
</script>

<template>
  <DsPage>
    <DsEmptyState
      v-if="signedOut || !data || !data.ok"
      :level="1"
      :title="copy.title"
      :text="signedOut"
    />
    <template v-else>
      <DsPageHeader :title="copy.title" />
      <p v-if="!data.characters.length">{{ copy.emptyCharacters }}</p>
      <DsCardGrid v-else>
        <DsCard
          v-for="character in data.characters"
          :key="`${character.realm}-${character.name}`"
          :eyebrow="[character.realm, character.className].filter(Boolean).join(' · ')"
          :title="character.name"
        >
          <DsChipRow>
            <DsChip v-if="character.level">{{ copy.level }} {{ character.level }}</DsChip>
            <DsChip v-if="character.ilvl" tone="gold">{{ copy.ilvl }} {{ character.ilvl }}</DsChip>
            <DsChip v-if="character.keystone" tone="gold"
              >{{ copy.keystone }} +{{ character.keystone }}</DsChip
            >
            <DsChip v-for="faction in character.renown" :key="faction.name"
              >{{ copy.renown }} {{ faction.level }} · {{ faction.name }}</DsChip
            >
          </DsChipRow>
        </DsCard>
      </DsCardGrid>
      <DsSection :title="copy.plans">
        <p v-if="!data.plans.length" class="ds-meta">{{ copy.emptyPlans }}</p>
        <DsProse v-else>
          <ul>
            <li v-for="plan in data.plans" :key="`${plan.at}-${plan.title}`">
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
            <li v-for="win in data.wins" :key="`${win.at}-${win.title}`">
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
