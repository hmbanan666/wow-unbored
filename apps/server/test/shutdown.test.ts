import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { once } from "node:events";
import { test, vi } from "vite-plus/test";
import { createShutdown } from "../src/shutdown.ts";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("shutdown lets an in-flight request finish and closes the store last", async () => {
  const started = deferred();
  const release = deferred();
  const workerStopped = deferred();
  const events: string[] = [];
  const server = createServer(async (_req, res) => {
    started.resolve();
    await release.promise;
    events.push("response");
    res.end("complete");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const shutdown = createShutdown({
    server,
    runner: {
      beginShutdown: () => {
        events.push("claims disabled");
      },
      stop: () => {
        events.push("runner stopped");
      },
    },
    webhook: {
      stop: () => {
        events.push("webhook stopped");
      },
    },
    inbox: {
      stop: async () => {
        events.push("inbox stopping");
        await workerStopped.promise;
        events.push("inbox stopped");
      },
    },
    store: {
      close: () => {
        events.push("store closed");
      },
    },
    log: (line) => {
      events.push(line);
    },
    exit: (code) => {
      events.push(`exit ${code}`);
    },
  });
  const response = new Promise<string>((resolve, reject) => {
    const req = request(`http://127.0.0.1:${address.port}`, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.end();
  });
  let closing: Promise<void> | undefined;
  try {
    await started.promise;
    closing = shutdown();
    assert.equal(server.listening, false);
    assert.deepEqual(events, ["Shutdown started", "claims disabled"]);
    release.resolve();
    assert.equal(await response, "complete");
    await vi.waitFor(() => assert.ok(events.includes("inbox stopping")));
    assert.ok(!events.includes("store closed"));
    workerStopped.resolve();
    await closing;
    assert.deepEqual(events, [
      "Shutdown started",
      "claims disabled",
      "response",
      "runner stopped",
      "webhook stopped",
      "inbox stopping",
      "inbox stopped",
      "store closed",
      "Shutdown finished",
      "exit 0",
    ]);
  } finally {
    release.resolve();
    workerStopped.resolve();
    await closing;
    server.closeAllConnections();
    server.close();
  }
});

for (const blocked of ["HTTP", "upload inbox"]) {
  test(`shutdown exits at the hard cap while ${blocked} is still busy`, async () => {
    vi.useFakeTimers();
    const server = createServer();
    const release = deferred();
    const exits: number[] = [];
    const lines: string[] = [];
    const closeStore = vi.fn();
    const close = vi.spyOn(server, "close").mockImplementation((callback) => {
      if (blocked === "HTTP") void release.promise.then(() => callback?.());
      else callback?.();
      return server;
    });
    const shutdown = createShutdown({
      server,
      webhook: { stop: () => {} },
      inbox: { stop: () => (blocked === "upload inbox" ? release.promise : Promise.resolve()) },
      store: { close: closeStore },
      log: (line) => {
        lines.push(line);
      },
      exit: (code) => {
        exits.push(code);
      },
    });
    const closing = shutdown();
    try {
      await vi.advanceTimersByTimeAsync(19_999);
      assert.deepEqual(exits, []);
      await vi.advanceTimersByTimeAsync(1);
      assert.deepEqual(exits, [0]);
      assert.equal(closeStore.mock.calls.length, 0);
      assert.deepEqual(lines, ["Shutdown started", "Shutdown finished (deadline reached)"]);
    } finally {
      release.resolve();
      await closing;
      close.mockRestore();
      vi.useRealTimers();
    }
  });
}

test("a second signal exits immediately without running cleanup twice", async () => {
  const server = createServer();
  const release = deferred();
  const exits: number[] = [];
  const lines: string[] = [];
  const closeStore = vi.fn();
  const close = vi.spyOn(server, "close").mockImplementation((callback) => {
    void release.promise.then(() => callback?.());
    return server;
  });
  const shutdown = createShutdown({
    server,
    webhook: { stop: () => {} },
    store: { close: closeStore },
    log: (line) => {
      lines.push(line);
    },
    exit: (code) => {
      exits.push(code);
    },
  });
  const closing = shutdown();
  try {
    await shutdown();
    assert.deepEqual(exits, [0]);
    assert.equal(close.mock.calls.length, 1);
    assert.equal(closeStore.mock.calls.length, 0);
    assert.deepEqual(lines, ["Shutdown started", "Shutdown finished (second signal)"]);
  } finally {
    release.resolve();
    await closing;
    close.mockRestore();
  }
  assert.deepEqual(exits, [0]);
});
