import { Server } from "socket.io";
import type { Server as HTTPServer } from "http";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import { logger } from "./lib/logger.js";
import { db } from "./lib/postgres.js";
import { config } from "./config.js";
import { verifyToken, getCookie, ACCESS_TOKEN_COOKIE } from "./middleware/auth.js";

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
    enableOfflineQueue: true, // Enabled to allow Socket.IO adapter to queue subscription commands during connection handshake
  });
  const subClient = pubClient.duplicate();

  pubClient.on("error", (err) => logger.warn({ err: err.message }, "WebSocket PubClient Redis error"));
  subClient.on("error", (err) => logger.warn({ err: err.message }, "WebSocket SubClient Redis error"));

  const io = new Server(httpServer, {
    maxHttpBufferSize: 1e6, // 1MB payload limit
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
  io.use(async (socket, next) => {
    const ip = socket.handshake.address || "unknown";
    const connLimitKey = `ratelimit:ws:conn:${ip}`;
    const connOk = await checkRateLimit(pubClient, connLimitKey, 30, 60);
    if (!connOk) {
      logger.warn({ ip }, "WebSocket connection rate limit exceeded");
      return next(new Error("Connection rate limit exceeded"));
    }

    const cookieToken = getCookie(socket.handshake.headers.cookie, ACCESS_TOKEN_COOKIE);
    const authToken = socket.handshake.auth.token as string;
    const token = cookieToken || authToken;

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
      const authUser = (socket as any).user;
      if (!authUser || authUser.id !== data.userId) {
        logger.warn({ socketId: socket.id, userId: data.userId, authUserId: authUser?.id }, "Unauthorized notifications join attempt");
        socket.emit("error", { message: "Unauthorized notifications room join" });
        return;
      }
      const room = `user:${data.userId}`;
      socket.join(room);
      logger.info({ socketId: socket.id, room }, "Joined personal notifications room");
    });

    // Candidate joins their exam attempt room
    socket.on("proctor:join", async (data: { attemptId: string; role: string }) => {
      const authUser = (socket as any).user;
      if (!authUser) {
        socket.emit("error", { message: "Authentication required" });
        return;
      }
      if (authUser.role === "candidate") {
        const { data: attempt, error } = await db
          .from("attempts")
          .select("candidate_id")
          .eq("id", data.attemptId)
          .single();
        if (error || !attempt || attempt.candidate_id !== authUser.id) {
          logger.warn({ socketId: socket.id, attemptId: data.attemptId, authUserId: authUser.id }, "Unauthorized attempt room join");
          socket.emit("error", { message: "Unauthorized attempt room join" });
          return;
        }
      } else if (authUser.role !== "recruiter" && authUser.role !== "admin") {
        logger.warn({ socketId: socket.id, role: authUser.role }, "Unauthorized attempt room join role");
        socket.emit("error", { message: "Unauthorized attempt room join" });
        return;
      }
      const room = `attempt:${data.attemptId}`;
      socket.join(room);
      logger.info({ socketId: socket.id, room, role: data.role }, "Joined proctoring room");
    });

    // Recruiter joins monitoring room for an exam
    socket.on("proctor:monitor", async (data: { examId: string }) => {
      const authUser = (socket as any).user;
      if (!authUser) {
        socket.emit("error", { message: "Authentication required" });
        return;
      }
      if (authUser.role === "recruiter") {
        const { data: exam, error } = await db
          .from("exams")
          .select("created_by")
          .eq("id", data.examId)
          .single();
        if (error || !exam || exam.created_by !== authUser.id) {
          logger.warn({ socketId: socket.id, examId: data.examId, authUserId: authUser.id }, "Unauthorized monitor room join");
          socket.emit("error", { message: "Unauthorized monitor room join" });
          return;
        }
      } else if (authUser.role !== "admin") {
        logger.warn({ socketId: socket.id, role: authUser.role }, "Unauthorized monitor room join role");
        socket.emit("error", { message: "Unauthorized monitor room join" });
        return;
      }
      const room = `monitor:${data.examId}`;
      socket.join(room);
      logger.info({ socketId: socket.id, room }, "Joined monitoring room");
    });

    // Admin joins the global admin monitoring room
    socket.on("admin:join", () => {
      const authUser = (socket as any).user;
      if (!authUser || authUser.role !== "admin") {
        logger.warn({ socketId: socket.id, role: authUser?.role }, "Unauthorized admin room join");
        socket.emit("error", { message: "Unauthorized admin room join" });
        return;
      }
      socket.join("admin");
      logger.info({ socketId: socket.id }, "Admin joined admin room");
    });

    // Candidate sends a snapshot event (broadcast to monitoring room)
    socket.on("proctor:snapshot", async (data: { attemptId: string; examId: string; snapshotData: string; timestamp: string }) => {
      const user = (socket as any).user;
      if (!user) {
        socket.emit("error", { message: "Authentication required" });
        return;
      }
      if (user.role === "candidate") {
        const { data: attempt, error } = await db
          .from("attempts")
          .select("candidate_id")
          .eq("id", data.attemptId)
          .single();
        if (error || !attempt || attempt.candidate_id !== user.id) {
          logger.warn({ socketId: socket.id, attemptId: data.attemptId, authUserId: user.id }, "Unauthorized snapshot transmission");
          socket.emit("error", { message: "Unauthorized attempt" });
          return;
        }
      } else if (user.role !== "recruiter" && user.role !== "admin") {
        logger.warn({ socketId: socket.id, role: user.role }, "Unauthorized snapshot sender role");
        socket.emit("error", { message: "Unauthorized role" });
        return;
      }

      const userId = user.id;
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
      if (!user) {
        socket.emit("error", { message: "Authentication required" });
        return;
      }
      if (user.role === "candidate") {
        const { data: attempt, error } = await db
          .from("attempts")
          .select("candidate_id")
          .eq("id", data.attemptId)
          .single();
        if (error || !attempt || attempt.candidate_id !== user.id) {
          logger.warn({ socketId: socket.id, attemptId: data.attemptId, authUserId: user.id }, "Unauthorized violation transmission");
          socket.emit("error", { message: "Unauthorized attempt" });
          return;
        }
      } else if (user.role !== "recruiter" && user.role !== "admin") {
        logger.warn({ socketId: socket.id, role: user.role }, "Unauthorized violation sender role");
        socket.emit("error", { message: "Unauthorized role" });
        return;
      }

      const userId = user.id;
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
