import type { RefObject } from "react";
import { Badge } from "@/components/ui/badge";

export default function ProctoringOverlay({ videoRef, faceDetected, violationCount, lastWarning }: { videoRef: RefObject<HTMLVideoElement | null>; faceDetected: boolean; violationCount: number; lastWarning?: string }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 w-48 rounded-lg border bg-card p-2 shadow-lg">
      <video ref={videoRef as RefObject<HTMLVideoElement>} autoPlay muted playsInline className={`aspect-video w-full rounded-md border-2 object-cover ${faceDetected ? "border-green-500" : "border-red-500"}`} />
      <div className="mt-2 flex items-center justify-between"><Badge>{faceDetected ? "Face detected" : "Face missing"}</Badge><Badge>{violationCount}/3</Badge></div>
      {lastWarning && <p className="mt-1 text-xs text-muted-foreground">{lastWarning}</p>}
    </div>
  );
}
