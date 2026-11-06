import { expect, test, vi } from "vite-plus/test";
import { config, mount } from "@vue/test-utils";
import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";
import EntryBody from "../../app/components/EntryBody.vue";

const term = {
  key: "life-tap",
  name: "Life Tap",
  text: "Trades health for mana; keep enough health for the next hit.",
  source: "https://example.com/warlock",
};
const props = {
  blocks: [{ type: "paragraph" as const, text: "Use {{term:life-tap|Life Tap}} carefully." }],
  terms: [term],
};
test("SSR gives a readable sentence, explanation and working definition link without scripts", async () => {
  const app = createSSRApp({ render: () => h(EntryBody, props) });
  Object.assign(app._context.components, config.global.components);
  const html = await renderToString(app);
  expect(html).toContain('href="#guide-term-life-tap"');
  expect(html).toContain('id="guide-term-life-tap"');
  expect(html).toContain(term.text);
  expect(html).not.toContain("{{term:");
  expect(html).toContain('href="https://example.com/warlock"');
});
test("touch explanation toggles and dismisses outside; keyboard Escape keeps trigger focus", async () => {
  vi.spyOn(window, "matchMedia").mockReturnValue({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  } as unknown as MediaQueryList);
  const wrapper = mount(EntryBody, { props, attachTo: document.body });
  await wrapper.vm.$nextTick();
  const button = wrapper.get("button");
  await button.trigger("click");
  expect(button.attributes("aria-expanded")).toBe("true");
  expect(wrapper.get('[role="tooltip"]').text()).toContain(term.text);
  await button.trigger("click");
  expect(button.attributes("aria-expanded")).toBe("false");
  await button.trigger("click");
  document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  await wrapper.vm.$nextTick();
  expect(button.attributes("aria-expanded")).toBe("false");
  (button.element as HTMLElement).focus();
  await button.trigger("keydown", { key: "Enter" });
  expect(button.attributes("aria-expanded")).toBe("true");
  await button.trigger("keydown", { key: "Escape" });
  expect(button.attributes("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(button.element);
});

test("authored explanation text is escaped, and a missing definition retains the sentence label", async () => {
  const wrapper = mount(EntryBody, {
    props: { ...props, terms: [{ ...term, text: '<img src=x onerror="alert(1)">' }] },
  });
  expect(wrapper.find("img").exists()).toBe(false);
  expect(wrapper.text()).toContain('<img src=x onerror="alert(1)">');
  await wrapper.setProps({ terms: [] });
  expect(wrapper.text()).toContain("Use Life Tap carefully.");
  expect(wrapper.text()).not.toContain("{{term:");
});

test("Tab focus opens a term on touch hardware and Space toggles it without moving focus", async () => {
  vi.spyOn(window, "matchMedia").mockReturnValue({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  } as unknown as MediaQueryList);
  const wrapper = mount(EntryBody, { props, attachTo: document.body });
  await wrapper.vm.$nextTick();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
  const button = wrapper.get("button");
  (button.element as HTMLElement).focus();
  await wrapper.vm.$nextTick();
  expect(button.attributes("aria-expanded")).toBe("true");
  await button.trigger("keydown", { key: " " });
  expect(button.attributes("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(button.element);
});
