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

test("table and FAQ content is readable in SSR HTML with accessible headers and term links", async () => {
  const blocks = [
    {
      type: "table" as const,
      caption: "Class choices",
      columns: ["Class", "Action"],
      rows: [["Warlock", "Use {{term:life-tap|Life Tap}} carefully."]],
    },
    {
      type: "faq" as const,
      entries: [{ q: "How do I restore mana?", a: "Use {{term:life-tap|Life Tap}} carefully." }],
    },
  ];
  const app = createSSRApp({ render: () => h(EntryBody, { ...props, blocks }) });
  Object.assign(app._context.components, config.global.components);
  const html = await renderToString(app);
  const root = document.createElement("div");
  root.innerHTML = html;
  expect(root.querySelector("table caption")?.textContent).toBe("Class choices");
  expect([...root.querySelectorAll('th[scope="col"]')].map((cell) => cell.textContent)).toEqual([
    "Class",
    "Action",
  ]);
  expect(root.querySelector("table")?.closest('[tabindex="0"]')?.getAttribute("aria-label")).toBe(
    "Class choices",
  );
  expect(root.querySelector("td a")?.getAttribute("href")).toBe("#guide-term-life-tap");
  expect(root.querySelector(".guide-faq dt")?.textContent).toBe("How do I restore mana?");
  root.querySelectorAll('[role="tooltip"]').forEach((tooltip) => tooltip.remove());
  expect(root.querySelector(".guide-faq dd")?.textContent).toBe("Use Life Tap carefully.");
  expect(html).not.toContain("{{term:");
});

test("new blocks escape every authored field even when passed directly to the renderer", () => {
  const attack = '<img src=x onerror="alert(1)">';
  const wrapper = mount(EntryBody, {
    props: {
      blocks: [
        { type: "table", caption: attack, columns: [attack, "B"], rows: [[attack, "B"]] },
        { type: "faq", entries: [{ q: attack, a: attack }] },
      ],
    },
  });
  expect(wrapper.find("img").exists()).toBe(false);
  expect(wrapper.get("caption").text()).toBe(attack);
  expect(wrapper.get("th").text()).toBe(attack);
  expect(wrapper.get("td").text()).toBe(attack);
  expect(wrapper.get(".guide-faq dt").text()).toBe(attack);
  expect(wrapper.get(".guide-faq dd").text()).toBe(attack);
});
