// @ts-nocheck — the window was plain script; the import below is the shared contract.
import type { Plan, PlayerProfile, RequestBody } from "@unbored/contracts";
import boryHappy from "./img/bory-happy.png";
import boryIdle from "./img/bory-idle.png";
import boryThinking from "./img/bory-thinking.png";
import boryWaiting from "./img/bory-waiting.png";

// The window does not build Requests. These names are the same contract the Server stores.
export type { Plan, PlayerProfile, RequestBody };

const invoke = (command: string, args?: Record<string, unknown>) => {
  const tauri = window.__TAURI__;
  if (!tauri || !tauri.core) {
    return Promise.reject(new Error("Open this window from the Unbored Companion app."));
  }
  return tauri.core.invoke(command, args);
};

const $ = (id) => document.getElementById(id);
const mascot = $("mascot");
const headline = $("headline");
const hint = $("hint");
const setup = $("setup");
const status = $("status");
const wow = $("wow");
const plan = $("plan");
const url = $("url");
const poll = $("poll");
const autostart = $("autostart");
const progress = $("progress");
const steps = $("steps");

// Imported so Vite fingerprints and ships them; a runtime "img/..." path is not in dist/.
// Only Bory's layer changes; the ring (index.html) stays put.
const PICTURES = {
  idle: boryIdle,
  setup: boryIdle,
  error: boryIdle,
  ready: boryHappy,
  thinking: boryThinking,
  busy: boryThinking,
  pairing: boryWaiting,
};

function paint(state) {
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
  document.title = state.mascot || "Unbored";

  if (document.activeElement !== url) url.value = state.settings.endpointUrl || "";
  if (document.activeElement !== wow) wow.value = state.settings.wowPath || "";
  poll.value = state.settings.pollMinutes ?? 5;
  autostart.checked = !!state.autostart;
  status.textContent = state.status || "";
  $("addon").textContent =
    `Addon ${state.addonVersion || "not installed"}, this PC is ${state.pairing || "connecting"}`;
  $("version").textContent = `Companion ${state.version || ""}`;

  progress.innerHTML = "";
  (state.progress || []).forEach((row) => {
    const item = document.createElement("li");
    const current = row.currentId ? ` now ${row.currentId}` : "";
    item.textContent = `${row.character} - ${row.realm}: ${row.done} done, ${row.skipped} skipped${current}`;
    progress.appendChild(item);
  });
}

// Details go under Advanced; the headline and hint stay in plain words.
function showError(err) {
  status.textContent = String(err && err.message ? err.message : err);
}

async function run(action) {
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
    : await invoke("plugin:dialog|open", { options });
  if (!picked) return invoke("get_state");
  return invoke("set_wow_path", { path: String(picked) });
}

$("pick").addEventListener("click", () => run(pickFolder));
$("detect").addEventListener("click", () => run(() => invoke("detect_wow")));
$("use-path").addEventListener("click", () =>
  run(() => invoke("set_wow_path", { path: wow.value })),
);
$("write").addEventListener("click", () =>
  run(() => invoke("write_plan_text", { text: plan.value })),
);
$("save-endpoint").addEventListener("click", () =>
  run(() =>
    invoke("set_endpoint", {
      url: url.value,
      pollMinutes: Number(poll.value) || 0,
    }),
  ).then(armPoll),
);
$("privacy").addEventListener("click", (event) => {
  event.preventDefault();
  invoke("open_privacy").catch(showError);
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
  const picked = await invoke("plugin:dialog|message", {
    message: FORGET.message,
    title: FORGET.title,
    kind: "warning",
    buttons: { OkCancelCustom: [FORGET.ok, FORGET.cancel] },
  });
  return picked === FORGET.ok;
}

$("forget").addEventListener("click", () =>
  run(async () => {
    if (!(await confirmForget())) return invoke("get_state");
    return invoke("forget_my_data");
  }),
);
$("fetch").addEventListener("click", () => run(() => invoke("fetch_plan")));
$("rescan").addEventListener("click", () => run(() => invoke("rescan_progress")));
autostart.addEventListener("change", () =>
  run(async () => {
    await invoke("set_autostart", { enabled: autostart.checked });
    return invoke("get_state");
  }),
);

let pollTimer = null;
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
