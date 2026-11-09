import type { Sql } from "../../server/src/postgres.ts";

/** Synthetic publications for HTTP and browser checks; never imported into a live database. */
export async function seedSeoContent(sql: Sql) {
  const body = JSON.stringify({
    blocks: [
      { type: "paragraph", text: "Choose a class and take the road from your starting town." },
    ],
    items: [],
    sources: [{ label: "Launch notes", url: "https://example.com/launch", accessed: "2026-11-05" }],
    asOf: { date: "2026-11-05", build: "1.60.1" },
  });
  for (const game of ["forever", "retail"]) {
    for (let index = 1; index <= 5; index++) {
      await sql`INSERT INTO content.paths
        (game, kind, slug, locale, title, description, version, status, body, updated_at, published_at)
        VALUES (${game}, 'guide', ${`${game}-${index}`}, 'en', ${`${game === "forever" ? "WoW Forever" : "Retail"}: first steps ${index}`},
          'Choose your first class, find your starting town and plan the journey ahead.', 1, 'published', ${body}::jsonb, 1793865600, 1793865600)`;
    }
  }
  await sql`UPDATE content.paths SET status = 'retired', updated_at = 1794211200 WHERE slug = 'forever-1'`;
  await sql`INSERT INTO content.paths
    (game, kind, slug, locale, title, description, version, status, body, updated_at, published_at)
    SELECT game, kind, slug, locale, title, description, 2, 'published', body, 1794211200, 1794211200
    FROM content.paths WHERE slug = 'forever-1'`;
  await sql`INSERT INTO content.paths
    (game, kind, slug, locale, title, description, version, status, body, updated_at)
    VALUES ('forever', 'guide', 'unpublished', 'en', 'Unpublished', 'Not ready.', 1, 'draft', ${body}::jsonb, 1794211200)`;
  const collection = JSON.stringify({
    blocks: [{ type: "paragraph", text: "Start with a horse from the riding trainer." }],
    items: [
      {
        kind: "mount",
        id: 6,
        name: "Brown Horse",
        source: { type: "vendor", text: "Visit the riding trainer in Stormwind." },
        chance: false,
        note: "A first mount for the road.",
      },
    ],
  });
  await sql`INSERT INTO content.paths
    (game, kind, slug, locale, title, description, version, status, body, updated_at, published_at)
    VALUES ('retail', 'collection', 'first-mounts', 'en', 'Mounts to get first', 'Find your first mount and learn where to get it.', 1, 'published', ${collection}::jsonb, 1793865600, 1793865600)`;
}
