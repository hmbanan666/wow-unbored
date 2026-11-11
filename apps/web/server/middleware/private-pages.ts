export default defineEventHandler((event) => {
  const path = event.path.split("?")[0];
  if (path === "/my" || path?.startsWith("/my/")) {
    setResponseHeader(event, "cache-control", "private, no-store");
    setResponseHeader(event, "x-robots-tag", "noindex");
  }
});
