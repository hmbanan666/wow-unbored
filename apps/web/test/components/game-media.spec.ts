import { describe, expect, test } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { mount } from "@vue/test-utils";
import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";
import GameIcon from "../../app/components/ds/GameIcon.vue";
import GameArt from "../../app/components/ds/GameArt.vue";
import gameArtSource from "../../app/components/ds/GameArt.vue?raw";
import type { MediaAsset } from "@unbored/contracts/game-media";

export const icon: MediaAsset = {
  width: 56,
  height: 56,
  name: "Golden Yak",
  alt: "Golden Yak, a World of Warcraft mount",
  variants: [
    { file: "0123456789abcdef-56.avif", width: 56, height: 56, format: "avif" },
    { file: "0123456789abcdef-56.webp", width: 56, height: 56, format: "webp" },
  ],
};

test("render art uses the solid Blizzard background without gradients or a vignette", () => {
  const wrapper = mount(GameArt, { props: { media: icon, alt: icon.alt, render: true } });
  expect(wrapper.classes()).toContain("ds-game-art--render");
  const tokens = readFileSync("apps/web/app/assets/css/main.css", "utf8");
  expect(tokens).toContain("--render-bg: #181818;");
  expect(gameArtSource).toMatch(/\.ds-game-art--render\s*\{[^}]*background: var\(--render-bg\)/);
  expect(gameArtSource).not.toMatch(/gradient\(|::after|::before/);
  expect(wrapper.findAll("picture, img, source")).toHaveLength(4);
});

test("photos fill a reserved frame with an overridable focal point while models stay centered", () => {
  const photo = mount(GameArt, {
    props: { media: icon, alt: "Our view" },
    attrs: { style: { "--game-art-position": "right 30%" } },
  });
  expect(photo.classes()).toContain("ds-game-art--cover");
  expect(photo.attributes("style")).toContain("--game-art-position: right 30%");
  expect(gameArtSource).toMatch(/aspect-ratio: var\(--game-art-ratio, 16 \/ 9\)/);
  expect(gameArtSource).toMatch(/\.ds-game-art--cover img\s*\{[^}]*object-fit: cover/);
  expect(gameArtSource).toContain("object-position: var(--game-art-position, center 40%)");
  expect(gameArtSource).toMatch(
    /\.ds-game-art--render img\s*\{[^}]*object-fit: contain;[^}]*object-position: center/,
  );
});

describe("game icons", () => {
  test("server renders AVIF then WebP with decorative, sized lazy images", async () => {
    const html = await renderToString(
      createSSRApp({ render: () => h(GameIcon, { media: icon, kind: "mount" }) }),
    );
    expect(html).toContain("<picture");
    expect(html.indexOf("image/avif")).toBeLessThan(html.indexOf("image/webp"));
    expect(html).toContain('src="/media/0123456789abcdef-56.webp"');
    expect(html).toContain('width="44"');
    expect(html).toContain('height="44"');
    expect(html).toMatch(/alt(?:="")? /);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
  });
  test("missing media draws distinct kind glyphs and supports explicit sizes/eager", () => {
    const paths = new Set<string>();
    for (const kind of [
      "mount",
      "pet",
      "toy",
      "achievement",
      "level",
      "rep",
      "quest",
      "questLine",
      "currency",
      "item",
    ]) {
      const wrapper = mount(GameIcon, { props: { kind, size: "sm" } });
      expect(wrapper.find("img").exists()).toBe(false);
      expect(wrapper.get("svg").attributes("aria-hidden")).toBe("true");
      paths.add(wrapper.get("path").attributes("d"));
    }
    expect(paths.size).toBe(10);
    const wrapper = mount(GameIcon, {
      props: { kind: "pet", media: icon, eager: true, size: "lg" },
    });
    expect(wrapper.get("img").attributes("loading")).toBe("eager");
    expect(wrapper.get("img").attributes("width")).toBe("56");
  });
});
