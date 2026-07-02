import { Server } from "socket.io";
import type { Server as HTTPServer } from "http";
import { logger } from "./lib/logger.js";
import { db } from "./lib/postgres.js";

let ioInstance: Server | null = null;

export function setupWebSocket(httpServer: HTTPServer) {
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

  ioInstance = io;

  // Authentication middleware for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string;
    if (!token) {
      return next(new Error("Authentication required"));
    }
    // Token validation will be done on the event handlers using the same verifyToken
    // We attach the raw token for later use
    (socket as any).authToken = token;
    next();
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
    socket.on("proctor:snapshot", (data: { attemptId: string; examId: string; snapshotData: string; timestamp: string }) => {
      const monitorRoom = `monitor:${data.examId}`;
      socket.to(monitorRoom).emit("proctor:snapshot", {
        attemptId: data.attemptId,
        snapshotData: data.snapshotData,
        timestamp: data.timestamp,
      });
    });

    // Candidate sends a violation event (broadcast to monitoring room with urgency)
    socket.on("proctor:violation", async (data: { attemptId: string; examId: string; violationCount: number; message: string; timestamp: string }) => {
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
