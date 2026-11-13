import {
  parseCharacter,
  characterKey,
  CHARACTER_COOKIE,
  CHARACTER_COOKIE_AGE,
} from "#shared/selected-character";
import { db } from "../utils/db";
import { liveAccount } from "../utils/session";
import { ownsCharacter } from "../utils/selected-character";
import { readPublicProfessions } from "../utils/public-professions";
export default defineEventHandler(async (event) => {
  const parts = event.path.split("?")[0]!.split("/").filter(Boolean);
  if (parts.length !== 5 || parts[0] !== "my" || parts[4] === "history") return;
  setResponseHeader(event, "cache-control", "private, no-store");
  setResponseHeader(event, "x-robots-tag", "noindex, nofollow");
  const notFound = () => {
    setResponseStatus(event, 404);
    setResponseHeader(event, "content-type", "text/html; charset=utf-8");
    return '<!doctype html><html lang="en"><head><meta name="robots" content="noindex"><title>Collection not found</title></head><body><h1>Collection not found</h1><p>Open <a href="/my">My page</a> to choose one of your characters.</p></body></html>';
  };
  const character = parseCharacter(parts.slice(1, 4).join("/"));
  const account = await liveAccount(event);
  const sql = db();
  if (!character || !account || !sql || !(await ownsCharacter(sql, account.accountId, character)))
    return notFound();
  const profession = (await readPublicProfessions(sql, character.game)).find(
    (p) => p.slug === parts[4],
  );
  if (!profession) return notFound();
  setCookie(event, CHARACTER_COOKIE, characterKey(character), {
    path: "/",
    sameSite: "lax",
    maxAge: CHARACTER_COOKIE_AGE,
    secure: getRequestURL(event).protocol === "https:",
  });
  return sendRedirect(event, `/${character.game}/professions/${profession.slug}`, 302);
});
