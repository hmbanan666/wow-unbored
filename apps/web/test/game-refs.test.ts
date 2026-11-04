import { expect, test } from "vite-plus/test";
import { gameText, heroArt, figureArt, articleImage } from "../shared/game-media";
import type { PageMedia } from "@unbored/contracts/game-media";

const asset = {
  name: "Golden Yak",
  alt: "A yak",
  width: 320,
  height: 240,
  variants: [
    { file: "0123456789abcdef-320.webp", width: 320, height: 240, format: "webp" as const },
  ],
};
const media: PageMedia = { "mount:460": { render: asset } };

test("inline references resolve authored or media names; missing art is plain text, never a token", () => {
  expect(gameText("Ride [[mount:460]]!", media)).toEqual([
    { text: "Ride " },
    { text: "Golden Yak", kind: "mount", media: media["mount:460"], item: undefined },
    { text: "!" },
  ]);
  expect(gameText("Try [[mount:460]], [[pet:2]], [[unknown:7]], [[item:0]].", {})).toEqual([
    { text: "Try " },
    { text: ", " },
    { text: ", " },
    { text: ", " },
    { text: "." },
  ]);
  const item = {
    kind: "mount" as const,
    id: 460,
    name: "Authored name",
    source: { type: "vendor" as const, lines: ["Vendor"] },
    chance: false,
    note: "Visit.",
  };
  expect(gameText("[[mount:460]]", {}, [item])).toEqual([{ text: "Authored name" }]);
  expect(gameText("[[mount:460]]", media, [item])[0]?.text).toBe("Authored name");
  expect(
    gameText("Broken [[mount:460", media)
      .map((p) => p.text)
      .join(""),
  ).toBe("Broken ");
});
test("hero and figure select the right art, with authored alt and no missing placeholders", () => {
  expect(heroArt({ kind: "mount", id: 460, alt: "My yak" }, media)?.alt).toBe("My yak");
  expect(heroArt({ kind: "mount", id: 999 }, media)).toBeUndefined();
  expect(heroArt({ kind: "mount", id: 460 }, { "mount:460": { icon: asset } })).toBeUndefined();
  expect(
    figureArt({ type: "figure", ref: { kind: "mount", id: 460 }, alt: "Side view" }, media)?.alt,
  ).toBe("Side view");
  expect(figureArt({ type: "figure", image: "missing", alt: "Missing" }, media)).toBeUndefined();
  expect(
    articleImage({ hero: { kind: "mount", id: 460 }, media, items: [] }, "https://playunbored.com"),
  ).toBe("https://playunbored.com/media/0123456789abcdef-320.webp");
});

test("Article images fall back to the first available item icon, or stay absent", () => {
  const item = {
    kind: "mount" as const,
    id: 460,
    name: "Yak",
    source: { type: "vendor" as const, lines: [] },
    chance: false,
    note: "",
  };
  expect(
    articleImage(
      { media: { "mount:460": { icon: asset } }, items: [item] },
      "https://playunbored.com",
    ),
  ).toBe("https://playunbored.com/media/0123456789abcdef-320.webp");
  expect(articleImage({ media: {}, items: [item] }, "https://playunbored.com")).toBeUndefined();
});
