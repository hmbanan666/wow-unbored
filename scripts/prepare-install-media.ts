import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { convertMedia } from "../apps/server/src/media-files.ts";

// Bundle our screenshot with the web app so /install needs no media import or database row.
const root = new URL("../", import.meta.url);
const media = await convertMedia(
  await readFile(new URL("Screenshots/plan-card.jpg", root)),
  "image",
  fileURLToPath(new URL("apps/web/public/media/", root)),
);
await writeFile(
  new URL("apps/web/shared/install-media.ts", root),
  "// Generated from Screenshots/plan-card.jpg by scripts/prepare-install-media.ts.\n" +
    'import type { MediaAsset } from "@unbored/contracts/game-media";\n' +
    "export const installMedia = " +
    JSON.stringify(
      {
        ...media,
        name: "Cage Hunt in Tanaan",
        alt: "Bory’s expanded Cage Hunt in Tanaan plan, with the current step, map pin and missing mount rewards.",
      },
      null,
      2,
    ) +
    " satisfies MediaAsset & { hash: string };\n",
);
