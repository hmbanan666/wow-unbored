import type { PublicQuest, QuestChain, questProgress } from "@unbored/contracts/quests";
import type { CharacterIdentity } from "./character-page";
export type { PublicQuest, QuestChain };
export type PublicQuestChain = QuestChain & {
  steps: (QuestChain["steps"][number] & { slug: string | null })[];
};
export type QuestOverlay = {
  character: CharacterIdentity;
  steps: ReturnType<typeof questProgress>;
};
export const questTitle = (q: Pick<PublicQuest, "title" | "questID">) =>
  q.title || `Quest ${q.questID}`;
export const questHref = (slug: string) => `/forever/quests/${slug}`;
export const chainHref = (slug: string) => `/forever/quests/chains/${slug}`;
export const questTrail = [
  { label: "Home", to: "/" },
  { label: "WoW Forever", to: "/forever" },
  { label: "Quests", to: "/forever/quests" },
];
