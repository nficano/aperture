import {
  instrumentApiCall,
  requireApertureLogger,
} from "@teachmehipaa/aperture";

export default defineEventHandler(async (event) => {
  // Method 1: Use requireApertureLogger() - recommended for server API routes
  const authLogger = requireApertureLogger()
    .withDomain("auth")
    .withImpact("reliability")
    .withTags({ route: event.path });

  const instrument = instrumentApiCall(authLogger, "GET /api/users");

  return await instrument.run(async () => {
    // Your API logic here
    authLogger.info("Processing user request", {
      tags: { userId: "user-123" },
      impact: "engagement",
    });

    return { users: [], total: 0 };
  });
});

// Alternative Method 2: Using useNuxtApp() (if available in your Nuxt version)
/*
export default defineEventHandler(async (event) => {
  const nuxtApp = useNuxtApp();
  const authLogger = nuxtApp.$apertureLogger
    .withDomain("auth")
    .withImpact("reliability")
    .withTags({ route: event.path });

  const instrument = instrumentApiCall(authLogger, "GET /api/users");

  return await instrument.run(async () => {
    // Your API logic here
    return { users: [], total: 0 };
  });
});
*/
