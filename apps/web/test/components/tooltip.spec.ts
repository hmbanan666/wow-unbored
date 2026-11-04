import { expect, test, vi } from "vite-plus/test";
import { mount, config } from "@vue/test-utils";
import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";
import Tooltip from "../../app/components/ds/Tooltip.vue";

function tooltip(fine = true) {
  vi.spyOn(window, "matchMedia").mockReturnValue({
    matches: fine,
    addEventListener() {},
    removeEventListener() {},
  } as unknown as MediaQueryList);
  return mount(Tooltip, {
    attachTo: document.body,
    slots: { default: "Golden Yak", panel: "Visit the vendor." },
  });
}
test("hover waits 120ms; focus opens immediately; Escape dismisses without reopening", async () => {
  vi.useFakeTimers();
  const wrapper = tooltip();
  await wrapper.vm.$nextTick();
  const trigger = wrapper.get('[tabindex="0"]');
  await trigger.trigger("mouseenter");
  await vi.advanceTimersByTimeAsync(119);
  expect(wrapper.get('[role="tooltip"]').attributes("data-open")).toBe("false");
  await vi.advanceTimersByTimeAsync(1);
  expect(wrapper.get('[role="tooltip"]').attributes("data-open")).toBe("true");
  await trigger.trigger("keydown", { key: "Escape" });
  expect(wrapper.get('[role="tooltip"]').attributes("data-open")).toBe("false");
  await trigger.trigger("focus");
  expect(wrapper.get('[role="tooltip"]').attributes("data-open")).toBe("true");
  expect(trigger.attributes("aria-describedby")).toBe(
    wrapper.get('[role="tooltip"]').attributes("id"),
  );
  await trigger.trigger("blur");
  await vi.advanceTimersByTimeAsync(150);
  expect(wrapper.get('[role="tooltip"]').attributes("data-open")).toBe("false");
});
test("touch buttons toggle, close outside, and allow only one open tooltip", async () => {
  const first = tooltip(false),
    second = tooltip(false);
  const a = first.get("button"),
    b = second.get("button");
  expect(a.attributes("type")).toBe("button");
  await a.trigger("focus");
  expect(a.attributes("aria-expanded")).toBe("false");
  await a.trigger("click");
  expect(a.attributes("aria-expanded")).toBe("true");
  await b.trigger("click");
  expect(a.attributes("aria-expanded")).toBe("false");
  expect(b.attributes("aria-expanded")).toBe("true");
  await b.trigger("click");
  expect(b.attributes("aria-expanded")).toBe("false");
  await b.trigger("click");
  document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  await second.vm.$nextTick();
  expect(b.attributes("aria-expanded")).toBe("false");
});
test("SSR contains panel text, hidden until open, without a render image request", async () => {
  const app = createSSRApp({
    render: () =>
      h(
        Tooltip,
        {},
        {
          default: () => "Yak",
          panel: ({ open }: { open: boolean }) => [
            "Vendor",
            open ? h("img", { src: "/media/render.webp" }) : null,
          ],
        },
      ),
  });
  Object.assign(app._context.components, config.global.components);
  const html = await renderToString(app);
  expect(html).toContain('role="tooltip"');
  expect(html).toContain('data-open="false"');
  expect(html).toContain("Vendor");
  expect(html).not.toContain("<img");
});

test("hover stays open over the panel, flips above and clamps at the right edge", async () => {
  vi.useFakeTimers();
  const wrapper = tooltip();
  await wrapper.vm.$nextTick();
  const trigger = wrapper.get('[tabindex="0"]');
  const panel = wrapper.get('[role="tooltip"]');
  vi.spyOn(trigger.element, "getBoundingClientRect").mockReturnValue({
    left: 335,
    top: 600,
    bottom: 644,
    width: 25,
    height: 44,
  } as DOMRect);
  vi.spyOn(panel.element, "getBoundingClientRect").mockReturnValue({
    width: 320,
    height: 280,
  } as DOMRect);
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(360);
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(700);
  await trigger.trigger("mouseenter");
  await vi.advanceTimersByTimeAsync(120);
  expect((panel.element as HTMLElement).style.left).toBe("24px");
  expect((panel.element as HTMLElement).style.top).toBe("312px");
  await trigger.trigger("mouseleave");
  await panel.trigger("mouseenter");
  await vi.advanceTimersByTimeAsync(150);
  expect(panel.attributes("data-open")).toBe("true");
  await panel.trigger("mouseleave");
  await vi.advanceTimersByTimeAsync(120);
  expect(panel.attributes("data-open")).toBe("false");
});

test("Escape cancels a pending hover; removing an open trigger releases the active tooltip", async () => {
  vi.useFakeTimers();
  const first = tooltip();
  await first.vm.$nextTick();
  await first.get('[tabindex="0"]').trigger("mouseenter");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  await vi.advanceTimersByTimeAsync(150);
  expect(first.get('[role="tooltip"]').attributes("data-open")).toBe("false");
  await first.get('[tabindex="0"]').trigger("focus");
  first.unmount();
  const second = tooltip(false);
  await second.get("button").trigger("click");
  expect(second.get("button").attributes("aria-expanded")).toBe("true");
});
