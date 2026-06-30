import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
          ignore: "pid,hostname",
        },
      }
    : undefined,
  base: {
    service: "intellihire-server",
    version: "1.0.0",
  },
});

export function logRequest(
  method: string,
  url: string,
  statusCode: number,
  durationMs: number,
  userId?: string
) {
  const logData = {
    method,
    url,
    statusCode,
    durationMs,
    ...(userId && { userId }),
  };

  if (statusCode >= 500) {
    logger.error(logData, "Server error response");
  } else if (statusCode >= 400) {
    logger.warn(logData, "Client error response");
  } else {
    logger.info(logData, "Request completed");
  }
}
