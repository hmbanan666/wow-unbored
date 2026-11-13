import type { H3Event } from "h3";
import { parseCharacter } from "#shared/selected-character";
import { db } from "./db";
import { liveAccount } from "./session";
import { readQuestOverlay } from "./quests";
export async function questOverlay(event: H3Event, kind: "quests" | "quest-chains") {
  setResponseHeader(event, "cache-control", "private, no-store");
  setResponseHeader(event, "x-robots-tag", "noindex");
  const fail = (status: number, message: string) => {
    setResponseStatus(event, status);
    return { message };
  };
  const account = await liveAccount(event);
  if (!account) return fail(401, "Sign in from the Companion to pick a character.");
  const identity = parseCharacter(getQuery(event).character);
  if (!identity || getRouterParam(event, "game") !== "forever" || identity.game !== "forever")
    return fail(404, "Character not found.");
  const result = await readQuestOverlay(
    db()!,
    account.accountId,
    identity,
    kind,
    getRouterParam(event, "slug") || "",
  );
  return result ?? fail(404, "Quest or character not found.");
}
