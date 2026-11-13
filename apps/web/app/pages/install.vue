<script setup lang="ts">
import type { GuideFaq } from "@unbored/contracts/guide";
import { PRIVACY_URL, REPO_URL, TELEGRAM_URL } from "#shared/catalog";
import { WINDOWS_DOWNLOAD, ADDON_DOWNLOAD, type ReleaseDownloads } from "#shared/downloads";
import { installMedia as plan } from "#shared/install-media";

const title = "Not sure what to do in WoW? Get Bory";
const description =
  "Find something to do in WoW Retail. Bory offers ideas, one step at a time and item tips. Get the free addon and Windows Companion, with setup help.";
useSeoMeta({ title, description });
const { data: release } = await useFetch<ReleaseDownloads | null>("/api/downloads");
const installer = computed(() => release.value?.assets.windows);
const versionLine = computed(() =>
  [
    "Free",
    ...(installer.value && release.value
      ? [
          release.value.version.startsWith("v")
            ? release.value.version
            : `v${release.value.version}`,
          `${(installer.value.size / 1_000_000).toFixed(2)} MB`,
        ]
      : []),
    "Windows 10/11",
    "Retail",
  ].join(" · "),
);
const features = [
  {
    title: "A full quest log, no next step",
    text: "Bory offers up to four ideas for your character, including a holiday on your calendar or a quest chain you left halfway. Pick one to start.",
  },
  {
    title: "A mount to get, no plan to follow",
    text: "Choose Get a mount or another idea. Bory starts a quick plan with a map pin, shows one step at a time, and opens the full list on Show more.",
  },
  {
    title: "An item you might need later",
    text: "Bory adds an item tip when it matters to your plan, collection or an unfinished quest. Drop an item on him to see what he knows.",
  },
];
const steps = [
  {
    title: "Download the Windows Companion.",
    text: "Use the gold button above. The Companion is the desktop app that installs Bory and keeps him up to date.",
  },
  {
    title: "Run the installer.",
    text: 'Windows SmartScreen may say "Windows protected your PC" because the installer is not signed. If you choose to continue, click More info, then Run anyway. The Companion finds World of Warcraft and installs the addon.',
  },
  {
    title: "Start WoW Retail and click Bory.",
    text: "Find him on the left of your screen and pick an idea. Quick plans and item tips work right away. Your PC needs a one-time OK from the Unbored team before proper plans start.",
  },
];
const faq: GuideFaq = {
  type: "faq",
  entries: [
    {
      q: "Is Bory free?",
      a: "Yes. The Unbored addon and the Windows Companion are free and open source.",
    },
    {
      q: "Does it work in WoW Forever or Classic?",
      a: "Not yet, Retail only. WoW Forever and Classic are not supported. Follow the Unbored Telegram channel linked below for news.",
    },
    {
      q: "Why does SmartScreen warn me? Is it safe to run?",
      a: 'The installer is not Authenticode signed, so Windows may show "Windows protected your PC". You can choose More info, then Run anyway. Compare the downloaded file with the SHA-256 above to check it matches the release. A matching hash does not prove that software is safe.',
    },
    {
      q: "Does it work without the Companion?",
      a: 'Yes: ideas from the calendar and your quest log, quick plans and item tips work in the game alone. Proper plans, ideas from your other characters and the "Also:" line need the Companion.',
    },
    {
      q: "How do updates and new plans arrive?",
      a: "The Companion keeps itself and Bory up to date. When a new plan is waiting, Bory offers one Refresh. You can choose Later and get it next time you enter the game. Bory never refreshes by himself. With a manual zip install, download and replace the addon yourself for each update.",
    },
    {
      q: "Can I use Bory on a Mac?",
      a: "You can install the addon zip by hand on a Mac running WoW Retail. The Companion is Windows only, so calendar and quest-log ideas, quick plans and item tips work, but features that need the Companion do not.",
    },
    {
      q: "How do I uninstall Bory?",
      a: "Close WoW and quit the Companion. Uninstall Unbored Companion through Windows Settings, then remove the Unbored and Unbored_Plan folders from your Retail Interface/AddOns folder. Uninstalling does not erase data already sent to Unbored. Use Forget my data first if you want that erased too.",
    },
    {
      q: "How do I erase my data?",
      a: "In the Companion, open Advanced, choose Forget my data and confirm. This erases the characters, game data, plans, advice, history and website access kept by Unbored for the game accounts this PC sent. It also clears the plans, advice and ideas the Companion put into the game. The addon's SavedVariables files and Companion settings stay on your PC. To send less data, right-click Bory, open Settings and untick Share game data to make Bory smarter.",
    },
  ],
};
defineOgImage("Unbored", { title, description });
useSchemaOrg([
  defineWebPage({
    name: title,
    description,
    "@type": "FAQPage",
    mainEntity: faq.entries.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  }),
  defineSoftwareApp({
    name: "Unbored",
    operatingSystem: "Windows 10/11",
    applicationCategory: "GameApplication",
    offers: { price: 0, priceCurrency: "USD" },
    downloadUrl: "https://playunbored.com/download/windows",
    screenshot: `https://playunbored.com/media/${plan.variants.find((v) => v.format === "webp" && v.width === 640)!.file}`,
    ...(installer.value && release.value
      ? { softwareVersion: release.value.version, fileSize: `${installer.value.size} bytes` }
      : {}),
  }),
]);
</script>

<template>
  <DsPage>
    <DsPageHeader
      :trail="[
        { label: 'Home', to: '/' },
        { label: 'Get Bory', to: '/install' },
      ]"
      title="Not sure what to do in WoW?"
      lead="Bory gives your Retail character up to four ideas, then a plan with one step at a time and a pin on the map. Pick one and get going."
    >
      <DsActions
        ><DsButton :to="WINDOWS_DOWNLOAD" external>Download for Windows</DsButton></DsActions
      >
      <p class="ds-meta">{{ versionLine }}</p>
      <p><a :href="ADDON_DOWNLOAD">No Windows? Get the addon zip</a></p>
    </DsPageHeader>
    <DsSection title="Pick something worth doing">
      <DsCardGrid
        ><DsCard
          v-for="feature in features"
          :key="feature.title"
          :title="feature.title"
          :text="feature.text"
      /></DsCardGrid>
    </DsSection>
    <InstallGallery />
    <DsSection title="Get Bory into the game" divided>
      <DsSteps :steps="steps" />
      <InstallDetails :asset="installer" :published-at="release?.publishedAt" />
      <p class="ds-meta">
        Need the other Windows installer? <a href="/download/windows-msi">Download the MSI</a>.
      </p>
    </DsSection>
    <DsSection title="Install the addon by hand" divided>
      <DsProse>
        <p>
          <a :href="ADDON_DOWNLOAD">Download the addon zip</a>, close WoW, and extract its folders
          into:
        </p>
        <p><code>World of Warcraft/_retail_/Interface/AddOns/</code></p>
        <p>
          Start Retail and click Bory. Ideas from the calendar and your quest log, quick plans and
          item tips work in the game alone. Proper plans, ideas from your other characters and the
          "Also:" line need the Companion.
        </p>
      </DsProse>
    </DsSection>
    <DsSection id="sign-in" title="Sign in from the Companion" divided>
      <DsProse
        ><p>
          Open the Companion and choose <strong>Open my profile</strong>. Its one-time link signs
          you in. Then pick a Character in the header to see your recipes on any profession page.
        </p></DsProse
      >
    </DsSection>
    <DsSection title="Your game, your choices" divided>
      <DsProse>
        <ul>
          <li>
            <strong>Follows Blizzard's addon rules.</strong> Bory suggests what to do. He never
            plays for you or presses anything on his own. Unbored is a fan project, not made by
            Blizzard.
          </li>
          <li>
            <strong>Addon files only.</strong> The Companion installs Bory in Interface/AddOns and
            reads the game-saved addon data in WTF. It does not read game memory, inject anything or
            touch Wow.exe.
          </li>
          <li>
            <strong>Open source.</strong> You can <a :href="REPO_URL">read the code on GitHub</a>.
          </li>
          <li>
            <strong>Your own characters only.</strong> Bory reads your progress, bags, quests and
            collections to make plans fit. He never reads other players' chat, mail or names, and
            never needs your Battle.net password.
            <a :href="PRIVACY_URL">See everything Bory knows</a> and
            <a :href="`${REPO_URL}/blob/main/PRIVACY.md`">what is kept and how to erase it</a>.
          </li>
        </ul>
      </DsProse>
    </DsSection>
    <DsSection divided><EntryBody :blocks="[faq]" /></DsSection>
    <DsSection title="Pick your first idea" divided>
      <DsActions
        ><DsButton :to="WINDOWS_DOWNLOAD" external>Download for Windows</DsButton></DsActions
      >
      <p>Need a hand? <a :href="TELEGRAM_URL">Join Unbored on Telegram</a> for help and news.</p>
    </DsSection>
  </DsPage>
</template>
