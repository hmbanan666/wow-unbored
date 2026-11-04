import { describe, expect, test } from "vite-plus/test";
import { mount } from "@vue/test-utils";
import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";
import GameIcon from "../../app/components/ds/GameIcon.vue";
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
