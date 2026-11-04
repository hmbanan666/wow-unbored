export default defineNuxtConfig({
  compatibilityDate: "2026-11-04",
  modules: ["@nuxt/ui", "@nuxtjs/seo", "nuxt-auth-utils"],
  css: ["~/assets/css/main.css"],
  devServer: { port: 3001 },
  /** Dark only: no color-mode script, no toggle, no light flash. */
  ui: {
    colorMode: false,
  },
  site: {
    url: "https://playunbored.com",
    name: "Unbored",
    description: "Bory gives you one step at a time in World of Warcraft.",
    defaultLocale: "en",
  },
  robots: {
    disallow: [],
  },
  /** Content-Signal is not a robots.txt directive validators know; leave it out. */
  aiReady: {
    contentSignal: false,
  },
  sitemap: {
    sources: ["/api/__sitemap__/urls"],
    exclude: ["/my", "/enter/**"],
  },
  nitro: {
    preset: "node-server",
    /** Ship .br/.gz next to every built asset; the node server picks them by Accept-Encoding. */
    compressPublicAssets: true,
  },
  runtimeConfig: {
    /** Server base URL for sign-in (NUXT_SERVER_URL). Empty uses this request's origin. */
    serverUrl: "",
    /** Sealed cookie, httpOnly, secure, SameSite=Lax; the row in web.sessions decides. */
    session: {
      maxAge: 60 * 60 * 24 * 30,
      cookie: { sameSite: "lax", secure: true, httpOnly: true },
    },
  },
  typescript: {
    strict: true,
  },
  app: {
    head: {
      htmlAttrs: { lang: "en", class: "dark", style: "color-scheme: dark" },
      meta: [
        { name: "color-scheme", content: "dark" },
        { name: "theme-color", content: "#1e1410" },
      ],
      link: [{ rel: "icon", type: "image/png", href: "/bory.png" }],
    },
  },
});
