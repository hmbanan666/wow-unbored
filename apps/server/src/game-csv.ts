import { setImmediate as yieldTurn } from "node:timers/promises";

export const GAME_CSV_MAX_BYTES = 256 * 1024 * 1024;
export const GAME_CSV_MAX_ROW_CHARS = 256 * 1024;

/** Strict CSV across arbitrary UTF-8 chunks; never holds a whole source file. */
export async function* gameCsv(url: string, fetchImpl: typeof fetch, signal: AbortSignal) {
  const response = await fetchImpl(url, { signal, redirect: "error" });
  if (!response.ok || !response.body) throw new Error("Game source unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0,
    rowSize = 0;
  let cell = "",
    row: string[] = [];
  let quoted = false,
    closed = false,
    cr = false;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      if (value) size += value.byteLength;
      if (size > GAME_CSV_MAX_BYTES) throw new Error("Game source too large");
      // A source can deliver a large chunk: yield even within that chunk.
      const bytes = value ?? new Uint8Array();
      for (let start = 0; start < bytes.length || (done && start === 0); start += 16_384) {
        const text = decoder.decode(bytes.subarray(start, start + 16_384), { stream: !done });
        for (const c of text) {
          if (++rowSize > GAME_CSV_MAX_ROW_CHARS) throw new Error("Game row too large");
          if (cr) {
            cr = false;
            if (c === "\n") continue;
          }
          if (quoted) {
            if (c === '"') {
              quoted = false;
              closed = true;
            } else cell += c;
          } else if (closed && c === '"') {
            cell += c;
            quoted = true;
            closed = false;
          } else if (c === "," || c === "\n" || c === "\r") {
            row.push(cell);
            cell = "";
            closed = false;
            if (c !== ",") {
              if (row.length !== 1 || row[0] !== "") yield row;
              row = [];
              rowSize = 0;
              cr = c === "\r";
            }
          } else if (closed) {
            throw new Error("Invalid text after quoted game cell");
          } else if (c === '"') {
            if (cell !== "") throw new Error("Invalid quote in game cell");
            quoted = true;
          } else cell += c;
        }
        signal.throwIfAborted();
        await yieldTurn();
      }
      if (done) break;
    }
    if (quoted) throw new Error("Truncated game cell");
    if (row.length || cell || closed) {
      row.push(cell);
      yield row;
    }
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
