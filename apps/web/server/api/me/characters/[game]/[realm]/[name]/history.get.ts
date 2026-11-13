import {
  CHARACTER_EVENT_TYPES,
  historyCursor,
  type CharacterEventType,
} from "@unbored/contracts/character-history";
import { readHistoryPage } from "../../../../../../utils/character-history";
import { db } from "../../../../../../utils/db";
import { liveAccount } from "../../../../../../utils/session";

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "private, no-store");
  setResponseHeader(event, "x-robots-tag", "noindex, nofollow");
  const account = await liveAccount(event);
  if (!account)
    return {
      ok: false as const,
      message: "Choose Open my profile in the Companion to see your history.",
    };
  const game = getRouterParam(event, "game");
  const realm = getRouterParam(event, "realm", { decode: true });
  const name = getRouterParam(event, "name", { decode: true });
  if ((game !== "retail" && game !== "forever") || !realm || !name)
    throw createError({ statusCode: 404, message: "Character not found." });
  const query = getQuery(event);
  const types = typeof query.types === "string" && query.types ? query.types.split(",") : [];
  const cursor = historyCursor(query.cursor);
  if (
    (query.types !== undefined && typeof query.types !== "string") ||
    types.some((t) => !CHARACTER_EVENT_TYPES.includes(t as CharacterEventType)) ||
    (query.cursor !== undefined && !cursor)
  ) {
    throw createError({
      statusCode: 400,
      message: "Choose a history type or return to the first page.",
    });
  }
  const sql = db();
  if (!sql)
    return { ok: false as const, message: "History could not be loaded. Please try again." };
  const history = await readHistoryPage(
    sql,
    account.accountId,
    { game, realm, name },
    { types: types as CharacterEventType[], cursor },
  );
  if (!history) throw createError({ statusCode: 404, message: "Character not found." });
  return { ok: true as const, history };
});
