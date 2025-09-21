import type { H3Event } from "h3";
import {
  instrumentApiCall,
  instrumentUserJourney,
} from "../../src/core/instruments/Instrumentation.js";
import type { Logger } from "../../src/core/logger/Logger.js";

interface MiddlewareContext {
  logger: Logger;
  event: H3Event;
}

export async function authMiddleware({ logger, event }: MiddlewareContext) {
  const domainLogger = logger.withDomain("auth").withImpact("reliability");

  const loginJourney = instrumentUserJourney(
    domainLogger,
    "email-password-login",
    {
      tags: {
        path: event.path,
        method: event.method,
      },
      impact: "revenue",
    }
  );

  return await loginJourney.run(async () => {
    loginJourney.step({
      step: "start",
      metadata: { ip: event.node.req.socket.remoteAddress },
    });

    const apiInstrument = instrumentApiCall(
      domainLogger,
      "POST /api/auth/login",
      {
        tags: {
          userAgent: event.node.req.headers["user-agent"],
        },
        impact: "reliability",
      }
    );

    const user = await apiInstrument.run(() => {
      // perform downstream authentication call
      return { id: "user-123", plan: "pro" };
    });

    loginJourney.annotate({ plan: user.plan });
    loginJourney.step({ step: "challenge-verified" });

    // Business logic
    return { status: "ok", user };
  });
}
