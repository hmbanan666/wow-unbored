/** Session row ids authorize Server requests and must never appear in browser JSON. */
export default defineNitroPlugin(() => {
  sessionHooks.hook("fetch", (session, event) => {
    setResponseHeader(event, "cache-control", "private, no-store");
    if (session.user) session.user = { signedIn: true };
  });
});
