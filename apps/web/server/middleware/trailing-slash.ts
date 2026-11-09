/** One canonical path, preserving the original query encoding and repeated parameters. */
export default defineEventHandler((event) => {
  const [path, ...query] = event.path.split("?");
  if (!path || path === "/" || !path.endsWith("/")) return;
  const target = path.replace(/\/+$/, "") || "/";
  // A Location beginning with // would be an external redirect.
  if (target.startsWith("//")) return;
  return sendRedirect(event, target + (query.length ? `?${query.join("?")}` : ""), 301);
});
