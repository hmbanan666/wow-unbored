const invoke = (command, args) => {
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

const PICTURES = {
  idle: "idle",
  setup: "idle",
  error: "idle",
  ready: "happy",
  thinking: "thinking",
  busy: "thinking",
  pairing: "thinking",
};

const HINTS = {
  idle: "I'll bring your plans and answers into the game.",
  thinking: "Keep playing. I'll tell you when it's ready.",
  busy: "",
  ready: "Click Load next to me in the game.",
  pairing: "Your planner has to say yes to this PC once. Nothing to do here.",
  setup: "I need your World of Warcraft folder to set up the addon.",
  error: "",
};

function paint(state) {
  const phase = state.phase || "idle";
  document.body.dataset.phase = phase;
  mascot.src = `img/wisp-${PICTURES[phase] || "idle"}.png`;
  mascot.alt = state.mascot || "Wisp";
  headline.textContent = state.headline || "";
  hint.textContent = phase === "setup" && state.status ? state.status : HINTS[phase] || "";
  setup.hidden = phase !== "setup";
  document.title = state.mascot || "Unbored";

  if (document.activeElement !== url) url.value = state.settings.endpointUrl || "";
  if (document.activeElement !== wow) wow.value = state.settings.wowPath || "";
  poll.value = state.settings.pollMinutes ?? 5;
  autostart.checked = !!state.autostart;
  status.textContent = state.status || "";
  $("addon").textContent = `Addon ${state.addonVersion || "not installed"}, this PC is ${state.pairing || "pending"}`;
  $("version").textContent = `Companion ${state.version || ""}`;

  progress.innerHTML = "";
  (state.progress || []).forEach((row) => {
    const item = document.createElement("li");
    const current = row.currentId ? ` now ${row.currentId}` : "";
    item.textContent = `${row.character} - ${row.realm}: ${row.done} done, ${row.skipped} skipped${current}`;
    progress.appendChild(item);
  });
}

function showError(err) {
  const text = String(err && err.message ? err.message : err);
  status.textContent = text;
  hint.textContent = text;
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
$("use-path").addEventListener("click", () => run(() => invoke("set_wow_path", { path: wow.value })));
$("write").addEventListener("click", () => run(() => invoke("write_plan_text", { text: plan.value })));
$("save-endpoint").addEventListener("click", () =>
  run(() =>
    invoke("set_endpoint", {
      url: url.value,
      pollMinutes: Number(poll.value) || 0,
    })
  ).then(armPoll)
);
$("fetch").addEventListener("click", () => run(() => invoke("fetch_plan")));
$("rescan").addEventListener("click", () => run(() => invoke("rescan_progress")));
autostart.addEventListener("change", () =>
  run(async () => {
    await invoke("set_autostart", { enabled: autostart.checked });
    return invoke("get_state");
  })
);

let pollTimer = null;
function armPoll() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  const minutes = Number(poll.value) || 0;
  if (minutes <= 0) return;
  pollTimer = setInterval(() => {
    invoke("fetch_plan").then(paint).catch(() => {});
    invoke("rescan_progress").then(paint).catch(() => {});
  }, Math.max(1, minutes) * 60 * 1000);
}

if (window.__TAURI__ && window.__TAURI__.event) {
  window.__TAURI__.event.listen("progress", () => {
    invoke("get_state").then(paint).catch(() => {});
  });
}

setInterval(() => invoke("get_state").then(paint).catch(() => {}), 30 * 1000);

run(() => invoke("get_state")).then(armPoll);
