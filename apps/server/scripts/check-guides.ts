import { readFile } from "node:fs/promises";
import { ContentError } from "../src/content.ts";
import { guidesFromMigration, validateGuide, validateGuideBundle } from "../src/guide-editorial.ts";

const files = process.argv.slice(2);
if (!files.length)
  files.push(
    "apps/server/migrations/0023_forever_editorial.sql",
    "apps/server/migrations/0024_forever_systems.sql",
    "apps/server/migrations/0026_forever_money.sql",
    "apps/server/migrations/0027_forever_raids_comparison_addons.sql",
    "apps/server/migrations/0028_forever_classes.sql",
  );
try {
  const revisions = await Promise.all(
    files.map(async (file) => {
      const text = await readFile(file, "utf8");
      const docs = (file.endsWith(".sql") ? guidesFromMigration(text) : [JSON.parse(text)]).map(
        (input) => validateGuide(input),
      );
      if (new Set(docs.map((doc) => doc.slug)).size !== docs.length)
        throw new ContentError(`Duplicate guide slug in ${file}`);
      return docs;
    }),
  );
  // Later migrations replace earlier versions without duplicating the published catalog.
  const latest = [...new Map(revisions.flat().map((doc) => [doc.slug, doc])).values()];
  const guides =
    files.length === 1 && !files[0]!.endsWith(".sql") ? latest : validateGuideBundle(latest);
  for (const guide of guides)
    console.log(`Valid: /guides/${guide.slug} (${guide.game}, ${guide.terms?.length ?? 0} terms)`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (error instanceof ContentError)
    for (const problem of error.problems) console.error(`- ${problem}`);
  process.exitCode = 1;
}
