<script setup lang="ts">
import { REPO_URL, TELEGRAM_URL } from "#shared/catalog";

const title = "About Unbored";
const description =
  "Who makes Unbored, how we check WoW and WoW Forever guides, when we review them, and where to send corrections or follow project news.";
useSeoMeta({ title, description });
defineOgImage("Unbored", { title, description });
useSchemaOrg([defineWebPage({ "@type": "AboutPage", name: title, description })]);
</script>

<template>
  <DsPage>
    <DsPageHeader
      :trail="[
        { label: 'Home', to: '/' },
        { label: 'About', to: '/about' },
      ]"
      :title="title"
      lead="Unbored is a small independent project making World of Warcraft guides and a Retail addon with Bory, the ginger cat."
    />
    <DsSection title="How we check facts">
      <DsProse>
        <p>
          Each guide lists its sources, the date they were checked and the game build they cover.
          Retail and WoW Forever facts are checked separately. Forecasts are labelled.
        </p>
        <p>
          We review guides after patches and when sources change. We reopen sources, check the
          affected facts and revise the page. If we cannot verify a claim, we narrow it or leave it
          out.
        </p>
        <p>There are no paid placements.</p>
      </DsProse>
    </DsSection>
    <DsSection title="Corrections and news">
      <DsProse>
        <p>
          Found something that needs fixing? Contact us through
          <a :href="TELEGRAM_URL" rel="noopener">Telegram</a>, where we also post project news. The
          code is on <a :href="REPO_URL" rel="noopener">GitHub</a>.
        </p>
        <p>Unbored is a fan project, not affiliated with Blizzard.</p>
      </DsProse>
    </DsSection>
  </DsPage>
</template>
