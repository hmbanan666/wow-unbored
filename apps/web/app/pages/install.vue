<script setup lang="ts">
import { PRIVACY_URL, RELEASES_URL } from "#shared/catalog";

const title = "Install Unbored: the WoW addon and its Windows Companion";
const description =
  "Get Bory in World of Warcraft: install the Unbored addon and the Windows Companion from the latest release. Free, no typing, one step at a time.";
useSeoMeta({ title, description });
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
  <main class="page">
    <SiteBreadcrumbs
      :trail="[
        { label: 'Home', to: '/' },
        { label: 'Install', to: '/install' },
      ]"
    />
    <h1>Install Unbored</h1>
    <p class="lead">
      Unbored has two parts: the addon, where Bory lives in game, and the Companion, a small Windows
      app that brings his plans in and keeps the addon current.
    </p>
    <ol class="steps">
      <li>
        <strong>Download the Companion.</strong> Open the latest release and pick the file ending in
        <code>-setup.exe</code>.
      </li>
      <li>
        <strong>Run it.</strong> The installer is not signed yet, so Windows may warn you: click
        More info, then Run anyway. The Companion finds World of Warcraft and puts Bory into the
        game.
      </li>
      <li>
        <strong>Log in to the game.</strong> Pick an idea, and Bory shows the next step with a pin
        on the map. Quick plans and item tips work right away; your PC needs a one-time OK before
        full plans start.
      </li>
      <li>
        <strong>Open My page.</strong> The Companion's My page button signs you in here with one
        click, no password. It arrives with the next Companion update.
      </li>
    </ol>
    <div class="actions">
      <UButton
        :to="RELEASES_URL"
        target="_blank"
        rel="noopener"
        color="primary"
        size="lg"
        class="gold-button"
        >Download the latest release</UButton
      >
    </div>
    <p class="meta">
      Bory only learns about your own characters.
      <a :href="PRIVACY_URL" rel="noopener">What he knows</a>
    </p>
  </main>
</template>
