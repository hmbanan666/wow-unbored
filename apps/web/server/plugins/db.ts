import { closeDb } from "../utils/db.ts";

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("close", () => closeDb());
});
