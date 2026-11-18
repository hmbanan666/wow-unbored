import type { PublicQuest, QuestChain, questProgress } from "@unbored/contracts/quests";
import type { CharacterIdentity } from "./character-page";
export type { PublicQuest, QuestChain };
export type PublicQuestChain = QuestChain & {
  steps: (QuestChain["steps"][number] & { slug: string | null })[];
};
export type QuestOverlay = {
  character: CharacterIdentity;
  steps: ReturnType<typeof questProgress>;
  nextChains?: { slug: string; title: string }[];
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

type QuestPlace = PublicQuest["accept"][number];

export function hasPlace(place: QuestPlace) {
  return !!(place.npcName || place.zone || (place.x !== null && place.y !== null));
}

export function isMappedQuest(quest: PublicQuest) {
  return quest.accept.some(hasPlace) || quest.turnIn.some(hasPlace);
}

export function questDescription(quest: PublicQuest) {
  const start = quest.accept.find(hasPlace);
  const end = quest.turnIn.find(hasPlace);
  const place = (p: QuestPlace) =>
    [
      p.npcName,
      p.zone,
      p.x !== null && p.y !== null ? `${p.x.toFixed(1)}, ${p.y.toFixed(1)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  const facts = [start && `Quest start: ${place(start)}.`, end && `Turn-in: ${place(end)}.`]
    .filter(Boolean)
    .join(" ");
  return `${questTitle(quest)} in WoW Forever. ${facts || "Players have recorded this quest, but its start and turn-in are still unmapped."}`;
}
