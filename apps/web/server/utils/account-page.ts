import type { Sql } from "./db";
import {
  characterView,
  planTitle,
  winTitle,
  type MyCharacter,
  type MyEntry,
} from "#shared/my-page";
import type { PageLang } from "#shared/sign-in";

type CharacterRow = {
  id: string;
  name: string;
  realm: string;
  class: string | null;
  level: number | null;
};

type SectionRow = { owner_id: string; section: string; body: unknown };

type HistoryRow = {
  at: number;
  character_name: string;
  realm: string;
  kind: string;
  body: unknown;
  plan_body: unknown;
};

/** Characters, plans and wins for one Account. The query never reads another Account. */
export async function readMyPage(
  sql: Sql,
  accountId: string,
  lang: PageLang,
): Promise<{ characters: MyCharacter[]; plans: MyEntry[]; wins: MyEntry[] }> {
  const characters = await sql<CharacterRow[]>`
    SELECT id, name, realm, class, level
    FROM characters
    WHERE account_id = ${accountId}
    ORDER BY last_seen DESC, name`;
  const ids = characters.map((row) => row.id);
  const sections = ids.length
    ? await sql<SectionRow[]>`
        SELECT owner_id, section, body
        FROM sections_latest
        WHERE owner_kind = 'char'
          AND owner_id IN ${sql(ids)}
          AND section IN ('char', 'mplus', 'reputation')`
    : [];
  const byOwner = new Map<string, Map<string, unknown>>();
  for (const section of sections) {
    const owner = byOwner.get(section.owner_id) ?? new Map<string, unknown>();
    owner.set(section.section, section.body);
    byOwner.set(section.owner_id, owner);
  }
  const history = await sql<HistoryRow[]>`
    SELECT h.at, h.character_name, h.realm, h.kind, h.body, p.body AS plan_body
    FROM history h
    LEFT JOIN plans p ON p.id = CASE
      WHEN (h.body->>'planId') ~ '^[0-9]+$' THEN (h.body->>'planId')::bigint
      ELSE NULL
    END
    WHERE h.account = ${accountId} AND h.kind IN ('plan', 'win')
    ORDER BY h.at DESC
    LIMIT 40`;
  const plans: MyEntry[] = [];
  const wins: MyEntry[] = [];
  for (const row of history) {
    const title =
      row.kind === "win" ? winTitle(row.body, lang) : planTitle(row.body, row.plan_body);
    if (!title) continue;
    const entry = {
      at: Number(row.at),
      character: row.character_name,
      realm: row.realm,
      title,
    };
    if (row.kind === "win") wins.push(entry);
    else plans.push(entry);
  }
  return {
    characters: characters.map((row) => {
      const sectionsFor = byOwner.get(row.id);
      return characterView({
        name: row.name,
        realm: row.realm,
        className: row.class,
        level: row.level,
        charBody: sectionsFor?.get("char"),
        mplusBody: sectionsFor?.get("mplus"),
        reputationBody: sectionsFor?.get("reputation"),
      });
    }),
    plans,
    wins,
  };
}
