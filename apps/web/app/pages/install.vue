<script setup lang="ts">
import { PRIVACY_URL, RELEASES_URL } from "#shared/catalog";

const title = "Install Unbored: the WoW addon and its Windows Companion";
const description =
  "Get Bory in World of Warcraft: install the Unbored addon and the Windows Companion from the latest release. Free, no typing, one step at a time.";
useSeoMeta({ title, description });
const steps = [
  { title: "Download the Companion." },
  {
    title: "Run it.",
    text: "The installer is not signed yet, so Windows may warn you: click More info, then Run anyway. The Companion finds World of Warcraft and puts Bory into the game.",
  },
  {
    title: "Log in to the game.",
    text: "Pick an idea, and Bory shows the next step with a pin on the map. Quick plans and item tips work right away; your PC needs a one-time OK before full plans start.",
  },
  {
    title: "Open My page.",
    text: "The Companion's My page button signs you in here with one click, no password. It arrives with the next Companion update.",
  },
];
defineOgImage("Unbored", { title: "Install Unbored", description });
useSchemaOrg([
  defineWebPage({ name: title, description }),
  defineSoftwareApp({
    name: "Unbored",
    operatingSystem: "Windows",
    applicationCategory: "GameApplication",
    offers: { price: 0, priceCurrency: "USD" },
    downloadUrl: RELEASES_URL,
  }),
]);
</script>

<template>
  <DsPage>
    <DsPageHeader
      :trail="[
        { label: 'Home', to: '/' },
        { label: 'Install', to: '/install' },
      ]"
      title="Install Unbored"
      lead="Unbored has two parts: the addon, where Bory lives in game, and the Companion, a small Windows app that brings his plans in and keeps the addon current."
    />
    <DsSteps :steps="steps">
      <template #step-0>
        Open the latest release and pick the file ending in <code>-setup.exe</code>.
      </template>
    </DsSteps>
    <DsActions>
      <DsButton :to="RELEASES_URL">Download the latest release</DsButton>
    </DsActions>
    <DsSection divided>
      <p class="ds-meta">
        Bory only learns about your own characters.
        <a :href="PRIVACY_URL" rel="noopener">What he knows</a>
      </p>
    </DsSection>
  </DsPage>
</template>
