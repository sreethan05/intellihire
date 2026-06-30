import { createServer } from "http";
import { app } from "./app.js";
import { setupWebSocket } from "./websocket.js";
import { logger } from "./lib/logger.js";

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || "development";

const httpServer = createServer(app);
const io = setupWebSocket(httpServer);

httpServer.listen(PORT, () => {
  logger.info(
    { port: PORT, env: NODE_ENV },
    `Server running on http://localhost:${PORT}`
  );
  console.log(`✅ Server running in ${NODE_ENV} mode on http://localhost:${PORT}`);
  console.log(`   API:      http://localhost:${PORT}/api`);
  console.log(`   Health:   http://localhost:${PORT}/api/health`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
});

export { io };
