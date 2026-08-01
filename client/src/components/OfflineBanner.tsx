import { useState, useEffect } from "react";
import { WifiOff, CheckCircle2 } from "lucide-react";

interface OfflineBannerProps {
  onSyncDrafts?: () => void;
}

export default function OfflineBanner({ onSyncDrafts }: OfflineBannerProps) {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [showSyncSuccess, setShowSyncSuccess] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowSyncSuccess(true);
      if (onSyncDrafts) onSyncDrafts();

      const timer = setTimeout(() => setShowSyncSuccess(false), 4000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowSyncSuccess(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [onSyncDrafts]);

  if (isOnline && !showSyncSuccess) return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold transition-all duration-300 shadow-md ${
        !isOnline
          ? "bg-amber-500 text-white"
          : "bg-emerald-600 text-white"
      }`}
    >
      {!isOnline ? (
        <>
          <WifiOff className="h-4 w-4 animate-pulse" />
          <span>Offline Mode: Working disconnected. Answers are saved locally to device storage.</span>
        </>
      ) : (
        <>
          <CheckCircle2 className="h-4 w-4" />
          <span>Connection Restored: All local response drafts synced successfully!</span>
        </>
      )}
    </div>
  );
}
