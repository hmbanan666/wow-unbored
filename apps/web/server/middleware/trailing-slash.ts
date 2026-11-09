/** One canonical path, preserving the original query encoding and repeated parameters. */
export default defineEventHandler((event) => {
  const [path, ...query] = event.path.split("?");
  if (!path || path === "/" || !path.endsWith("/")) return;
  const target = path.replace(/\/+$/, "") || "/";
  // Redirect encoding and browser URL parsing must not turn a path into an external host.
  try {
    const decoded = decodeURIComponent(target).replace(/[\t\n\r]/g, "");
    if (/^[/\\]{2}/.test(decoded)) return;
  } catch {
    return;
  }
  return sendRedirect(event, target + (query.length ? `?${query.join("?")}` : ""), 301);
});
