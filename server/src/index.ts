import { serve } from "@hono/node-server";

import { createApp } from "./app.ts";
import { configFromEnv } from "./config.ts";

const config = configFromEnv();
const { app, webhook } = createApp(config);
webhook.start();

serve({ fetch: app.fetch, hostname: "0.0.0.0", port: config.port }, (info) => {
  console.log(`Unbored server listening on ${info.port}`);
});
