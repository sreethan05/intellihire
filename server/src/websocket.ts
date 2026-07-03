import { Server } from "socket.io";
import type { Server as HTTPServer } from "http";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import { logger } from "./lib/logger.js";
import { db } from "./lib/postgres.js";
import { config } from "./config.js";
import { verifyToken } from "./middleware/auth.js";

let ioInstance: Server | null = null;

async function checkRateLimit(redis: Redis, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  if (config.NODE_ENV === "test") return true;
  try {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }
    return current <= limit;
  } catch (err) {
    logger.warn({ err }, "Rate limit Redis error");
    return true;
  }
}

export function setupWebSocket(httpServer: HTTPServer) {
  const pubClient = new Redis(config.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  const subClient = pubClient.duplicate();

  pubClient.on("error", (err) => logger.warn({ err: err.message }, "WebSocket PubClient Redis error"));
  subClient.on("error", (err) => logger.warn({ err: err.message }, "WebSocket SubClient Redis error"));

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        const allowedOrigins =
          process.env.NODE_ENV === "production"
            ? ([process.env.VITE_API_URL].filter(Boolean) as string[])
            : [
                "http://localhost:3000",
                "http://localhost:5000",
                "http://localhost:5173",
                "http://localhost:4173",
                "http://127.0.0.1:5173",
                "http://127.0.0.1:4173",
              ];
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`Not allowed by CORS: ${origin}`));
        }
      },
      credentials: true,
    },
  });

  if (config.NODE_ENV !== "test") {
    io.adapter(createAdapter(pubClient, subClient));
  }

  ioInstance = io;

  // Authentication middleware for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string;
    if (!token) {
      return next(new Error("Authentication required"));
    }
    try {
      const decoded = verifyToken(token);
      (socket as any).authToken = token;
      (socket as any).user = decoded;
      next();
    } catch {
      return next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "WebSocket client connected");

    // Candidate/User joins their personal notification room
    socket.on("notifications:join", (data: { userId: string }) => {
      const room = `user:${data.userId}`;
      socket.join(room);
      logger.info({ socketId: socket.id, room }, "Joined personal notifications room");
    });

    // Candidate joins their exam attempt room
    socket.on("proctor:join", (data: { attemptId: string; role: string }) => {
      const room = `attempt:${data.attemptId}`;
      socket.join(room);
      logger.info({ socketId: socket.id, room, role: data.role }, "Joined proctoring room");
    });

    // Recruiter joins monitoring room for an exam
    socket.on("proctor:monitor", (data: { examId: string }) => {
      const room = `monitor:${data.examId}`;
      socket.join(room);
      logger.info({ socketId: socket.id, room }, "Joined monitoring room");
    });

    // Admin joins the global admin monitoring room
    socket.on("admin:join", () => {
      socket.join("admin");
      logger.info({ socketId: socket.id }, "Admin joined admin room");
    });

    // Candidate sends a snapshot event (broadcast to monitoring room)
    socket.on("proctor:snapshot", async (data: { attemptId: string; examId: string; snapshotData: string; timestamp: string }) => {
      const user = (socket as any).user;
      const userId = user?.id || "anonymous";
      const limitKey = `ratelimit:ws:${userId}:snapshot`;
      const ok = await checkRateLimit(pubClient, limitKey, 10, 10);
      if (!ok) {
        logger.warn({ userId }, "WebSocket snapshot rate limit exceeded");
        socket.emit("error", { message: "Snapshot rate limit exceeded (max 10/10s)" });
        return;
      }

      const monitorRoom = `monitor:${data.examId}`;
      socket.to(monitorRoom).emit("proctor:snapshot", {
        attemptId: data.attemptId,
        snapshotData: data.snapshotData,
        timestamp: data.timestamp,
      });
    });

    // Candidate sends a violation event (broadcast to monitoring room with urgency)
    socket.on("proctor:violation", async (data: { attemptId: string; examId: string; violationCount: number; message: string; timestamp: string }) => {
      const user = (socket as any).user;
      const userId = user?.id || "anonymous";
      const limitKey = `ratelimit:ws:${userId}:violation`;
      const ok = await checkRateLimit(pubClient, limitKey, 5, 10);
      if (!ok) {
        logger.warn({ userId }, "WebSocket violation rate limit exceeded");
        socket.emit("error", { message: "Violation rate limit exceeded (max 5/10s)" });
        return;
      }

      const monitorRoom = `monitor:${data.examId}`;
      io.to(monitorRoom).emit("proctor:violation", {
        attemptId: data.attemptId,
        violationCount: data.violationCount,
        message: data.message,
        timestamp: data.timestamp,
      });

      try {
        const { data: attempt } = await db.from("attempts").select("candidate_id, exams:exam_id(title)").eq("id", data.attemptId).single() as any;
        const candidateId = attempt?.candidate_id;
        const examTitle = attempt?.exams?.title || "Exam";
        let candidateName = "Candidate";
        if (candidateId) {
          const { data: candidate } = await db.from("users").select("name").eq("id", candidateId).single();
          candidateName = candidate?.name || "Candidate";
        }

        io.to("admin").emit("admin:proctor_violation", {
          attemptId: data.attemptId,
          candidateName,
          examTitle,
          message: data.message,
          violationCount: data.violationCount,
          timestamp: data.timestamp,
        });
      } catch (err) {
        logger.error(err, "Failed to resolve names for admin alert");
      }

      logger.warn({ attemptId: data.attemptId, violationCount: data.violationCount }, "Proctoring violation broadcast");
    });

    // Candidate leaves the exam
    socket.on("proctor:leave", (data: { attemptId: string }) => {
      socket.leave(`attempt:${data.attemptId}`);
    });

    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id }, "WebSocket client disconnected");
    });
  });

  return io;
}

export function sendRealtimeNotification(
  userId: string,
  payload: { title: string; body: string; type: string; metadata?: any }
) {
  if (ioInstance) {
    ioInstance.to(`user:${userId}`).emit("notification", payload);
    logger.info({ userId, type: payload.type }, "Sent real-time WebSocket notification");
  }
}
