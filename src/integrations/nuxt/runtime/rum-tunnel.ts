/**
 * Server-side handler for tunneling Datadog RUM data
 * This allows RUM data to be sent through your server instead of directly to Datadog
 */

import type { DatadogProviderOptions } from "../../../types/index.js";

/**
 * Creates a server-side handler for tunneling Datadog RUM data
 * @param {DatadogProviderOptions} options - Datadog provider options
 * @returns {Function} Nuxt server handler function
 */
export function createDatadogRumTunnelHandler(options: DatadogProviderOptions) {
  return async (event: any) => {
    try {
      // Get the request body
      const body = await readBody(event);
      
      if (options.debug) {
        console.debug("[datadog-tunnel] Received RUM data:", {
          bodySize: JSON.stringify(body).length,
          endpoint: options.endpoint,
        });
      }

      // Forward the RUM data to Datadog's RUM intake endpoint
      const rumEndpoint = `https://rum-http-intake.logs.${options.site || 'datadoghq.com'}/v1/input/${options.rumClientToken}`;
      
      const response = await fetch(rumEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DD-API-KEY': options.apiKey,
          'DD-EVP-ORIGIN': 'browser',
          'DD-EVP-ORIGIN-VERSION': '1.0.0',
        },
        body: JSON.stringify(body),
      });

      if (options.debug) {
        console.debug("[datadog-tunnel] Successfully forwarded RUM data to Datadog");
      }

      return { success: true };
    } catch (error) {
      if (options.debug) {
        console.error("[datadog-tunnel] Failed to forward RUM data:", error);
      }
      
      throw new Error('Failed to forward RUM data to Datadog');
    }
  };
}

/**
 * Helper function to read request body (Nuxt 3 compatible)
 */
async function readBody(event: any): Promise<any> {
  if (event.node.req.method === 'GET') {
    return {};
  }
  
  return new Promise((resolve, reject) => {
    let body = '';
    event.node.req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    event.node.req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    event.node.req.on('error', reject);
  });
}
