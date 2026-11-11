export default defineNuxtConfig({
  compatibilityDate: "2026-11-04",
  modules: ["@nuxt/fonts", "@nuxtjs/seo", "nuxt-auth-utils"],
  auth: { loadStrategy: "client-only" },
  css: ["~/assets/css/main.css"],
  devServer: { port: 3001 },
  /** Dark only: no UI kit and no color-mode script, so no toggle and no light flash. */
  /**
   * Self-hosted, latin only: Alegreya (reading and headings) and Alegreya Sans (small UI labels).
   * The two faces every page paints first are preloaded.
   */
  fonts: {
    defaults: { subsets: ["latin"], styles: ["normal"] },
    families: [
      {
        name: "Alegreya",
        provider: "google",
        weights: [400, 700],
        preload: { weights: [400, 700] },
      },
      { name: "Alegreya Sans", provider: "google", weights: [500, 700] },
    ],
  },
  site: {
    url: "https://playunbored.com",
    name: "Unbored",
    description: "Bory gives you one step at a time in World of Warcraft.",
    defaultLocale: "en",
  },
  schemaOrg: {
    identity: {
      type: "Organization",
      name: "Unbored",
      url: "https://playunbored.com",
      logo: "/bory.png",
      sameAs: ["https://t.me/playunbored", "https://github.com/hmbanan666/wow-unbored"],
    },
  },
  robots: {
    disallow: ["/download/"],
  },
  /** Content-Signal is not a robots.txt directive validators know; leave it out. */
  aiReady: {
    contentSignal: false,
  },
  sitemap: {
    sources: ["/api/__sitemap__/urls"],
    exclude: ["/my", "/my/**", "/enter/**", "/download/**"],
  },
  nitro: {
    preset: "node-server",
    /** Ship .br/.gz next to every built asset; the node server picks them by Accept-Encoding. */
    compressPublicAssets: true,
  },
  runtimeConfig: {
    mediaDir: "/srv/media",
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
