import { expect, test, vi } from "vite-plus/test";
import { mount, flushPromises } from "@vue/test-utils";
import PhoneSignIn from "../../app/components/PhoneSignIn.vue";

const url = `https://site.test/enter/${"a".repeat(43)}`;
test("phone sign-in mints on click, renders inline QR and copies the link, then expires", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockResolvedValue({ ok: true, url, expiresAt: Date.now() / 1000 + 600 });
  const copy = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("$fetch", fetch);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
  const wrapper = mount(PhoneSignIn);
  expect(fetch).not.toHaveBeenCalled();
  await wrapper.get("button").trigger("click");
  await flushPromises();
  expect(fetch).toHaveBeenCalledWith("/api/me/page-link", {
    method: "POST",
    body: {},
    cache: "no-store",
  });
  expect(wrapper.find("svg path").exists()).toBe(true);
  expect(wrapper.find("img").exists()).toBe(false);
  expect(wrapper.get("input").element.value).toBe(url);
  await wrapper
    .findAll("button")
    .find((b) => b.text() === "Copy")!
    .trigger("click");
  await flushPromises();
  expect(copy).toHaveBeenCalledWith(url);
  expect(wrapper.text()).toContain("Copied");
  await vi.advanceTimersByTimeAsync(600_001);
  expect(wrapper.find("svg").exists()).toBe(false);
  expect(wrapper.find("input").exists()).toBe(false);
  expect(wrapper.text()).toContain("expired");
  expect(wrapper.text()).toContain("Make a new link");
});
test("failed phone sign-in offers a retry and a failed copy leaves the selectable link", async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error("private credential"))
    .mockResolvedValue({ ok: true, url, expiresAt: Date.now() / 1000 + 600 });
  vi.stubGlobal("$fetch", fetch);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async () => {
        throw new Error("denied");
      },
    },
  });
  const wrapper = mount(PhoneSignIn);
  await wrapper.get("button").trigger("click");
  await flushPromises();
  expect(wrapper.text()).toContain("Try again");
  expect(wrapper.text()).not.toContain("private credential");
  await wrapper
    .findAll("button")
    .find((b) => b.text() === "Make a new link")!
    .trigger("click");
  await flushPromises();
  await wrapper
    .findAll("button")
    .find((b) => b.text() === "Copy")!
    .trigger("click");
  await flushPromises();
  expect(wrapper.text()).toContain("Select the link");
  expect(wrapper.get("input").element.value).toBe(url);
});
