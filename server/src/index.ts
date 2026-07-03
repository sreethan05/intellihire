import { createServer } from "http";
import { app } from "./app.js";
import { setupWebSocket } from "./websocket.js";
import { logger } from "./lib/logger.js";
import { config } from "./config.js";
import { pool } from "./lib/postgres.js";
import { redisClient } from "./lib/cache.js";
import { runDataRetentionCleanup } from "./lib/dataRetention.js";

const PORT = Number(config.PORT) || 5000;
const NODE_ENV = config.NODE_ENV;

const httpServer = createServer(app);
const io = setupWebSocket(httpServer);
app.set("io", io);

const serverInstance = httpServer.listen(PORT, () => {
  logger.info(
    { port: PORT, env: NODE_ENV },
    `Server running on http://localhost:${PORT}`
  );
  console.log(`✅ Server running in ${NODE_ENV} mode on http://localhost:${PORT}`);
  console.log(`   API:      http://localhost:${PORT}/api/v1`);
  console.log(`   Health:   http://localhost:${PORT}/api/health`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);

  // Run data retention log cleanup on startup
  runDataRetentionCleanup().catch((err) => logger.error({ err }, "Initial data retention cleanup failed"));

  // Schedule to run every 24 hours
  setInterval(() => {
    runDataRetentionCleanup().catch((err) => logger.error({ err }, "Periodic data retention cleanup failed"));
  }, 24 * 60 * 60 * 1000);
});

async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  // Close HTTP server & sockets
  serverInstance.close(() => {
    logger.info("HTTP server closed");
  });

  if (io) {
    io.close(() => {
      logger.info("Socket.io server closed");
    });
  }

  // Close Redis client
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info("Redis client disconnected");
    } catch (err) {
      logger.error({ err }, "Error disconnecting Redis client");
    }
  }

  // Close database pool
  try {
    await pool.end();
    logger.info("Database pool closed");
  } catch (err) {
    logger.error({ err }, "Error closing database pool");
  }

  logger.info("Graceful shutdown completed. Exiting process.");
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

export { io };
