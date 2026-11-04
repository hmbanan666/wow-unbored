import { compressPublicHtml } from "../utils/html-compression";

export default defineNitroPlugin((app) => {
  app.hooks.hook("render:response", async (response, { event }) => {
    await compressPublicHtml(
      response,
      event.path,
      event.method,
      getRequestHeader(event, "accept-encoding") || "",
    );
  });
});
