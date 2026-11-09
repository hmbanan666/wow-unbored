import { expect, test } from "vite-plus/test";
import { mount } from "@vue/test-utils";
import OgImage from "../../app/components/OgImage/Unbored.satori.vue";

test("sharing art shows Bory by default and a page hero with the Forever badge when supplied", () => {
  const fallback = mount(OgImage);
  expect(fallback.get("img").attributes("src")).toBe("/bory.png");
  expect(fallback.text()).not.toContain("WoW Forever");
  const forever = mount(OgImage, {
    props: {
      game: "forever",
      title: "First steps",
      image: "/media/0123456789abcdef-640.webp",
      imageFit: "cover",
    },
  });
  expect(forever.text()).toContain("WoW Forever");
  expect(forever.get("img").attributes("src")).toBe("/media/0123456789abcdef-640.webp");
});
