import type { MediaVariant } from "@unbored/contracts/game-media";
export type FeedPost = {
  id: string;
  at: number;
  name: string;
  realm: string;
  href: string;
  kind: "level" | "profession" | "recipe" | "reputation" | "screenshot";
  label: string;
  image?: { id: string; width: number; height: number; variants: MediaVariant[] };
};
export type FeedPage = {
  shared: boolean;
  name?: string;
  realm?: string;
  posts: FeedPost[];
  next: string | null;
};
export type SharingState = {
  enabled: boolean;
  href: string;
  generation: string;
  enabledAt: number;
};
export function feedHref(realm: string, name: string) {
  return `/forever/players/${encodeURIComponent(realm)}/${encodeURIComponent(name)}`;
}
