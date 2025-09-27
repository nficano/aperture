export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  modules: [
    // Use the local module source in this repo
    "../../src/integrations/nuxt/module",
  ],
  aperture: {
    environment: process.env.NODE_ENV as any,
    defaultTags: { service: "nuxt-example" },
    domains: [
      { name: "auth", defaultImpact: "reliability" },
      { name: "content", defaultImpact: "engagement" },
    ],
    providers: {
      // Console provider is enabled by default; keeping explicit for clarity
      console: { enableColors: true },
      datadog: {
        // TODO: add region support
        debug: true,
        apiKey: "",
        service: "nuxt-example",
        // TODO: Update the interface to:
        // rum: {
        //   applicationId: "",
        //   clientToken: "",
        // }
        // site: 'datadoghq.com',
      },
      newRelic: {
        // TODO: add region support
        licenseKey: "",
        // TODO: implement browser api for the client/tunnel
        //browserKey: "",
        service: "nuxt-app",
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
