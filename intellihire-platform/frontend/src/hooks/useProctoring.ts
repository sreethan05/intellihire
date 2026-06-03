import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";

export type ViolationType = "face_missing" | "multiple_faces" | "tab_switch" | "window_blur" | "fullscreen_exit" | "copy_paste";

export function useProctoring(attemptId?: string, onAutoSubmit?: () => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [violationCount, setViolationCount] = useState(0);
  const [faceDetected, setFaceDetected] = useState(true);
  const [lastWarning, setLastWarning] = useState("");

  const logViolation = useCallback(async (violation_type: ViolationType, details: Record<string, unknown> = {}) => {
    if (!attemptId) return;
    const res = await api.post("/proctoring/log-violation", { attempt_id: attemptId, violation_type, details });
    setViolationCount(res.data.violation_count);
    setLastWarning(res.data.warning);
    toast.warning(res.data.warning);
    if (res.data.auto_submitted) onAutoSubmit?.();
  }, [attemptId, onAutoSubmit]);

  const start = useCallback(async () => {
    const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    setStream(media);
    if (videoRef.current) videoRef.current.srcObject = media;
    await document.documentElement.requestFullscreen().catch(() => undefined);
  }, []);

  useEffect(() => {
    const visibility = () => document.hidden && logViolation("tab_switch");
    const blur = () => logViolation("window_blur");
    const fullscreen = () => !document.fullscreenElement && logViolation("fullscreen_exit");
    const copyPaste = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && ["c", "v", "x"].includes(event.key.toLowerCase())) {
        event.preventDefault();
        logViolation("copy_paste");
      }
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", blur);
    document.addEventListener("fullscreenchange", fullscreen);
    document.addEventListener("keydown", copyPaste);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", blur);
      document.removeEventListener("fullscreenchange", fullscreen);
      document.removeEventListener("keydown", copyPaste);
    };
  }, [logViolation]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!stream) return;
      const ok = stream.getVideoTracks().some((track) => track.readyState === "live");
      setFaceDetected(ok);
      if (!ok) logViolation("face_missing");
    }, 5000);
    return () => window.clearInterval(id);
  }, [stream, logViolation]);

  return { videoRef, stream, start, logViolation, violationCount, faceDetected, lastWarning };
}

