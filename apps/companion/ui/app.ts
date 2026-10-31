import type { Plan, PlayerProfile, RequestBody } from "@unbored/contracts";
import boryHappy from "./img/bory-happy.png";
import boryIdle from "./img/bory-idle.png";
import boryThinking from "./img/bory-thinking.png";
import boryWaiting from "./img/bory-waiting.png";

// The window does not build Requests. These names are the same contract the Server stores.
export type { Plan, PlayerProfile, RequestBody };

type Step = { label: string; done?: boolean };
type ProgressRow = {
  character: string;
  realm: string;
  done: number;
  skipped: number;
  currentId?: string;
};
type UiState = {
  phase?: string;
  mascot?: string;
  headline?: string;
  hint?: string;
  status?: string;
  steps?: Step[];
  settings: { endpointUrl?: string; wowPath?: string; pollMinutes?: number };
  autostart?: boolean;
  addonVersion?: string;
  pairing?: string;
  version?: string;
  progress?: ProgressRow[];
  canReconnect?: boolean;
  /** Bory's picture: idle, thinking, waiting or happy (D149). */
  picture?: string;
  /** en or ru, and the window's words in it (docs/adr/0049). */
  lang?: string;
  text?: Record<string, string>;
};

// The window's words come with every state; the English in index.html is
// only what shows before the first one arrives.
let words: Record<string, string> = {};
function say(key: string, ...args: (string | number)[]): string {
  const text = words[key] ?? key;
  return args.reduce<string>((out, arg, i) => out.split(`{${i}}`).join(String(arg)), text);
}

const call = (command: string, args?: Record<string, unknown>): Promise<unknown> => {
  const tauri = window.__TAURI__;
  if (!tauri || !tauri.core) {
    return Promise.reject(new Error(say("UI_OUTSIDE_APP")));
  }
  return tauri.core.invoke(command, args);
};

function asState(value: unknown): UiState {
  if (typeof value === "object" && value !== null && "settings" in value) return value as UiState;
  throw new Error(say("UI_NOTHING"));
}

const invoke = (command: string, args?: Record<string, unknown>) =>
  call(command, args).then(asState);

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

const mascot = el<HTMLImageElement>("mascot");
const headline = el("headline");
const hint = el("hint");
const setup = el("setup");
const reconnect = el("reconnect");
const status = el("status");
const wow = el<HTMLInputElement>("wow");
const plan = el<HTMLTextAreaElement>("plan");
const url = el<HTMLInputElement>("url");
const poll = el<HTMLInputElement>("poll");
const autostart = el<HTMLInputElement>("autostart");
const progress = el("progress");
const steps = el("steps");

// Imported so Vite fingerprints and ships them; a runtime "img/..." path is not in dist/.
// Only Bory's layer changes; the ring (index.html) stays put.
// The picture for each mood comes from mood.rs (MOOD_FOR_PHASE).
const PICTURES: Record<string, string> = {
  idle: boryIdle,
  thinking: boryThinking,
  waiting: boryWaiting,
  happy: boryHappy,
};

function translate(state: UiState) {
  if (!state.text) return;
  words = state.text;
  document.documentElement.lang = state.lang || "en";
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((node) => {
    const key = node.dataset.i18n;
    if (key && words[key]) node.textContent = words[key];
  });
}

function paint(state: UiState) {
  translate(state);
  const phase = state.phase || "idle";
  document.body.dataset.phase = phase;
  mascot.src = PICTURES[state.picture || "idle"] || boryIdle;
  mascot.alt = state.mascot || "Bory";
  headline.textContent = state.headline || "";
  hint.textContent = phase === "setup" && state.status ? state.status : state.hint || "";
  steps.innerHTML = "";
  (state.steps || []).forEach((step) => {
    const row = document.createElement("li");
    row.textContent = step.label;
    if (step.done) row.className = "done";
    steps.appendChild(row);
  });
  setup.hidden = phase !== "setup";
  reconnect.hidden = !state.canReconnect;
  document.title = state.mascot || "Unbored";

  if (document.activeElement !== url) url.value = state.settings.endpointUrl || "";
  if (document.activeElement !== wow) wow.value = state.settings.wowPath || "";
  poll.value = String(state.settings.pollMinutes ?? 5);
  autostart.checked = !!state.autostart;
  status.textContent = state.status || "";
  const pairing = state.pairing ? say(`UI_PAIRING_${state.pairing}`) : say("UI_PAIRING_NONE");
  el("addon").textContent = say(
    "UI_ADDON_LINE",
    state.addonVersion || say("UI_ADDON_NONE"),
    pairing.startsWith("UI_") ? state.pairing || "" : pairing,
  );
  el("version").textContent = say("UI_VERSION", state.version || "");

  progress.innerHTML = "";
  (state.progress || []).forEach((row) => {
    const item = document.createElement("li");
    const current = row.currentId ? say("UI_PROGRESS_NOW", row.currentId) : "";
    item.textContent =
      say("UI_PROGRESS_ROW", row.character, row.realm, row.done, row.skipped) + current;
    progress.appendChild(item);
  });
}

// Details go under Advanced; the headline and hint stay in plain words.
function showError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  status.textContent = message;
}

async function run(action: () => Promise<UiState>) {
  try {
    paint(await action());
  } catch (err) {
    showError(err);
  }
}

async function pickFolder() {
  const tauri = window.__TAURI__ || {};
  const options = { directory: true, title: say("UI_PICK_TITLE") };
  const picked = tauri.dialog
    ? await tauri.dialog.open(options)
    : await call("plugin:dialog|open", { options });
  if (!picked || Array.isArray(picked)) return invoke("get_state");
  return invoke("set_wow_path", { path: String(picked) });
}

el("pick").addEventListener("click", () => run(pickFolder));
el("detect").addEventListener("click", () => run(() => invoke("detect_wow")));
el("use-path").addEventListener("click", () =>
  run(() => invoke("set_wow_path", { path: wow.value })),
);
el("write").addEventListener("click", () =>
  run(() => invoke("write_plan_text", { text: plan.value })),
);
el("save-endpoint").addEventListener("click", () =>
  run(() =>
    invoke("set_endpoint", {
      url: url.value,
      pollMinutes: Number(poll.value) || 0,
    }),
  ).then(armPoll),
);
el("privacy").addEventListener("click", (event) => {
  event.preventDefault();
  call("open_privacy").catch(showError);
});
async function confirmForget() {
  const FORGET = {
    title: say("UI_FORGET_TITLE"),
    message: say("UI_FORGET_MESSAGE"),
    ok: say("UI_FORGET_OK"),
    cancel: say("UI_FORGET_CANCEL"),
  };
  const tauri = window.__TAURI__ || {};
  if (tauri.dialog) {
    return tauri.dialog.ask(FORGET.message, {
      title: FORGET.title,
      kind: "warning",
      okLabel: FORGET.ok,
      cancelLabel: FORGET.cancel,
    });
  }
  const picked = await call("plugin:dialog|message", {
    message: FORGET.message,
    title: FORGET.title,
    kind: "warning",
    buttons: { OkCancelCustom: [FORGET.ok, FORGET.cancel] },
  });
  return picked === FORGET.ok;
}

el("connect-again").addEventListener("click", () => run(() => invoke("connect_again")));
el("forget").addEventListener("click", () =>
  run(async () => {
    if (!(await confirmForget())) return invoke("get_state");
    return invoke("forget_my_data");
  }),
);
el("fetch").addEventListener("click", () => run(() => invoke("fetch_plan")));
el("rescan").addEventListener("click", () => run(() => invoke("rescan_progress")));
autostart.addEventListener("change", () =>
  run(async () => {
    await call("set_autostart", { enabled: autostart.checked });
    return invoke("get_state");
  }),
);

let pollTimer: ReturnType<typeof setInterval> | null = null;
function armPoll() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  const minutes = Number(poll.value) || 0;
  if (minutes <= 0) return;
  pollTimer = setInterval(
    () => {
      invoke("fetch_plan")
        .then(paint)
        .catch(() => {});
      invoke("rescan_progress")
        .then(paint)
        .catch(() => {});
    },
    Math.max(1, minutes) * 60 * 1000,
  );
}

if (window.__TAURI__ && window.__TAURI__.event) {
  window.__TAURI__.event.listen("progress", () => {
    invoke("get_state")
      .then(paint)
      .catch(() => {});
  });
}

setInterval(
  () =>
    invoke("get_state")
      .then(paint)
      .catch(() => {}),
  30 * 1000,
);

run(() => invoke("get_state")).then(armPoll);
