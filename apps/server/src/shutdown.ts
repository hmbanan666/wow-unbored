import type { Server } from "node:http";
import type { PlanRunner } from "./runner.ts";
import type { PlannerWebhook } from "./webhook.ts";
import type { UploadInbox } from "./inbox.ts";

export function createShutdown(options: {
  server: Pick<Server, "close" | "closeIdleConnections" | "on">;
  runner?: Pick<PlanRunner, "beginShutdown" | "stop">;
  webhook: Pick<PlannerWebhook, "stop">;
  inbox?: Pick<UploadInbox, "stop">;
  close: () => void | Promise<void>;
  log: (line: string) => void;
  exit?: (code: number) => void;
}) {
  const {
    server,
    runner,
    webhook,
    inbox,
    close,
    log,
    exit = (code) => process.exit(code),
  } = options;
  let started = false;
  let finished = false;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const finish = (reason = "", code = 0) => {
    if (finished) return;
    finished = true;
    clearTimeout(deadline);
    log(`Shutdown finished${reason ? ` (${reason})` : ""}`);
    exit(code);
  };

  // Connections serving a response can become idle after close() has started.
  server.on("request", (_request, response) => {
    response.once("finish", () => {
      if (started) server.closeIdleConnections();
    });
  });

  return async () => {
    if (started) {
      finish("second signal");
      return;
    }
    started = true;
    log("Shutdown started");
    // Keep this timer referenced: it also bounds a stuck worker stop.
    deadline = setTimeout(() => finish("deadline reached"), 20_000);
    try {
      runner?.beginShutdown();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeIdleConnections();
      });
      if (finished) return;
      runner?.stop();
      webhook.stop();
      await inbox?.stop();
      if (finished) return;
      await close();
      finish();
    } catch {
      finish("cleanup failed", 1);
    }
  };
}
