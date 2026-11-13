import type { Profession, AlbumRecipe } from "./profession-progress.ts";
import { professionName } from "./profession-name.ts";
import type { RecipeSource } from "./recipe-sources.ts";
import type { RouteReagent } from "./skill-route.ts";

export type TodayTarget =
  | { kind: "window"; skillLine: number }
  | { kind: "rank"; skillLine: number; previousMax: number }
  | { kind: "skill"; skillLine: number; to: number; spellId: number }
  | { kind: "recipe"; spellId: number }
  | { kind: "coverage"; skillLine: number; seen: string[] }
  | { kind: "unlock"; skillLine: number; to: number; spellId: number };
export type TodayGoal = {
  id: string;
  target: TodayTarget;
  title: string;
  why: string;
  route: string;
  waypoint?: Pick<RecipeSource, "npcId" | "npcName" | "zone" | "uiMapID" | "x" | "y">;
  from?: number;
  crafts?: number;
  reagents?: RouteReagent[];
};
export type SavedTodayGoal = TodayGoal & { completedAt: number | null };
export type TodaySet = {
  id: string;
  skillLine: number;
  profession: string;
  day: number;
  createdAt: number;
  goals: SavedTodayGoal[];
};
/** Stable FNV-1a over a canonical target, independent of display copy and input order. */
function goalId(target: TodayTarget): string {
  let hash = 14695981039346656037n;
  for (const ch of JSON.stringify(target))
    hash = BigInt.asUintN(64, (hash ^ BigInt(ch.charCodeAt(0))) * 1099511628211n);
  return hash.toString(16).padStart(16, "0");
}
function place(source: TodayGoal["waypoint"]): string {
  if (!source) return "";
  const zone = source.zone?.startsWith("Unknown zone") ? "Zone not seen yet" : source.zone;
  return [
    source.npcName,
    zone,
    source.x !== null && source.y !== null ? `(${source.x}, ${source.y})` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
const required = (r: AlbumRecipe) => r.difficulty.requiredSkill ?? Infinity;
const byName = (a: AlbumRecipe, b: AlbumRecipe) =>
  (a.name ?? "").localeCompare(b.name ?? "", "en") || a.spellId - b.spellId;
/** Own-Account sighting keys are supplied separately from shared source evidence. */
export function computeTodayGoals(
  p: Profession,
  game: "forever" | "retail",
  sightings: string[],
): TodayGoal[] {
  const goals: TodayGoal[] = [];
  const name = professionName(p);
  const add = (target: TodayTarget, detail: Omit<TodayGoal, "id" | "target">) =>
    goals.push({ id: goalId(target), target, ...detail });
  if (p.known === null) {
    add(
      { kind: "window", skillLine: p.skillLine },
      {
        title: `Open your ${name} window once`,
        why: "Bory has not seen which recipes you know yet.",
        route: `Open ${name} in the game, then let the Companion send the read.`,
      },
    );
  } else {
    const route = p.routes?.[0]?.route;
    if (game === "forever" && route?.rankTraining) {
      const trainer = route.rankTraining.trainer;
      add(
        { kind: "rank", skillLine: route.skillLine, previousMax: route.rankTraining.previousMax },
        {
          title: `Train the next rank of ${name}`,
          why: `You have reached ${route.rankTraining.previousMax}. Training raises your skill limit.`,
          route: trainer ? place({ ...trainer, zone: "" }) : `Visit your ${name} trainer.`,
          ...(trainer ? { waypoint: { ...trainer, zone: "" } } : {}),
        },
      );
    } else if (route?.stretches[0]) {
      const s = route.stretches[0];
      const reagents = s.reagents.map((r) => ({
        ...r,
        name:
          r.name ??
          p.album.find((r) => r.spellId === s.spellId)?.reagents.find((v) => v.itemId === r.itemId)
            ?.name ??
          undefined,
      }));
      add(
        { kind: "skill", skillLine: route.skillLine, to: s.to, spellId: s.spellId },
        {
          title: `Craft ${Math.ceil(s.expectedCrafts)} x ${s.name}`,
          from: s.from,
          crafts: Math.ceil(s.expectedCrafts),
          reagents,
          why: `Skill ${s.from} to ${s.to}. Expected crafts from skill-up odds.${s.slow ? " Slow skill gains." : ""}`,
          route: [
            s.trainer
              ? `Learn it first: ${s.trainer === "catalog" ? `visit your ${name} trainer` : place(s.trainer)}.`
              : "",
            `Bring ${reagents.map((r) => `${r.count} x ${r.name ?? "reagent name unavailable"}`).join(", ")}.`,
          ]
            .filter(Boolean)
            .join(" "),
        },
      );
    }
  }
  const missing = p.album.filter((r) => r.known === false);
  const easiest = missing
    .filter((r) => r.difficulty.canGetNow && r.name)
    .sort(
      (a, b) =>
        a.difficulty.score - b.difficulty.score || required(a) - required(b) || byName(a, b),
    )[0];
  if (easiest) {
    const source = [...easiest.sources].sort(
      (a, b) =>
        a.kind.localeCompare(b.kind) || a.npcId - b.npcId || (a.itemId ?? 0) - (b.itemId ?? 0),
    )[0];
    add(
      { kind: "recipe", spellId: easiest.spellId },
      {
        title: `Learn ${easiest.name}`,
        why: `Needs ${required(easiest)} skill. ${easiest.difficulty.reasons.join(" · ")}`,
        route: source ? place(source) : "Auction house or a friend",
        ...(source ? { waypoint: source } : {}),
      },
    );
  }
  if (missing.some((r) => r.difficulty.source === "not_seen")) {
    add(
      { kind: "coverage", skillLine: p.skillLine, seen: [...new Set(sightings)].sort() },
      {
        title: `Open your ${name} trainer or a recipe vendor once`,
        why: "Some missing recipes have no observed source yet.",
        route: `Visit a ${name} trainer or recipe vendor. A new visit fills in what they offer.`,
      },
    );
  } else {
    const next = missing
      .filter(
        (r) => r.name && p.skill !== null && required(r) !== Infinity && required(r) > p.skill,
      )
      .sort((a, b) => required(a) - required(b) || byName(a, b))[0];
    if (next)
      add(
        { kind: "unlock", skillLine: next.skillLine, to: required(next), spellId: next.spellId },
        {
          title: `Reach ${required(next)} skill for ${next.name}`,
          why: "This is your next known recipe skill requirement.",
          route: `Keep practising ${name}.`,
        },
      );
  }
  return goals;
}
export function todayGoalComplete(goal: TodayGoal, p: Profession, sightings: string[]): boolean {
  const t = goal.target;
  const route =
    "skillLine" in t ? p.routes?.find((r) => r.route.skillLine === t.skillLine)?.route : undefined;
  const skill = route?.from ?? p.skill;
  switch (t.kind) {
    case "window":
      return p.known !== null;
    case "rank":
      return p.max !== null && p.max > t.previousMax;
    case "skill":
    case "unlock":
      return skill !== null && skill >= t.to;
    case "recipe":
      return p.album.some((r) => r.spellId === t.spellId && r.known === true);
    case "coverage":
      return sightings.some((s) => !t.seen.includes(s));
  }
}
