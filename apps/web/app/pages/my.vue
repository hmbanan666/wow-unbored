<script setup lang="ts">
import { SIGN_IN_COPY } from "#shared/sign-in";

type Me = { ok: true; lang: "en" | "ru" } | { ok: false; lang: "en" | "ru"; closed: boolean };

const { data } = await useFetch<Me>("/api/me");
const lang = computed(() => data.value?.lang || "en");
const line = computed(() => {
  const page = data.value;
  if (page?.ok) return SIGN_IN_COPY[lang.value].here;
  return page?.closed ? SIGN_IN_COPY[lang.value].closed : SIGN_IN_COPY[lang.value].missing;
});

useSeoMeta({
  title: "My page",
  robots: "noindex",
});
</script>

<template>
  <PageView :page="null" :message="line" />
</template>
