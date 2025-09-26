/**
 * Example server-side API route for tunneling Datadog RUM data
 * 
 * This file shows how to create a Nuxt server API route that receives
 * RUM data from the browser and forwards it to Datadog.
 * 
 * Place this file in your Nuxt project at: server/api/datadog/rum.post.ts
 */

import { createDatadogRumTunnelHandler } from "@teachmehipaa/aperture";

// Get your Datadog configuration from environment variables or runtime config
const datadogConfig = {
  apiKey: process.env.DATADOG_API_KEY!,
  rumClientToken: process.env.DATADOG_RUM_CLIENT_TOKEN!,
  site: process.env.DATADOG_SITE || 'datadoghq.com',
  debug: process.env.NODE_ENV === 'development',
};

// Create the tunnel handler
const tunnelHandler = createDatadogRumTunnelHandler(datadogConfig);

// Export the handler as a Nuxt server API route
export default defineEventHandler(tunnelHandler);

/**
 * Alternative: Manual implementation without using the helper
 * 
 * If you prefer to implement the tunnel manually:
 */
export const manualTunnelExample = defineEventHandler(async (event) => {
  try {
    // Get the request body
    const body = await readBody(event);
    
    console.debug("[datadog-tunnel] Received RUM data:", {
      bodySize: JSON.stringify(body).length,
    });

    // Forward the RUM data to Datadog's RUM intake endpoint
    const rumEndpoint = `https://rum-http-intake.logs.${datadogConfig.site}/v1/input/${datadogConfig.rumClientToken}`;
    
    const response = await $fetch(rumEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'DD-API-KEY': datadogConfig.apiKey,
        'DD-EVP-ORIGIN': 'browser',
        'DD-EVP-ORIGIN-VERSION': '1.0.0',
      },
      body: body,
    });

    console.debug("[datadog-tunnel] Successfully forwarded RUM data to Datadog");

    return { success: true };
  } catch (error) {
    console.error("[datadog-tunnel] Failed to forward RUM data:", error);
    
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to forward RUM data to Datadog',
    });
  }
});

/**
 * Configuration for tunneling:
 * 
 * In your nuxt.config.ts:
 * 
 * export default defineNuxtConfig({
 *   runtimeConfig: {
 *     datadogApiKey: process.env.DATADOG_API_KEY,
 *     public: {
 *       datadogRumApplicationId: process.env.DATADOG_RUM_APPLICATION_ID,
 *       datadogRumClientToken: process.env.DATADOG_RUM_CLIENT_TOKEN,
 *       datadogSite: process.env.DATADOG_SITE || 'datadoghq.com',
 *     },
 *   },
 *   
 *   aperture: {
 *     providers: {
 *       datadog: {
 *         apiKey: "", // Will be populated from runtime config
 *         service: "my-app",
 *         environment: "production",
 *         rumApplicationId: "", // Will be populated from runtime config
 *         rumClientToken: "", // Will be populated from runtime config
 *         site: "", // Will be populated from runtime config
 *         tunnelRum: true, // Enable server-side tunneling
 *         rumTunnelEndpoint: "/api/datadog/rum", // Server endpoint
 *         debug: process.env.NODE_ENV === "development",
 *       },
 *     },
 *   },
 * });
 * 
 * Environment variables needed:
 * DATADOG_API_KEY=your-datadog-api-key
 * DATADOG_RUM_APPLICATION_ID=your-rum-application-id
 * DATADOG_RUM_CLIENT_TOKEN=pub30b17cf981de045a7d00ab5c44357a89
 * DATADOG_SITE=datadoghq.com
 */
