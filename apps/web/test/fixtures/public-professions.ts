import { albumCharacter } from "./profession-album";
import { recipeDifficulty } from "@unbored/contracts/recipe-difficulty";
import { professionSlug } from "../../shared/profession-album";
import type { PublicProfession, ProfessionOverlay } from "../../shared/public-professions";
export function publicAlbum(slug = "enchanting") {
  const character = albumCharacter("unopened");
  const p = character.professions.find((p) => professionSlug(p) === slug)!;
  const used = new Set<string>();
  const base: PublicProfession = {
    skillLine: p.skillLine,
    name: p.name,
    slug,
    album: p.album.map((r) => {
      let slug = r
        .name!.toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      while (used.has(slug)) slug += `-${r.spellId}`;
      used.add(slug);
      return {
        ...r,
        known: null,
        band: null,
        slug,
        craftedItemNames: [],
        difficulty: recipeDifficulty({
          recipe: r,
          sources: r.sources,
          skill: null,
          rankMax: null,
          base: true,
        }),
      };
    }),
  };
  const overlay: ProfessionOverlay = {
    character: { game: character.game, realm: character.realm, name: character.name },
    skill: p.skill,
    max: p.max,
    known: p.known,
    total: p.album.length,
    difficultyCounts: p.difficultyCounts,
    recipes: Object.fromEntries(
      p.album.map((r) => [r.spellId, { known: r.known, difficulty: r.difficulty }]),
    ),
    today: character.today!.find((s) => s.skillLine === p.skillLine)!,
    todayUnavailable: false,
  };
  return { base, overlay };
}
