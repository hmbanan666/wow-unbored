<script setup lang="ts">
import qrcode from "qrcode-generator";
import { PHONE_COPY as copy, type PhoneLink } from "#shared/phone-link";

const opened = ref(false);
const loading = ref(false);
const link = ref<Extract<PhoneLink, { ok: true }> | null>(null);
const message = ref("");
const copied = ref("");
const expired = ref(false);
let expiry: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(expiry));
const qr = computed(() => {
  if (!link.value || expired.value) return null;
  const code = qrcode(0, "M");
  code.addData(link.value.url);
  code.make();
  const count = code.getModuleCount();
  const cells: string[] = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (code.isDark(row, col)) cells.push(`M${col + 4},${row + 4}h1v1h-1z`);
    }
  }
  return { size: count + 8, path: cells.join("") };
});
async function open() {
  if (loading.value) return;
  opened.value = true;
  loading.value = true;
  message.value = "";
  copied.value = "";
  link.value = null;
  expired.value = false;
  clearTimeout(expiry);
  try {
    const result = await $fetch<PhoneLink>("/api/me/page-link", {
      method: "POST",
      body: {},
      cache: "no-store",
    });
    if (result.ok) {
      link.value = result;
      expiry = setTimeout(
        () => {
          expired.value = true;
          link.value = null;
          copied.value = "";
        },
        Math.max(0, result.expiresAt * 1000 - Date.now()),
      );
    } else message.value = result.message;
  } catch {
    message.value = copy.failed;
  } finally {
    loading.value = false;
  }
}
async function copyLink() {
  if (!link.value) return;
  try {
    await navigator.clipboard.writeText(link.value.url);
    copied.value = copy.copied;
  } catch {
    copied.value = copy.copyFailed;
  }
}
function close() {
  clearTimeout(expiry);
  opened.value = false;
  link.value = null;
}
</script>

<template>
  <div class="phone-sign-in">
    <DsButton v-if="!opened" @click="open">{{ copy.open }}</DsButton>
    <section v-else aria-label="Open on phone">
      <p v-if="loading" role="status">{{ copy.loading }}</p>
      <p v-else-if="message || expired" role="status">{{ expired ? copy.expired : message }}</p>
      <template v-if="link && qr">
        <p>{{ copy.scan }}</p>
        <svg
          role="img"
          aria-label="Scan to sign in on your phone"
          :viewBox="`0 0 ${qr.size} ${qr.size}`"
          xmlns="http://www.w3.org/2000/svg"
          shape-rendering="crispEdges"
        >
          <rect width="100%" height="100%" fill="white" />
          <path :d="qr.path" fill="black" />
        </svg>
        <p>{{ copy.expires }}</p>
        <label
          >{{ copy.link
          }}<input
            :value="link.url"
            readonly
            spellcheck="false"
            @focus="($event.target as HTMLInputElement).select()"
        /></label>
        <DsButton @click="copyLink">{{ copy.copy }}</DsButton>
        <p v-if="copied" role="status">{{ copied }}</p>
      </template>
      <DsButton v-if="!loading" variant="ghost" @click="open">{{ copy.fresh }}</DsButton>
      <DsButton :disabled="loading" variant="ghost" @click="close">{{ copy.close }}</DsButton>
    </section>
  </div>
</template>

<style scoped>
.phone-sign-in {
  margin-block: 1rem;
}
svg {
  display: block;
  width: 16rem;
  max-width: 100%;
}
label {
  display: block;
}
input {
  display: block;
  width: 100%;
  max-width: 40rem;
  box-sizing: border-box;
  margin-block: 0.5rem;
  padding: 0.5rem;
  font: inherit;
}
</style>
