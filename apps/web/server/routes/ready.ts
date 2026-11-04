/**
 * Process check for the site container. `/health` stays on the Server.
 * Without NUXT_APP_SECRET sign-in cannot seal a session, so the container
 * reports not ready and a deploy rolls back instead of failing at /enter.
 */
export default defineEventHandler((event) => {
  if ((process.env.NUXT_APP_SECRET ?? "").length < 32) {
    setResponseStatus(event, 503);
    return { ok: false, missing: "NUXT_APP_SECRET" };
  }
  return { ok: true };
});
