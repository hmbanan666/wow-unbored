import type { H3Event } from "h3";
import { parseCharacter } from "#shared/selected-character";
import {
  isGame,
  type ProfessionOverlay,
  type SingleRecipeOverlay,
} from "#shared/public-professions";
import { db } from "./db";
import { liveAccount, sessionCredentials } from "./session";
import { readCharacterPage } from "./character-page";
import { publicCatalog } from "./public-catalog";
import { fetchTodaySets } from "./today-api";
import { recipeDifficulty } from "@unbored/contracts/recipe-difficulty";

export async function readOverlay(
  event: H3Event,
  kind: "professions" | "recipes",
): Promise<ProfessionOverlay | SingleRecipeOverlay | { message: string }> {
  setResponseHeader(event, "cache-control", "private, no-store");
  setResponseHeader(event, "x-robots-tag", "noindex");
  // Expected private failures bypass Nitro's generic error renderer, which forces 404s to no-cache.
  const fail = (status: number, message: string) => {
    setResponseStatus(event, status);
    return { message };
  };
  const account = await liveAccount(event);
  if (!account) return fail(401, "Sign in from the Companion to pick a character.");
  const game = getRouterParam(event, "game");
  const identity = parseCharacter(getQuery(event).character);
  if (!identity || !isGame(game) || identity.game !== game)
    return fail(404, "Character not found.");
  const sql = db()!;
  const character = await readCharacterPage(sql, account.accountId, identity);
  if (!character) return fail(404, "Character not found.");
  const slug = getRouterParam(event, "slug");
  const catalog = await publicCatalog(game);
  const base = catalog.find((p) =>
    kind === "professions" ? p.slug === slug : p.album.some((r) => r.slug === slug),
  );
  if (!base) return fail(404, "Recipe collection not found.");
  const personal = character.professions.find(
    (p) => p.skillLine === base.skillLine || p.aliases.includes(base.skillLine),
  );
  const recipes = Object.fromEntries(
    base.album.map((r) => {
      const learned = personal?.album.find((v) => v.spellId === r.spellId);
      return [
        r.spellId,
        {
          known: learned?.known ?? null,
          difficulty: recipeDifficulty({
            recipe: r,
            sources: r.sources,
            skill: personal?.skill ?? null,
            rankMax: personal?.max ?? null,
            game,
          }),
        },
      ];
    }),
  );
  const skill = personal?.skill ?? null,
    max = personal?.max ?? null;
  if (kind === "recipes")
    return {
      character: identity,
      skill,
      max,
      ...recipes[base.album.find((r) => r.slug === slug)!.spellId]!,
    };
  const today = await fetchTodaySets(
    useRuntimeConfig().serverUrl || getRequestURL(event).origin,
    sessionCredentials(await getUserSession(event))?.sessionId,
    identity,
  );
  const difficultyCounts = { easy: 0, medium: 0, hard: 0 };
  for (const r of Object.values(recipes))
    if (r.known === false) difficultyCounts[r.difficulty.label]++;
  return {
    character: identity,
    skill,
    max,
    recipes,
    difficultyCounts,
    total: base.album.length,
    known:
      personal?.known === null || !personal
        ? null
        : Object.values(recipes).filter((r) => r.known === true).length,
    today: today?.find((s) => s.skillLine === personal?.skillLine) ?? null,
    todayUnavailable: today === null,
  };
}
