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
};

const call = (command: string, args?: Record<string, unknown>): Promise<unknown> => {
  const tauri = window.__TAURI__;
  if (!tauri || !tauri.core) {
    return Promise.reject(new Error("Open this window from the Unbored Companion app."));
  }
  return tauri.core.invoke(command, args);
};

function asState(value: unknown): UiState {
  if (typeof value === "object" && value !== null && "settings" in value) return value as UiState;
  throw new Error("The Companion returned nothing to show.");
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
const PICTURES: Record<string, string> = {
  idle: boryIdle,
  setup: boryIdle,
  error: boryIdle,
  ready: boryHappy,
  thinking: boryThinking,
  busy: boryThinking,
  pairing: boryWaiting,
};

function paint(state: UiState) {
  const phase = state.phase || "idle";
  document.body.dataset.phase = phase;
  mascot.src = PICTURES[phase] || boryIdle;
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
  el("addon").textContent =
    `Addon ${state.addonVersion || "not installed"}, this PC is ${state.pairing || "connecting"}`;
  el("version").textContent = `Companion ${state.version || ""}`;

  progress.innerHTML = "";
  (state.progress || []).forEach((row) => {
    const item = document.createElement("li");
    const current = row.currentId ? ` now ${row.currentId}` : "";
    item.textContent = `${row.character} - ${row.realm}: ${row.done} done, ${row.skipped} skipped${current}`;
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
  const options = { directory: true, title: "Choose your World of Warcraft folder" };
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
const FORGET = {
  title: "Forget my data?",
  message:
    "Bory will forget your characters, game data, plans and answers on the planner, and this PC stops sending. This can't be undone.",
  ok: "Forget it all",
  cancel: "Keep it",
};

async function confirmForget() {
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
