const invoke = (command, args) => {
  const tauri = window.__TAURI__;
  if (!tauri || !tauri.core) {
    return Promise.reject(new Error("Open this window from the Unbored Companion app."));
  }
  return tauri.core.invoke(command, args);
};

const status = document.getElementById("status");
const pairing = document.getElementById("pairing");
const addon = document.getElementById("addon");
const wow = document.getElementById("wow");
const plan = document.getElementById("plan");
const url = document.getElementById("url");
const poll = document.getElementById("poll");
const autostart = document.getElementById("autostart");
const progress = document.getElementById("progress");
const needPath = document.getElementById("need-path");

function paint(state) {
  if (document.activeElement !== url) {
    url.value = state.settings.endpointUrl || "";
  }
  if (document.activeElement !== wow) {
    wow.value = state.settings.wowPath || "";
  }
  poll.value = state.settings.pollMinutes ?? 5;
  autostart.checked = !!state.autostart;
  status.textContent = state.status || "";
  const pair = state.pairing || "pending";
  pairing.textContent = pair === "approved"
    ? "This PC is approved."
    : pair === "revoked"
      ? "This PC was revoked."
      : "Waiting for approval";
  addon.textContent = state.addonVersion
    ? `Addon ${state.addonVersion}`
    : "Addon will install when the Retail folder is known.";
  needPath.hidden = !state.needsWowPath;

  progress.innerHTML = "";
  (state.progress || []).forEach((row) => {
    const item = document.createElement("li");
    const current = row.currentId ? ` now ${row.currentId}` : "";
    item.textContent = `${row.character} — ${row.realm}: ${row.done} done, ${row.skipped} skipped${current}`;
    progress.appendChild(item);
  });
}

async function run(action) {
  try {
    paint(await action());
  } catch (err) {
    status.textContent = String(err && err.message ? err.message : err);
  }
}

document.getElementById("use-path").addEventListener("click", () =>
  run(() => invoke("set_wow_path", { path: wow.value }))
);
document.getElementById("write").addEventListener("click", () =>
  run(() => invoke("write_plan_text", { text: plan.value }))
);
document.getElementById("save-endpoint").addEventListener("click", () =>
  run(() =>
    invoke("set_endpoint", {
      url: url.value,
      pollMinutes: Number(poll.value) || 0,
    })
  ).then(armPoll)
);
document.getElementById("fetch").addEventListener("click", () => run(() => invoke("fetch_plan")));
document.getElementById("rescan").addEventListener("click", () => run(() => invoke("rescan_progress")));
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

run(() => invoke("get_state")).then(armPoll);
