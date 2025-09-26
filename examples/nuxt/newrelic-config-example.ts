/**
 * Example configuration for New Relic integration with Aperture
 *
 * This example shows how to configure both server-side logging and browser monitoring
 * using the credentials from your New Relic browser snippet.
 */

// import { defineNuxtConfig } from "nuxt/config";

export default {
  // Runtime config for sensitive credentials (server-side only)
  runtimeConfig: {
    // Private keys (only available on server-side)
    newRelicLicenseKey: process.env.NEW_RELIC_LICENSE_KEY,
    newRelicAccountId: process.env.NEW_RELIC_ACCOUNT_ID,
    newRelicTrustKey: process.env.NEW_RELIC_TRUST_KEY,
    newRelicAgentId: process.env.NEW_RELIC_AGENT_ID,
    newRelicApplicationId: process.env.NEW_RELIC_APPLICATION_ID,

    // Public keys (available on both client and server)
    public: {
      newRelicAccountId: process.env.NEW_RELIC_ACCOUNT_ID,
      newRelicTrustKey: process.env.NEW_RELIC_TRUST_KEY,
      newRelicAgentId: process.env.NEW_RELIC_AGENT_ID,
      newRelicApplicationId: process.env.NEW_RELIC_APPLICATION_ID,
    },
  },

  aperture: {
    enabled: true,
    environment: process.env.NODE_ENV || "development",
    defaultTags: {
      service: "my-app",
      version: process.env.APP_VERSION || "1.0.0",
    },
    providers: {
      // Console provider for development
      console: process.env.NODE_ENV === "development",

      // New Relic configuration - credentials will be injected from runtime config
      newRelic: {
        // These will be populated from runtime config in the plugin
        licenseKey: "", // Will be set from runtimeConfig.newRelicLicenseKey
        service: "my-app",
        environment: process.env.NODE_ENV || "development",

        // Browser agent credentials (available on client-side via runtimeConfig.public)
        accountID: "", // Will be set from runtimeConfig.public.newRelicAccountId
        trustKey: "", // Will be set from runtimeConfig.public.newRelicTrustKey
        agentID: "", // Will be set from runtimeConfig.public.newRelicAgentId
        applicationID: "", // Will be set from runtimeConfig.public.newRelicApplicationId

        // Optional: Custom endpoint for log ingestion
        // endpoint: 'https://log-api.newrelic.com/log/v1',

        // Optional: Batching configuration
        batchSize: 100,
        flushIntervalMs: 5000,
      },
    },
  },
};

/**
 * Alternative: Direct Configuration (for development/testing)
 *
 * For development or when you want to hardcode values directly:
 */
export const directConfigExample = {
  aperture: {
    enabled: true,
    environment: "development",
    defaultTags: {
      service: "my-app",
    },
    providers: {
      console: true,
      newRelic: {
        // Direct configuration (not recommended for production)
        licenseKey: "NRJS-042a3558a53d3db120d",
        service: "my-app",
        environment: "development",
        accountID: "7112268",
        trustKey: "7112268",
        agentID: "1589134127",
        applicationID: "1589134127",
      },
    },
  },
};

/**
 * Environment Variables Setup:
 *
 * For production, you should set these as environment variables:
 *
 * NEW_RELIC_LICENSE_KEY=NRJS-042a3558a53d3db120d
 * NEW_RELIC_ACCOUNT_ID=7112268
 * NEW_RELIC_TRUST_KEY=7112268
 * NEW_RELIC_AGENT_ID=1589134127
 * NEW_RELIC_APPLICATION_ID=1589134127
 *
 * The runtime config approach above will automatically use these environment variables.
 */

/**
 * What this configuration provides:
 *
 * 1. Server-side logging: Logs and metrics from your Nuxt server are sent to New Relic's Log API
 * 2. Browser monitoring: The browser agent is automatically injected into your pages for client-side monitoring
 * 3. Distributed tracing: Enabled by default for end-to-end request tracing
 * 4. Performance monitoring: Captures measures and user interactions
 *
 * The browser agent will automatically:
 * - Track page views and navigation
 * - Monitor AJAX requests and errors
 * - Capture user interactions
 * - Send performance metrics
 * - Enable distributed tracing between frontend and backend
 */
