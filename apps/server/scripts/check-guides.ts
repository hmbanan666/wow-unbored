import { readFile } from "node:fs/promises";
import { ContentError } from "../src/content.ts";
import { guidesFromMigration, validateGuide, validateGuideBundle } from "../src/guide-editorial.ts";

const file = process.argv[2] || "apps/server/migrations/0023_forever_editorial.sql";
try {
  const text = await readFile(file, "utf8");
  const guides = file.endsWith(".sql")
    ? validateGuideBundle(guidesFromMigration(text))
    : [validateGuide(JSON.parse(text))];
  for (const guide of guides)
    console.log(`Valid: /guides/${guide.slug} (${guide.game}, ${guide.terms?.length ?? 0} terms)`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (error instanceof ContentError)
    for (const problem of error.problems) console.error(`- ${problem}`);
  process.exitCode = 1;
}
