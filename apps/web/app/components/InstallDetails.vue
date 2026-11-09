<script setup lang="ts">
import type { DownloadAsset } from "#shared/downloads";
import { RELEASES_URL } from "#shared/catalog";
defineProps<{ asset?: DownloadAsset; publishedAt?: string }>();
const date = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
</script>

<template>
  <div class="install-details">
    <p v-if="publishedAt" class="ds-meta">
      Released <time :datetime="publishedAt">{{ date(publishedAt) }}</time
      >.
    </p>
    <template v-if="asset?.sha256">
      <p>
        Installer SHA-256: <code class="install-details__hash">{{ asset.sha256 }}</code>
      </p>
      <p class="ds-meta">
        To check the downloaded file, run this in PowerShell from your Downloads folder and compare
        the hash:
      </p>
      <pre><code>Get-FileHash '.\{{ asset.name }}' -Algorithm SHA256</code></pre>
      <p class="ds-meta">
        A matching hash confirms you have the release file. It is not a security scan.
      </p>
    </template>
    <p v-else class="ds-meta">
      Release details are temporarily unavailable.
      <a :href="RELEASES_URL">Check the latest release</a> for the file and its SHA-256.
    </p>
  </div>
</template>

<style scoped>
.install-details {
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-5);
  overflow-wrap: anywhere;
}
.install-details__hash {
  display: block;
  margin-top: var(--space-2);
}
pre {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
