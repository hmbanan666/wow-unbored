import type { Game } from "#shared/public-professions";
import { db } from "./db";
import { readPublicProfessions } from "./public-professions";

/** The cache key contains only the game. This function cannot accept a session or character. */
export const publicCatalog = defineCachedFunction(
  async (game: Game) => {
    const sql = db();
    if (!sql)
      throw createError({ statusCode: 503, message: "Recipes are resting. Try again shortly." });
    return readPublicProfessions(sql, game);
  },
  { name: "public-professions", maxAge: 300, swr: false, getKey: (game: Game) => game },
);
