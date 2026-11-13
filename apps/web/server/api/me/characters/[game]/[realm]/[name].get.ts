import { fetchTodaySets } from "../../../../../utils/today-api";
import { CHARACTER_COPY } from "#shared/character-page";
import { SIGN_IN_COPY } from "#shared/sign-in";
import { readCharacterPage } from "../../../../../utils/character-page";
import { db } from "../../../../../utils/db";
import { liveAccount, sessionCredentials } from "../../../../../utils/session";

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "private, no-store");
  setResponseHeader(event, "x-robots-tag", "noindex");
  const prior = await getUserSession(event);
  const account = await liveAccount(event);
  if (!account) {
    const closed = Boolean(sessionCredentials(prior));
    return {
      ok: false as const,
      message: closed ? SIGN_IN_COPY.closed : SIGN_IN_COPY.missing,
    };
  }
  const game = getRouterParam(event, "game");
  const realm = getRouterParam(event, "realm", { decode: true });
  const name = getRouterParam(event, "name", { decode: true });
  const sql = db();
  if (!sql) return { ok: false as const, message: SIGN_IN_COPY.failed };
  const character =
    (game === "retail" || game === "forever") && realm && name
      ? await readCharacterPage(sql, account.accountId, { game, realm, name })
      : null;
  if (!character) throw createError({ statusCode: 404, message: CHARACTER_COPY.notFound });
  character.today = await fetchTodaySets(
    useRuntimeConfig().serverUrl || getRequestURL(event).origin,
    sessionCredentials(prior)?.sessionId,
    character,
  );
  return { ok: true as const, character };
});
