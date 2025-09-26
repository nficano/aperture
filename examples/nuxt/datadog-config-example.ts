/**
 * Example configuration for Datadog integration with Aperture
 *
 * This example shows how to configure both server-side logging and browser RUM monitoring
 * using Datadog's API key and RUM client token.
 */

// import { defineNuxtConfig } from "nuxt/config";

export default {
  // Runtime config for sensitive credentials (server-side only)
  runtimeConfig: {
    // Private keys (only available on server-side)
    datadogApiKey: process.env.DATADOG_API_KEY,

    // Public keys (available on both client and server) - for browser RUM
    public: {
      datadogRumApplicationId: process.env.DATADOG_RUM_APPLICATION_ID,
      datadogRumClientToken: process.env.DATADOG_RUM_CLIENT_TOKEN,
      datadogSite: process.env.DATADOG_SITE || "datadoghq.com",
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

      // Datadog configuration with all required credentials
      datadog: {
        // Server-side logging credentials
        apiKey: "", // Will be set from runtimeConfig.datadogApiKey
        service: "my-app",
        environment: process.env.NODE_ENV || "development",
        ddsource: "aperture",

        // Browser RUM credentials (available on client-side via runtimeConfig.public)
        rumApplicationId: "", // Will be set from runtimeConfig.public.datadogRumApplicationId
        rumClientToken: "", // Will be set from runtimeConfig.public.datadogRumClientToken
        site: "", // Will be set from runtimeConfig.public.datadogSite

        // Optional: Custom endpoint for log ingestion
        // endpoint: 'https://http-intake.logs.datadoghq.com/api/v2/logs',

        // Optional: Batching configuration
        batchSize: 100,
        flushIntervalMs: 5000,

        // Optional: Additional tags
        tags: {
          team: "platform",
          region: process.env.AWS_REGION || "us-east-1",
        },
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
      datadog: {
        // Direct configuration (not recommended for production)
        apiKey: "your-datadog-api-key",
        service: "my-app",
        environment: "development",
        rumApplicationId: "your-rum-application-id",
        rumClientToken: "pub30b17cf981de045a7d00ab5c44357a89", // Example token
        site: "datadoghq.com",
        tags: {
          team: "platform",
        },
      },
    },
  },
};

/**
 * Environment Variables Setup:
 *
 * For production, you should set these as environment variables:
 *
 * DATADOG_API_KEY=your-datadog-api-key
 * DATADOG_RUM_APPLICATION_ID=your-rum-application-id
 * DATADOG_RUM_CLIENT_TOKEN=pub30b17cf981de045a7d00ab5c44357a89
 * DATADOG_SITE=datadoghq.com
 *
 * The runtime config approach above will automatically use these environment variables.
 */

/**
 * What this configuration provides:
 *
 * 1. Server-side logging: Logs and metrics from your Nuxt server are sent to Datadog's Log API
 * 2. Browser RUM monitoring: The Datadog RUM agent is automatically injected into your pages for client-side monitoring
 * 3. Real User Monitoring: Tracks page views, user interactions, and performance metrics
 * 4. Error tracking: Captures JavaScript errors and exceptions
 * 5. Performance monitoring: Measures Core Web Vitals and custom metrics
 *
 * The browser RUM agent will automatically:
 * - Track page views and navigation
 * - Monitor user interactions (clicks, form submissions, etc.)
 * - Capture performance metrics (LCP, FID, CLS, etc.)
 * - Send error reports and stack traces
 * - Enable distributed tracing between frontend and backend
 * - Track resource loading and network requests
 */

/**
 * Datadog RUM Features Enabled:
 * - trackInteractions: true (tracks user clicks, form submissions)
 * - trackResources: true (tracks network requests, resource loading)
 * - trackLongTasks: true (tracks long-running JavaScript tasks)
 * - defaultPrivacyLevel: 'mask-user-input' (masks sensitive form inputs)
 * - sampleRate: 100 (100% sampling rate for development, adjust for production)
 */
