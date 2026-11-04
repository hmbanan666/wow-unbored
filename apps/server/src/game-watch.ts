import { type GameDb, validGameBuild } from "./game-db.ts";
import { downloadGameText } from "./game-download.ts";

export const GAME_WATCH_INTERVAL_MS = 60 * 60 * 1000;

/** Watches retail only; PTR, beta and Classic never select the current Game DB. */
export class GameWatch {
  private readonly game: GameDb;
  private readonly fetchImpl: typeof fetch;
  private readonly log: (line: string) => void;
  private running: Promise<void> | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    game: GameDb,
    fetchImpl: typeof fetch = fetch,
    log: (line: string) => void = () => {},
  ) {
    this.game = game;
    this.fetchImpl = fetchImpl;
    this.log = log;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.run(), GAME_WATCH_INTERVAL_MS);
    this.timer.unref();
    void this.run();
  }

  run(): Promise<void> {
    this.running ??= this.check()
      .catch(() => {
        this.log("Game DB: build check or import failed; retrying next hour.");
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }

  private async check() {
    let build: string;
    try {
      const body = JSON.parse(
        await downloadGameText(
          "https://wago.tools/api/builds/wow/latest",
          64 * 1024,
          this.fetchImpl,
        ),
      );
      if (!validGameBuild(body?.version) || body.product !== "wow")
        throw new Error("Invalid live build");
      build = await this.game.observeLiveBuild(body.version);
    } catch {
      await this.game.watchFailed("discovery_failed");
      throw new Error("Build check failed");
    }
    try {
      const current = await this.game.currentBuild();
      if (!current || Number(build.split(".")[3]) > Number(current.split(".")[3])) {
        const result = await this.game.importAchievements(build, this.fetchImpl);
        this.log(`Game DB: ${result.status} ${result.build}.`);
      }
    } catch {
      await this.game.watchFailed("import_failed");
      throw new Error("Build import failed");
    }
  }

  async stop() {
    clearInterval(this.timer);
    this.timer = undefined;
    await this.running;
  }
}
