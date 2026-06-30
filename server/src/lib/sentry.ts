import * as Sentry from "@sentry/node";

const SENTRY_DSN = process.env.SENTRY_DSN;

export function initSentry() {
  if (!SENTRY_DSN) {
    console.log("Sentry not configured. Set SENTRY_DSN in .env to enable error tracking.");
    return false;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    release: process.env.npm_package_version || "1.0.0",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    beforeSend(event) {
      // Filter out sensitive data
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      return event;
    },
  });

  console.log("Sentry initialized");
  return true;
}

export { Sentry };
