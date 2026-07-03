import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";

const WS_URL = import.meta.env.VITE_API_URL?.replace("/api", "") || "http://localhost:5000";

interface ProctoringEvent {
  attemptId: string;
  snapshotData?: string;
  violationCount?: number;
  message?: string;
  timestamp: string;
}

export function useProctorSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastSnapshot, setLastSnapshot] = useState<ProctoringEvent | null>(null);
  const [lastViolation, setLastViolation] = useState<ProctoringEvent | null>(null);

  const connect = useCallback((_token?: string | null) => {
    if (socketRef.current) return;

    const socket = io(WS_URL, {
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      setIsConnected(true);
      console.log("[ProctorSocket] Connected");
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
      console.log("[ProctorSocket] Disconnected");
    });

    socket.on("connect_error", (err) => {
      console.error("[ProctorSocket] Connection error:", err.message);
    });

    // Listen for incoming snapshot events (for recruiters monitoring)
    socket.on("proctor:snapshot", (data: ProctoringEvent) => {
      setLastSnapshot(data);
    });

    // Listen for incoming violation events (for recruiters monitoring)
    socket.on("proctor:violation", (data: ProctoringEvent) => {
      setLastViolation(data);
    });

    socketRef.current = socket;
  }, []);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setIsConnected(false);
    setLastSnapshot(null);
    setLastViolation(null);
  }, []);

  const joinAttempt = useCallback((attemptId: string, role: string) => {
    socketRef.current?.emit("proctor:join", { attemptId, role });
  }, []);

  const joinMonitoring = useCallback((examId: string) => {
    socketRef.current?.emit("proctor:monitor", { examId });
  }, []);

  const lastSentSnapshotRef = useRef<number>(0);

  const sendSnapshot = useCallback((attemptId: string, examId: string, snapshotData: string) => {
    const now = Date.now();
    if (now - lastSentSnapshotRef.current < 2000) {
      console.log("[ProctorSocket] Snapshot emission throttled client-side");
      return;
    }
    lastSentSnapshotRef.current = now;
    socketRef.current?.emit("proctor:snapshot", {
      attemptId,
      examId,
      snapshotData,
      timestamp: new Date().toISOString(),
    });
  }, []);

  const sendViolation = useCallback((attemptId: string, examId: string, violationCount: number, message: string) => {
    socketRef.current?.emit("proctor:violation", {
      attemptId,
      examId,
      violationCount,
      message,
      timestamp: new Date().toISOString(),
    });
  }, []);

  const leaveAttempt = useCallback((attemptId: string) => {
    socketRef.current?.emit("proctor:leave", { attemptId });
  }, []);

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  return {
    isConnected,
    lastSnapshot,
    lastViolation,
    connect,
    disconnect,
    joinAttempt,
    joinMonitoring,
    sendSnapshot,
    sendViolation,
    leaveAttempt,
  };
}
