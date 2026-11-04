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
  <main class="page">
    <div class="portrait" aria-hidden="true">
      <img class="bory" src="/bory.png" alt="" />
      <img src="/bory-frame.png" alt="" />
    </div>
    <h1>{{ copy.title }}</h1>
    <p v-if="signedOut">{{ signedOut }}</p>
    <template v-else-if="data && data.ok">
      <p v-if="!data.characters.length">{{ copy.emptyCharacters }}</p>
      <article
        v-for="character in data.characters"
        :key="`${character.realm}-${character.name}`"
        class="character"
      >
        <h2>{{ character.name }}</h2>
        <p class="meta">
          {{ character.realm
          }}<template v-if="character.className"> · {{ character.className }}</template>
        </p>
        <ul class="facts">
          <li v-if="character.level">{{ copy.level }} {{ character.level }}</li>
          <li v-if="character.ilvl">{{ copy.ilvl }} {{ character.ilvl }}</li>
          <li v-if="character.keystone">{{ copy.keystone }} +{{ character.keystone }}</li>
          <li v-for="faction in character.renown" :key="faction.name">
            {{ copy.renown }} {{ faction.level }} · {{ faction.name }}
          </li>
        </ul>
      </article>
      <h2>{{ copy.plans }}</h2>
      <p v-if="!data.plans.length">{{ copy.emptyPlans }}</p>
      <ul v-else>
        <li v-for="plan in data.plans" :key="`${plan.at}-${plan.title}`">
          {{ formatDay(plan.at) }} · {{ plan.character }} · {{ plan.title }}
        </li>
      </ul>
      <h2>{{ copy.wins }}</h2>
      <p v-if="!data.wins.length">{{ copy.emptyWins }}</p>
      <ul v-else>
        <li v-for="win in data.wins" :key="`${win.at}-${win.title}`">
          {{ formatDay(win.at) }} · {{ win.character }} · {{ win.title }}
        </li>
      </ul>
    </template>
  </main>
</template>
