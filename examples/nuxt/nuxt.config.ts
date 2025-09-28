export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  modules: [
    // Use the local module source in this repo
    "../../src/integrations/nuxt/module",
  ],
  aperture: {
    environment: import.meta.env.NODE_ENV as any,
    defaultTags: { service: "nuxt-app" },
    domains: [
      { name: "auth", defaultImpact: "reliability" },
      { name: "content", defaultImpact: "engagement" },
    ],
    providers: {
      consola: {
        debug: true,
        fancy: true,
        prettyJson: true,
      },
      datadog: {
        debug: true,
        apiKey: "",
        service: "nuxt-app",
        region: "us3",
        rum: {
          applicationId: "",
          clientToken: "",
        },
      },
      newRelic: {
        licenseKey: "",
        browserKey: "",
        service: "nuxt-app",
        region: "us",
        accountID: "",
        trustKey: "",
        agentID: "",
        applicationID: "",
      },
    },
    tunnel: {
      path: "/api/aperture",
      // For dev, unsigned allowed; set JWT in production
      // jwtSecret: process.env.APERTURE_TUNNEL_SECRET,
    },
  },
});
