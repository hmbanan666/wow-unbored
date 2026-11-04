export default defineNuxtConfig({
  compatibilityDate: "2026-11-04",
  modules: ["@nuxt/ui", "@nuxtjs/seo", "nuxt-auth-utils"],
  css: ["~/assets/css/main.css"],
  devServer: { port: 3001 },
  colorMode: {
    preference: "dark",
    fallback: "dark",
  },
  site: {
    url: "https://unbored.kosarev.space",
    name: "Unbored",
    description: "Bory gives you one step at a time in World of Warcraft.",
    defaultLocale: "en",
  },
  robots: {
    disallow: [],
  },
  sitemap: {
    sources: ["/api/__sitemap__/urls"],
  },
  nitro: {
    preset: "node-server",
  },
  typescript: {
    strict: true,
  },
  app: {
    head: {
      htmlAttrs: { lang: "en" },
      link: [{ rel: "icon", type: "image/png", href: "/bory.png" }],
    },
  },
});
