<script setup lang="ts">
import type { FeedPage } from "#shared/character-feed";
defineProps<{ feed: FeedPage; community?: boolean; base: string }>();
const date = (at: number) =>
  new Date(at * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
const marks = { level: "↑", profession: "✦", recipe: "◇", reputation: "☆", screenshot: "◈" };
</script>
<template>
  <section class="player-feed" aria-label="Player feed">
    <header class="feed-heading">
      <p class="eyebrow">
        WoW Forever ·
        {{ community ? "From the community" : "One character, many little victories" }}
      </p>
      <h1>
        {{
          community
            ? "Small moments. Good company."
            : feed.shared
              ? `${feed.name}’s story`
              : "This character has not shared a feed"
        }}
      </h1>
      <p class="feed-lead">
        {{
          community
            ? "Levels earned, new crafts, and sights worth stopping for. Shared by the players who were there."
            : feed.shared
              ? `${feed.realm} · Recorded milestones and moments from the game.`
              : "Sharing is up to the player. Their moments stay with them until they choose to share."
        }}
      </p>
      <NuxtLink v-if="!community" class="feed-link" to="/forever/feed"
        >Meet the community <span aria-hidden="true">↗</span></NuxtLink
      >
      <NuxtLink v-else class="feed-link" to="/my"
        >Your character and sharing settings <span aria-hidden="true">↗</span></NuxtLink
      >
    </header>
    <div v-if="feed.shared && !feed.posts.length" class="feed-empty">
      <span aria-hidden="true">✦</span>
      <h2>A little quiet here.</h2>
      <p>
        {{
          community
            ? "The first shared moments will appear here. There is no rush."
            : "New milestones and shared screenshots will appear here."
        }}
      </p>
      <NuxtLink to="/forever">Explore WoW Forever</NuxtLink>
    </div>
    <div class="feed-posts">
      <article
        v-for="post in feed.posts"
        :key="post.id"
        class="feed-post"
        :class="{ 'has-photo': post.image }"
      >
        <header class="post-author">
          <span class="post-avatar" aria-hidden="true">{{ post.name.slice(0, 1) }}</span>
          <div>
            <NuxtLink :to="post.href">{{ post.name }}</NuxtLink>
            <p>{{ post.realm }}</p>
          </div>
          <time :datetime="new Date(post.at * 1000).toISOString()"
            >{{ date(post.at) }}<small>UTC</small></time
          >
        </header>
        <picture v-if="post.image" class="post-photo">
          <source
            v-for="format in ['avif', 'webp'] as const"
            :key="format"
            :type="`image/${format}`"
            :srcset="
              post.image.variants
                .filter((v) => v.format === format)
                .map((v) => `/player-media/${post.image!.id}/${v.file} ${v.width}w`)
                .join(', ')
            "
            sizes="(max-width: 720px) 100vw, 680px"
          />
          <img
            :src="`/player-media/${post.image.id}/${post.image.variants.at(-1)?.file}`"
            :width="post.image.width"
            :height="post.image.height"
            :alt="`${post.name}’s screenshot from WoW Forever`"
            loading="lazy"
          />
        </picture>
        <div class="post-moment">
          <span class="moment-mark" aria-hidden="true">{{ marks[post.kind] }}</span>
          <div>
            <p class="eyebrow">
              {{ post.kind === "screenshot" ? "From the game" : "A milestone" }}
            </p>
            <h2>{{ post.label }}</h2>
          </div>
        </div>
      </article>
    </div>
    <nav v-if="feed.next" class="feed-pagination" aria-label="Older posts">
      <NuxtLink :to="`${base}?cursor=${encodeURIComponent(feed.next)}`"
        >Older moments <span aria-hidden="true">↓</span></NuxtLink
      >
    </nav>
  </section>
</template>
<style scoped>
.player-feed {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 0 64px;
}
.feed-heading {
  margin-bottom: 34px;
}
.eyebrow {
  color: var(--color-gold, #e8b04a);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
h1 {
  font-size: clamp(2.25rem, 6vw, 3.5rem);
  line-height: 1.08;
  margin: 12px 0 18px;
}
.feed-lead {
  color: #b8a385;
  font-size: 1.15rem;
  max-width: 590px;
  line-height: 1.6;
}
.feed-link {
  display: inline-block;
  margin-top: 20px;
  color: #e8b04a;
}
.feed-posts {
  display: grid;
  gap: 24px;
}
.feed-post {
  border: 1px solid #57402d;
  border-radius: 16px;
  background: #2a1c15;
  overflow: hidden;
}
.post-author {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px;
  border-bottom: 1px solid #483124;
}
.post-avatar {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 1px solid #b88b3e;
  border-radius: 50%;
  color: #f5d27a;
  background: #4b2223;
  font-size: 1.4rem;
  flex-shrink: 0;
}
.post-author a {
  color: #eadbc0;
  font-weight: 700;
}
.post-author p {
  font-size: 0.8rem;
  color: #b8a385;
  margin: 2px 0 0;
}
time {
  margin-left: auto;
  text-align: right;
  font-size: 0.8rem;
  color: #b8a385;
  white-space: nowrap;
}
time small {
  display: block;
  font-size: 0.65rem;
  margin-top: 3px;
}
.post-photo {
  display: block;
  background: #1e1410;
}
.post-photo img {
  display: block;
  width: 100%;
  height: auto;
}
.post-moment {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 30px 24px;
}
.post-moment .eyebrow {
  margin: 0 0 5px;
}
.post-moment h2 {
  margin: 0;
  font-size: 1.6rem;
  line-height: 1.25;
}
.moment-mark {
  color: #f5d27a;
  font-size: 2rem;
  width: 42px;
  text-align: center;
  flex-shrink: 0;
}
.feed-empty {
  padding: 48px 24px;
  border: 1px dashed #806e5c;
  border-radius: 16px;
  text-align: center;
}
.feed-empty > span {
  color: #e8b04a;
  font-size: 2rem;
}
.feed-empty p {
  color: #b8a385;
  margin-bottom: 20px;
}
.feed-pagination {
  margin-top: 30px;
  text-align: center;
}
@media (max-width: 520px) {
  .post-author {
    padding: 16px;
    gap: 8px;
    flex-wrap: wrap;
  }
  .post-author p {
    max-width: 145px;
  }
  time {
    font-size: 0.7rem;
  }
  .post-moment {
    padding: 24px 16px;
    gap: 12px;
  }
  .post-moment h2 {
    font-size: 1.35rem;
  }
}
</style>
