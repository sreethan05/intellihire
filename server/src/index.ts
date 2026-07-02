import { createServer } from "http";
import { app } from "./app.js";
import { setupWebSocket } from "./websocket.js";
import { logger } from "./lib/logger.js";
import { config } from "./config.js";

const PORT = Number(config.PORT) || 5000;
const NODE_ENV = config.NODE_ENV;

const httpServer = createServer(app);
const io = setupWebSocket(httpServer);
app.set("io", io);

httpServer.listen(PORT, () => {
  logger.info(
    { port: PORT, env: NODE_ENV },
    `Server running on http://localhost:${PORT}`
  );
  console.log(`✅ Server running in ${NODE_ENV} mode on http://localhost:${PORT}`);
  console.log(`   API:      http://localhost:${PORT}/api/v1`);
  console.log(`   Health:   http://localhost:${PORT}/api/health`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
});

export { io };
