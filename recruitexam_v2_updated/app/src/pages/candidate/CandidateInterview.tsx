import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  Mic,
  MicOff,
  PhoneOff,
  Play,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRound,
  Video,
  Volume2,
  XCircle,
  Monitor,
} from "lucide-react";
import { toast } from "sonner";
import { interviewApi, proctoringApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const INTERVIEW_SECONDS = 15 * 60;

const STAGES = [
  { id: 1, name: "Introduction", color: "blue" },
  { id: 2, name: "Speaking Skills", color: "violet" },
  { id: 3, name: "Technical", color: "emerald" },
];

// How many questions belong to each stage: stage1: 0-1, stage2: 2-3, stage3: 4-6

function getStageForIndex(index: number): number {
  if (index < 2) return 1;
  if (index < 4) return 2;
  return 3;
}

type PassedAttempt = {
  attemptId: string;
  examId: string;
  examTitle: string;
  score: number;
  totalMarks: number;
  passMarks: number;
  percentage: number;
  submittedAt: string | null;
};

type Eligibility = {
  eligible: boolean;
  selectedAttempt: PassedAttempt | null;
  passedAttempts: PassedAttempt[];
  message: string;
};

type TranscriptItem = {
  role: "assistant" | "candidate";
  text: string;
  question?: string;
  score?: number;
  feedback?: string;
  stage?: number;
};

type InterviewResult = {
  id?: string;
  status?: string;
  score?: number;
  intro_score?: number;
  speaking_score?: number;
  pronunciation_score?: number;
  technical_score?: number;
  selected?: boolean;
  relevance_score?: number;
  communication_score?: number;
  summary?: string;
  feedback?: string;
  started_at?: string;
};

type RecognitionResult = { isFinal: boolean; 0?: { transcript?: string } };
type RecognitionEvent = Event & {
  resultIndex?: number;
  results: { length: number; [index: number]: RecognitionResult };
};
type RecognitionInstance = {
  continuous: boolean; interimResults: boolean; lang: string;
  onstart: (() => void) | null; onresult: ((e: RecognitionEvent) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
type RecognitionConstructor = new () => RecognitionInstance;

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatDate(date?: string | null) {
  if (!date) return "Recently qualified";
  return new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function getSpeechRecognition() {
  if (typeof window === "undefined") return null;
  const w = window as Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function parseFeedback(feedback: string | undefined): { text: string; audioUrl?: string } {
  if (!feedback) return { text: "" };
  try {
    const parsed = JSON.parse(feedback);
    if (parsed && typeof parsed === "object" && "feedback" in parsed) {
      return {
        text: parsed.feedback || "",
        audioUrl: parsed.audio_url || undefined,
      };
    }
  } catch {
    // ignore
  }
  return { text: feedback };
}

export default function CandidateInterview() {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<RecognitionInstance | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [recordedAudioBase64, setRecordedAudioBase64] = useState<string | null>(null);
  const [localAudioPreview, setLocalAudioPreview] = useState<string | null>(null);

  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [pendingInterview, setPendingInterview] = useState<any>(null);
  const [history, setHistory] = useState<InterviewResult[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [interviewId, setInterviewId] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerDraft, setAnswerDraft] = useState("");
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [result, setResult] = useState<InterviewResult | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [timeLeft, setTimeLeft] = useState(INTERVIEW_SECONDS);
  const [_stageScores, setStageScores] = useState<{ stage: number; score: number; pronunciationScore?: number }[]>([]);
  const [completedStages, setCompletedStages] = useState<number[]>([]);
  const [showQuestionText, setShowQuestionText] = useState(false);
  const answerDraftRef = useRef("");
  const [violationCount, setViolationCount] = useState(0);
  const [securityLocked, setSecurityLocked] = useState(false);
  const [securityMessage, setSecurityMessage] = useState("Return to fullscreen mode to continue your AI interview.");
  const [attemptId, setAttemptId] = useState("");
  const [examId, setExamId] = useState("");
  const violationCooldownRef = useRef(0);
  const submittedRef = useRef(false);
  const interviewContainerRef = useRef<HTMLDivElement | null>(null);
  const prevAnswerLengthRef = useRef(0);

  useEffect(() => {
    answerDraftRef.current = answerDraft;
  }, [answerDraft]);

  const startListeningRef = useRef<() => void>(() => {});
  const submitCurrentAnswerRef = useRef<(finishAfter?: boolean) => Promise<void>>(async () => {});

  const currentStage = getStageForIndex(currentIndex);
  const currentQuestion = questions[currentIndex] || "";
  const answeredCount = transcript.filter((i) => i.role === "candidate").length;
  const progress = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0;
  const lastCandidateAnswer = useMemo(() => transcript.filter((i) => i.role === "candidate").at(-1), [transcript]);
  const lastFeedbackParsed = useMemo(() => parseFeedback(lastCandidateAnswer?.feedback), [lastCandidateAnswer]);
  const speechSupported = Boolean(getSpeechRecognition());
  const live = Boolean(interviewId && !result);

  const scheduledStartMs = pendingInterview?.scheduled_start_at ? new Date(pendingInterview.scheduled_start_at).getTime() : null;
  const scheduledEndMs = pendingInterview?.scheduled_end_at ? new Date(pendingInterview.scheduled_end_at).getTime() : null;
  const nowMs = Date.now();
  const canStartInterview =
    scheduledStartMs !== null &&
    scheduledEndMs !== null &&
    !Number.isNaN(scheduledStartMs) &&
    !Number.isNaN(scheduledEndMs) &&
    nowMs >= scheduledStartMs &&
    nowMs <= scheduledEndMs;

  const stageInfo = STAGES.find((s) => s.id === currentStage) || STAGES[0];

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setListening(false);
  }, []);

  const stopDevices = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    setCameraReady(false);
    setMicReady(false);
  }, []);

  const captureSnapshot = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * canvas.width));
    const context = canvas.getContext("2d");
    if (!context) return null;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.55);
  }, []);

  const logProctoringEvent = useCallback(async (
    eventType: "camera_check" | "snapshot" | "violation" | "submission",
    message?: string,
    snapshotData?: string | null,
    nextViolationCount = violationCount,
  ) => {
    if (!attemptId || !examId) return;

    try {
      await proctoringApi.logEvent({
        attempt_id: attemptId,
        exam_id: examId,
        event_type: eventType,
        violation_count: nextViolationCount,
        message: message ? `[AI Interview] ${message}` : undefined,
        snapshot_data: snapshotData ?? null,
      });
    } catch {
      // Proctoring logs are silent background operations
    }
  }, [attemptId, examId, violationCount]);

  const requestInterviewFullscreen = useCallback(async () => {
    const target = interviewContainerRef.current || document.documentElement;

    if (document.fullscreenElement) {
      setSecurityLocked(false);
      return true;
    }

    if (!target.requestFullscreen) {
      return false;
    }

    try {
      await target.requestFullscreen();
      setSecurityLocked(false);
      return true;
    } catch {
      setSecurityLocked(true);
      setSecurityMessage("Fullscreen access is required during the AI interview. Please enable it and continue.");
      toast.error("Fullscreen mode is required for this interview.");
      return false;
    }
  }, []);

  const exitInterviewFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) return;

    try {
      await document.exitFullscreen();
    } catch {
      // Ignore fullscreen exit failures
    }
  }, []);

  const refreshInterviewState = useCallback(async () => {
    setEligibilityLoading(true);
    try {
      const [eligRes, histRes, pendingRes] = await Promise.all([
        interviewApi.eligibility(),
        interviewApi.mine(),
        interviewApi.pending(),
      ]);
      setEligibility(eligRes.data);
      setHistory(histRes.data.interviews || []);
      setPendingInterview(pendingRes.data.interview || null);
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Could not load AI interview status");
    } finally {
      setEligibilityLoading(false);
    }
  }, []);

  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.92; u.pitch = 1;
    u.onstart = () => setSpeaking(true);
    u.onend = () => {
      setSpeaking(false);
      startListeningRef.current();
    };
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }, []);

  const requestDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera and microphone are not supported in this browser.");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 540 } },
        audio: true,
      });
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraReady(stream.getVideoTracks().some((t) => t.readyState === "live"));
      setMicReady(stream.getAudioTracks().some((t) => t.readyState === "live"));
      setCameraError("");
      return true;
    } catch {
      setCameraReady(false); setMicReady(false);
      setCameraError("Allow camera and microphone access to start the interview.");
      return false;
    }
  }, []);

  const finishInterview = useCallback(async () => {
    if (!interviewId || submittedRef.current) return;
    submittedRef.current = true;
    setLoading(true);
    stopListening();
    window.speechSynthesis?.cancel();
    void logProctoringEvent("submission", "Candidate submitted AI interview", captureSnapshot());
    void exitInterviewFullscreen();
    try {
      const { data } = await interviewApi.submit(interviewId);
      setResult(data.interview);
      setInterviewId("");
      stopDevices();
      const histRes = await interviewApi.mine();
      setHistory(histRes.data.interviews || []);
      toast.success("AI interview submitted");
    } catch (error: any) {
      submittedRef.current = false;
      toast.error(error.response?.data?.error || "Could not submit interview");
    } finally {
      setLoading(false);
    }
  }, [interviewId, stopDevices, stopListening, logProctoringEvent, captureSnapshot, exitInterviewFullscreen]);

  const registerViolation = useCallback((message: string, shouldLock = false) => {
    if (!live || loading || submittedRef.current) return;

    const now = Date.now();
    if (now - violationCooldownRef.current < 1200) return;
    violationCooldownRef.current = now;

    if (shouldLock) {
      setSecurityLocked(true);
      setSecurityMessage(message);
    }

    setViolationCount((previous) => {
      const next = previous + 1;
      void logProctoringEvent("violation", message, captureSnapshot(), next);

      if (next >= 3) {
        toast.error("Maximum security violations reached. Auto-submitting interview.");
        void finishInterview();
      } else {
        toast.error(`${message} Warning ${next}/3.`);
      }

      return next;
    });
  }, [captureSnapshot, finishInterview, logProctoringEvent, live, loading]);

  const submitCurrentAnswer = useCallback(async (finishAfter = false) => {
    if (!interviewId || !currentQuestion) return;
    const answer = answerDraftRef.current.trim();
    if (!answer && !recordedAudioBase64) { toast.error("Record or type an answer before continuing."); return; }

    setLoading(true);
    stopListening();

    try {
      const stage = getStageForIndex(currentIndex);
      const payload: any = {
        question: currentQuestion,
        answer,
        stage,
      };
      if (recordedAudioBase64) {
        payload.audio = recordedAudioBase64;
      }

      const { data } = await interviewApi.submitAnswer(interviewId, payload);
      const savedAnswer = data.answer;
      const pronunciationScore = data.pronunciation_score;

      const finalRecordedText = savedAnswer?.answer || answer;

      setTranscript((items) => [
        ...items,
        {
          role: "candidate",
          text: finalRecordedText,
          question: currentQuestion,
          score: Number(savedAnswer?.score || 0),
          feedback: savedAnswer?.feedback || "",
          stage,
        },
      ]);
      setAnswerDraft("");
      setRecordedAudioBase64(null);
      setLocalAudioPreview(null);

      // Track stage scores
      setStageScores((prev) => [...prev, {
        stage,
        score: Number(savedAnswer?.score || 0),
        pronunciationScore: pronunciationScore ? Number(pronunciationScore) : undefined,
      }]);

      const isFinalQuestion = currentIndex >= questions.length - 1;
      if (finishAfter || isFinalQuestion) {
        await finishInterview();
        return;
      }

      const nextIndex = currentIndex + 1;
      const nextStage = getStageForIndex(nextIndex);
      const nextQuestion = questions[nextIndex];

      // If moving to a new stage, mark previous stage complete
      if (nextStage !== stage) {
        setCompletedStages((prev) => [...prev, stage]);
      }

      setCurrentIndex(nextIndex);
      setTranscript((items) => [...items, { role: "assistant", text: nextQuestion, stage: nextStage }]);

      // Stage transition announcement
      if (nextStage !== stage) {
        const stageName = STAGES.find((s) => s.id === nextStage)?.name || "";
        const announcement = `Moving to Stage ${nextStage}: ${stageName}. ${nextQuestion}`;
        speak(announcement);
      } else {
        speak(nextQuestion);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Could not submit answer");
    } finally {
      setLoading(false);
    }
  }, [currentIndex, currentQuestion, finishInterview, interviewId, questions, speak, stopListening, recordedAudioBase64]);

  useEffect(() => {
    submitCurrentAnswerRef.current = submitCurrentAnswer;
  }, [submitCurrentAnswer]);

  const startListening = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) { toast.error("Speech recognition not available. You can type your answer."); return; }
    if (listening) { stopListening(); return; }

    // Start Web Audio recording
    if (cameraStreamRef.current) {
      try {
        const audioTracks = cameraStreamRef.current.getAudioTracks();
        if (audioTracks.length > 0) {
          const audioStream = new MediaStream(audioTracks);
          const mediaRecorder = new MediaRecorder(audioStream);
          mediaRecorderRef.current = mediaRecorder;
          audioChunksRef.current = [];

          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              audioChunksRef.current.push(event.data);
            }
          };

          mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
            const previewUrl = URL.createObjectURL(audioBlob);
            setLocalAudioPreview(previewUrl);

            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = () => {
              const base64data = (reader.result as string).split(",")[1];
              setRecordedAudioBase64(base64data);
            };
          };

          mediaRecorder.start();
        }
      } catch (err) {
        console.error("Failed to start MediaRecorder:", err);
      }
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";

    let committed = answerDraftRef.current.trim();
    recognition.onstart = () => setListening(true);
    recognition.onresult = (event: RecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex || 0; i < event.results.length; i++) {
        const r = event.results[i];
        const t = r?.[0]?.transcript || "";
        if (r?.isFinal) committed = `${committed} ${t}`.trim();
        else interim = `${interim} ${t}`.trim();
      }
      setAnswerDraft(`${committed}${interim ? ` ${interim}` : ""}`.trim());
    };
    recognition.onerror = () => { setListening(false); };
    recognition.onend = () => {
      setListening(false);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, [listening, stopListening]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  const startInterview = useCallback(async () => {
    const examId = pendingInterview?.exam_id || eligibility?.selectedAttempt?.examId;
    const jobId = pendingInterview?.job_id || null;

    if (!examId) { toast.error("Pass an assigned exam to unlock the AI interview."); return; }
    if (!scheduledStartMs || !scheduledEndMs) {
      toast.error("Waiting for recruiter schedule approval.");
      return;
    }
    if (!canStartInterview) {
      toast.error(
        scheduledStartMs && scheduledEndMs
          ? `Interview window is ${new Date(scheduledStartMs).toLocaleString()} - ${new Date(scheduledEndMs).toLocaleString()}.`
          : "Interview window is not currently available."
      );
      return;
    }

    setLoading(true);
    setResult(null);
    setStageScores([]);
    setCompletedStages([]);

    try {
      const devicesReady = await requestDevices();
      if (!devicesReady) { toast.error("Camera and microphone access is required."); return; }

      const { data } = await interviewApi.start({ exam_id: examId, job_id: jobId });
      const nextQuestions = data.questions || [];

      setQuestions(nextQuestions);
      setInterviewId(data.interview.id);
      setAttemptId(data.eligibleAttempt?.attemptId || "");
      setExamId(data.eligibleAttempt?.examId || "");
      setViolationCount(0);
      submittedRef.current = false;
      prevAnswerLengthRef.current = 0;
      setCurrentIndex(0);
      setAnswerDraft("");
      const welcomeText = `Hi ${user?.name || "Candidate"}. Welcome to your AI face-to-face interview. Let's begin with Stage 1: Introduction. ${nextQuestions[0]}`;
      setTranscript(nextQuestions[0] ? [{ role: "assistant", text: welcomeText, stage: 1 }] : []);
      setTimeLeft(INTERVIEW_SECONDS);

      if (nextQuestions[0]) {
        speak(welcomeText);
      }
    } catch (error: any) {
      stopDevices();
      toast.error(error.response?.data?.error || "Could not start AI interview");
    } finally {
      setLoading(false);
    }
  }, [eligibility?.selectedAttempt, pendingInterview, requestDevices, speak, stopDevices, canStartInterview, scheduledStartMs, scheduledEndMs, user?.name]);

  useEffect(() => { void refreshInterviewState(); }, [refreshInterviewState]);

  useEffect(() => {
    if (!cameraStreamRef.current || !videoRef.current) return;
    videoRef.current.srcObject = cameraStreamRef.current;
  }, [cameraReady, live]);

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { window.clearInterval(timer); void finishInterview(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [finishInterview, live]);

  useEffect(() => () => {
    stopListening(); stopDevices(); window.speechSynthesis?.cancel();
  }, [stopDevices, stopListening]);

  // Request fullscreen when live interview begins
  useEffect(() => {
    if (!live) return;
    void requestInterviewFullscreen();
  }, [requestInterviewFullscreen, live]);

  // Periodic camera snapshots and presence checking
  useEffect(() => {
    if (!live || !attemptId || !examId) return;

    void logProctoringEvent("camera_check", "Camera enabled before AI interview start", captureSnapshot());

    const snapshotTimer = window.setInterval(() => {
      void logProctoringEvent("snapshot", "Periodic proctoring snapshot", captureSnapshot());
    }, 60000);

    const presenceTimer = window.setInterval(() => {
      const video = videoRef.current;
      const streamActive = cameraStreamRef.current?.getVideoTracks().some((track) => track.readyState === "live" && track.enabled);
      const hasFrame = !!video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0;

      if (!streamActive || !hasFrame) {
        registerViolation("Camera feed unavailable or face not visible.", true);
      }
    }, 15000);

    return () => {
      window.clearInterval(snapshotTimer);
      window.clearInterval(presenceTimer);
    };
  }, [attemptId, examId, captureSnapshot, logProctoringEvent, registerViolation, live]);

  // Poll for recruiter override unlock
  useEffect(() => {
    if (!live || !securityLocked || !attemptId) return;

    let isSubscribed = true;
    const intervalId = window.setInterval(async () => {
      try {
        const { data } = await proctoringApi.getAttemptEvents(attemptId);
        if (!isSubscribed) return;

        const events = data.events || [];
        const latestEvent = events[0];

        if (latestEvent && latestEvent.event_type === "camera_check" && latestEvent.message === "OVERRIDE_UNLOCK") {
          setSecurityLocked(false);
          setViolationCount(0);
          toast.success("Interview unlocked by recruiter! You can now resume.");
        }
      } catch (error) {
        console.error("Failed to poll attempt status:", error);
      }
    }, 2000);

    return () => {
      isSubscribed = false;
      window.clearInterval(intervalId);
    };
  }, [live, securityLocked, attemptId]);

  // Fullscreen, tab switching, and restricted shortcuts blocking
  useEffect(() => {
    if (!live) return;

    const onFullscreenChange = () => {
      if (submittedRef.current || loading) return;

      if (!document.fullscreenElement) {
        registerViolation("Fullscreen mode was exited.", true);
      } else {
        setSecurityLocked(false);
        void logProctoringEvent("camera_check", "Candidate resumed interview fullscreen", captureSnapshot());
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        registerViolation("Tab switch or app minimize detected.", true);
      }
    };

    const onBlur = () => {
      if (submittedRef.current || loading) return;
      registerViolation("Interview window lost focus. Please stay focused on the interview screen.", true);
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!submittedRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      toast.error("Right-click is disabled during the interview.");
    };

    const onClipboard = (event: ClipboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      toast.error("Copy, cut, and paste are disabled during the interview.");
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      
      const isAltTab = event.altKey && key === "tab";
      const isOsCommand = event.metaKey;
      const isDevTools = (event.ctrlKey && event.shiftKey && ["i", "j", "c"].includes(key)) || key === "f12";
      const isFullscreenOrEsc = key === "f11" || key === "escape";
      const isClipboardOrReload = (event.ctrlKey || event.metaKey) && ["c", "v", "x", "a", "r"].includes(key);

      const blockedShortcut = isAltTab || isOsCommand || isDevTools || isFullscreenOrEsc || isClipboardOrReload;

      if (blockedShortcut) {
        event.preventDefault();
        event.stopPropagation();

        let msg = `Restricted shortcut detected: ${event.key}`;
        if (event.ctrlKey && event.shiftKey) msg = `Restricted shortcut: Ctrl + Shift + ${event.key}`;
        else if (event.ctrlKey) msg = `Restricted shortcut: Ctrl + ${event.key}`;
        else if (event.altKey) msg = `Restricted shortcut: Alt + ${event.key}`;
        else if (event.metaKey) msg = `Restricted OS command key detected.`;

        const shouldLock = key === "escape" || key === "f11" || isAltTab || isOsCommand;
        registerViolation(msg, shouldLock);
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("copy", onClipboard);
    window.addEventListener("cut", onClipboard);
    window.addEventListener("paste", onClipboard);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("copy", onClipboard);
      window.removeEventListener("cut", onClipboard);
      window.removeEventListener("paste", onClipboard);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [registerViolation, live, loading, logProctoringEvent, captureSnapshot]);

  // Typing velocity bypass detection
  useEffect(() => {
    if (!live || !answerDraft) return;

    const prevLength = prevAnswerLengthRef.current;
    const curLength = answerDraft.length;
    prevAnswerLengthRef.current = curLength;

    if (curLength - prevLength > 55 && !listening) {
      setAnswerDraft(answerDraft.slice(0, prevLength));
      registerViolation("Suspicious typing activity/text injection detected.", true);
    }
  }, [answerDraft, live, listening, registerViolation]);

  if (eligibilityLoading) {
    return (
      <div className="space-y-5">
        <div className="h-20 animate-pulse rounded-lg bg-slate-200" />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="h-[520px] animate-pulse rounded-lg bg-slate-200" />
          <div className="h-[520px] animate-pulse rounded-lg bg-slate-200" />
        </div>
      </div>
    );
  }

  // ── Not eligible ─────────────────────────────────────────────────────────────
  if (!eligibility?.eligible && !pendingInterview) {
    return (
      <div className="mx-auto max-w-4xl space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <Lock className="h-7 w-7" />
          </div>
          <h2 className="mt-5 text-2xl font-extrabold text-slate-950">AI Interview Locked</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Pass an assigned exam to unlock the face-to-face AI interview round.
          </p>
          <div className="mx-auto mt-6 flex max-w-md items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {eligibility?.message || "No qualifying exam result was found for this candidate account."}
          </div>
        </section>
        <InterviewHistory history={history} />
      </div>
    );
  }

  // ── Result screen ─────────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="space-y-5">
        <ResultPanel result={result} />
        <div className="flex justify-center">
          <Button onClick={startInterview} disabled={loading}>
            <Play className="mr-2 h-4 w-4" />
            Start Another Interview
          </Button>
        </div>
        <InterviewHistory history={history} />
      </div>
    );
  }

  // ── Pre-launch screen ─────────────────────────────────────────────────────────
  if (!live) {
    return (
      <div className="space-y-5">
        <HeaderBar title="AI Face-to-Face Interview" subtitle="Unlocked after qualifying exam performance." timeLeft={INTERVIEW_SECONDS} live={false} />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="grid min-h-[520px] md:grid-cols-2">
              <div className="flex flex-col justify-between border-b border-slate-200 bg-slate-950 p-6 text-white md:border-b-0 md:border-r">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500">
                      <Bot className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold">AI Interviewer</div>
                      <div className="text-xs text-white/55">3-stage evaluation</div>
                    </div>
                  </div>
                  <Sparkles className="h-5 w-5 text-blue-200" />
                </div>

                {/* Stage overview */}
                <div className="space-y-3">
                  {STAGES.map((stage) => (
                    <div key={stage.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/30 text-xs font-bold text-blue-200">
                        {stage.id}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">{stage.name}</div>
                        <div className="text-xs text-white/50">
                          {stage.id === 1 && "Self-intro · Background · Confidence"}
                          {stage.id === 2 && "Clarity · Pronunciation · Consistency"}
                          {stage.id === 3 && "Role knowledge · Problem solving"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm leading-6 text-white/75">
                  Speak clearly into your microphone. The AI scores each answer in real time.
                </div>
              </div>

              <div className="flex flex-col justify-between bg-slate-50 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm">
                      <UserRound className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-950">Candidate Camera</div>
                      <div className="text-xs text-slate-500">Live interview presence</div>
                    </div>
                  </div>
                  <Video className="h-5 w-5 text-blue-600" />
                </div>

                <div className="flex flex-1 items-center justify-center">
                  <div className="flex aspect-video w-full max-w-md items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-slate-400">
                    <Camera className="h-10 w-10" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <StatusPill active={false} icon={CameraOff} label="Camera pending" />
                  <StatusPill active={false} icon={MicOff} label="Mic pending" />
                </div>
              </div>
            </div>
          </section>

          <aside className="space-y-5">
            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  Qualified Exam
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <QualifiedExam attempt={eligibility?.selectedAttempt || null} />
                {pendingInterview &&
                  (!pendingInterview.scheduled_start_at || !pendingInterview.scheduled_end_at) && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                    🎉 You've been <strong>shortlisted</strong>! Your recruiter will schedule the interview start/end time shortly.
                  </div>
                )}
                {pendingInterview &&
                  pendingInterview.scheduled_start_at &&
                  pendingInterview.scheduled_end_at && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                    🎉 Interview scheduled! You can start at{" "}
                    <strong>
                      {pendingInterview.scheduled_start_at
                        ? new Date(pendingInterview.scheduled_start_at).toLocaleString()
                        : "the scheduled time"}
                    </strong>
                    .
                  </div>
                )}
                <div className="grid gap-3">
                  <ChecklistItem active label="Passed exam cutoff" />
                  <ChecklistItem active={speechSupported} label={speechSupported ? "Speech capture available" : "Type answers manually"} />
                  <ChecklistItem active={false} label="Camera check starts on launch" />
                </div>
                {cameraError && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{cameraError}</div>
                )}
              <Button className="h-11 w-full" onClick={startInterview} disabled={loading || !canStartInterview}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                  Start AI Interview
                </Button>
              </CardContent>
            </Card>
            <InterviewHistory history={history.slice(0, 3)} compact />
          </aside>
        </div>
      </div>
    );
  }

  // ── Live interview ────────────────────────────────────────────────────────────
  return (
    <div ref={interviewContainerRef} className="min-h-screen bg-slate-50/50 p-6 rounded-2xl text-slate-950 space-y-6 relative">
      {securityLocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.35)]">
            <div className="mb-3 flex items-center gap-3 text-slate-900">
              <Monitor className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-bold">Interview Locked</h3>
            </div>
            <p className="text-sm leading-6 text-slate-600">{securityMessage}</p>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Warnings used: {violationCount}/3
            </div>
            <div className="mt-5 flex gap-3">
              <Button className="flex-1" onClick={() => void requestInterviewFullscreen()}>
                Return to Fullscreen
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => void finishInterview()}>
                Submit Now
              </Button>
            </div>
          </div>
        </div>
      )}

      <HeaderBar
        title="AI Interview Session"
        subtitle={`Stage ${currentStage}: ${stageInfo.name} · Question ${Math.min(currentIndex + 1, questions.length)} of ${questions.length}`}
        timeLeft={timeLeft}
        live
      />

      {/* Stage progress bar */}
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {STAGES.map((stage, idx) => {
          const isCompleted = completedStages.includes(stage.id);
          const isActive = stage.id === currentStage;
          return (
            <div key={stage.id} className="flex flex-1 items-center gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                isCompleted ? "bg-emerald-500 text-white shadow-md shadow-emerald-100 scale-105" :
                isActive ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-200 scale-105 ring-2 ring-blue-400/20" :
                "bg-slate-50 text-slate-400 border border-slate-100"
              }`}>
                {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : stage.id}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Stage {stage.id}</span>
                <span className={`text-sm font-bold truncate ${isActive ? "text-slate-900" : isCompleted ? "text-emerald-600 font-semibold" : "text-slate-500"}`}>
                  {stage.name}
                </span>
              </div>
              {idx < STAGES.length - 1 && (
                <div className={`mx-2 h-[2px] flex-1 rounded-full ${isCompleted ? "bg-emerald-400" : isActive ? "bg-gradient-to-r from-blue-300 to-slate-200" : "bg-slate-100"}`} />
              )}
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            {/* AI Interviewer */}
            <div className={`rounded-xl border bg-slate-950 p-6 text-white shadow-lg transition-all duration-500 ${speaking ? "border-blue-500 ring-4 ring-blue-500/10 shadow-blue-900/10" : "border-slate-800"}`}>
              <style dangerouslySetInnerHTML={{__html: `
                @keyframes soundwave-pulse {
                  0%, 100% { transform: scaleY(0.25); }
                  50% { transform: scaleY(1.3); }
                }
                .animate-soundwave {
                  animation: soundwave-pulse 1s ease-in-out infinite;
                }
              `}} />
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/25">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold tracking-tight">AI Interviewer</div>
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${speaking ? "bg-blue-400 animate-ping" : "bg-emerald-400"}`} />
                      {speaking ? "Speaking…" : "Listening"}
                    </div>
                  </div>
                </div>
                <Volume2 className={speaking ? "h-5 w-5 text-blue-400 animate-bounce" : "h-5 w-5 text-slate-600"} />
              </div>
              <div className="flex aspect-video flex-col items-center justify-center rounded-xl bg-slate-900/50 border border-slate-900/80 relative overflow-hidden group">
                <div className={`absolute h-36 w-36 rounded-full bg-blue-500/10 blur-2xl transition-all duration-700 ${speaking ? "scale-125 opacity-100" : "opacity-30"}`} />
                
                {speaking ? (
                  <div className="flex items-end justify-center gap-1.5 h-16 w-full max-w-xs relative z-10">
                    {Array.from({ length: 9 }).map((_, i) => {
                      const heights = ["h-4", "h-8", "h-6", "h-12", "h-9", "h-14", "h-8", "h-10", "h-5"];
                      return (
                        <div
                          key={i}
                          className={`w-1.5 rounded-full bg-gradient-to-t from-blue-500 via-indigo-400 to-violet-400 transition-all duration-300 animate-soundwave ${heights[i]}`}
                          style={{
                            animationDelay: `${i * 120}ms`,
                            animationDuration: `${0.7 + (i % 3) * 0.25}s`,
                            transformOrigin: "bottom"
                          }}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-slate-800 border border-slate-700 text-slate-300 shadow-inner group-hover:scale-105 transition-transform duration-300">
                    <Bot className="h-10 w-10 text-blue-400" />
                  </div>
                )}
              </div>
              <div className="mt-4 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Stage {currentStage} — {stageInfo.name}
              </div>
            </div>

            {/* Candidate camera */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 border border-slate-100 text-slate-700">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold tracking-tight text-slate-900">Candidate Feed</div>
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${cameraReady ? "bg-emerald-500 animate-pulse" : "bg-rose-400"}`} />
                      {cameraReady ? "Camera live" : "Camera offline"}
                    </div>
                  </div>
                </div>
                {cameraReady ? <Camera className="h-5 w-5 text-emerald-500" /> : <CameraOff className="h-5 w-5 text-rose-500" />}
              </div>
              <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-950">
                <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
                {cameraReady && (
                  <div className="absolute top-3 left-3 bg-slate-950/70 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-md text-[9px] font-bold text-white uppercase tracking-widest flex items-center gap-1.5 shadow-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />
                    Proctoring Active
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Question + answer */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-md shadow-slate-100">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600">Stage {currentStage} · {stageInfo.name}</div>
                <h2 className="mt-1 text-xl font-extrabold leading-relaxed text-slate-900 tracking-tight">
                  {showQuestionText ? currentQuestion : speaking ? "🔊 AI is reading the question..." : "🎤 Answer the question below..."}
                </h2>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowQuestionText(!showQuestionText)} className="text-xs border-slate-200 hover:bg-slate-50">
                  {showQuestionText ? "Hide Question" : "Show Question"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => speak(currentQuestion)} disabled={!currentQuestion} className="text-xs border-slate-200 hover:bg-slate-50">
                  <Volume2 className="mr-1.5 h-3.5 w-3.5" />
                  Replay
                </Button>
              </div>
            </div>

            <div className="relative">
              <Textarea
                value={answerDraft}
                onChange={(e) => setAnswerDraft(e.target.value)}
                placeholder={currentStage === 2 ? "Speak clearly — pronunciation and clarity are being evaluated…" : "Your spoken response will compile here. You can also type or edit details directly…"}
                className="min-h-40 resize-none text-base leading-relaxed p-4 border-slate-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all duration-300"
                onCopy={(e) => { e.preventDefault(); toast.error("Copying is disabled during the interview."); }}
                onCut={(e) => { e.preventDefault(); toast.error("Cutting is disabled during the interview."); }}
                onPaste={(e) => { e.preventDefault(); toast.error("Pasting is disabled during the interview."); }}
              />
              {listening && (
                <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-rose-50 border border-rose-100 text-rose-600 px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider animate-pulse shadow-sm">
                  <Mic className="h-3 w-3 text-rose-500 animate-bounce" />
                  Live Capture
                </div>
              )}
            </div>

            {localAudioPreview && (
              <div className="mt-4 flex flex-col gap-1.5 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                <div className="text-xs font-bold text-blue-700 uppercase tracking-wide flex items-center gap-1.5">
                  <Volume2 className="h-3.5 w-3.5 animate-pulse" />
                  Your Recorded Audio Answer
                </div>
                <audio src={localAudioPreview} controls className="w-full h-8 mt-1.5" />
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-5">
              <div className="flex flex-wrap items-center gap-3">
                <Button 
                  variant={listening ? "destructive" : "outline"} 
                  onClick={startListening} 
                  disabled={loading || !speechSupported}
                  className={`transition-all duration-300 px-5 h-11 text-sm font-semibold rounded-xl ${
                    listening 
                      ? "bg-rose-600 hover:bg-rose-700 text-white border-rose-500 ring-4 ring-rose-100 animate-pulse shadow-md shadow-rose-200" 
                      : "hover:bg-slate-50 border-slate-300 text-slate-700 shadow-sm"
                  }`}
                >
                  {listening ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4 text-blue-600" />}
                  {listening ? "Stop Recording" : "Record Voice Response"}
                </Button>
                {listening && (
                  <div className="flex items-end gap-1 h-4 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div 
                        key={i} 
                        className="w-0.5 rounded-full bg-rose-500 animate-soundwave"
                        style={{
                          animationDelay: `${i * 150}ms`,
                          animationDuration: "0.6s",
                          transformOrigin: "bottom",
                          height: `${6 + (i % 2) * 6}px`
                        }}
                      />
                    ))}
                  </div>
                )}
                {!speechSupported && <span className="text-xs font-semibold text-slate-400 tracking-wide uppercase bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">Speech Capture Disabled</span>}
              </div>
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  onClick={() => answerDraft.trim() ? void submitCurrentAnswer(true) : void finishInterview()} 
                  disabled={loading}
                  className="h-11 rounded-xl px-5 text-slate-600 hover:bg-slate-50 border-slate-300"
                >
                  <PhoneOff className="mr-2 h-4 w-4 text-slate-400" />
                  End Session
                </Button>
                <Button 
                  onClick={() => void submitCurrentAnswer(false)} 
                  disabled={loading}
                  className="h-11 rounded-xl px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/10 transition-all duration-300 font-semibold"
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {currentIndex >= questions.length - 1 ? "Submit Interview" : "Next Question"}
                </Button>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-5">
          <Card className="rounded-lg">
            <CardHeader><CardTitle className="text-base">Session Status</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Answered" value={`${answeredCount}/${questions.length}`} />
                <Metric label="Progress" value={`${progress}%`} />
              </div>
              <div className="grid gap-3">
                <StatusPill active={cameraReady} icon={cameraReady ? Camera : CameraOff} label={cameraReady ? "Camera on" : "Camera off"} />
                <StatusPill active={micReady || listening} icon={micReady || listening ? Mic : MicOff} label={listening ? "Recording" : micReady ? "Mic ready" : "Mic off"} />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader><CardTitle className="text-base">Answer Feedback</CardTitle></CardHeader>
            <CardContent>
              {lastCandidateAnswer ? (
                <div className="space-y-3">
                  <div className="text-3xl font-extrabold text-blue-700">{lastCandidateAnswer.score || 0}/100</div>
                  {lastCandidateAnswer.stage === 2 && (
                    <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800">
                      Speaking stage — pronunciation &amp; clarity also scored
                    </div>
                  )}
                  <p className="text-sm leading-6 text-slate-600">{lastFeedbackParsed.text || "Answer submitted for scoring."}</p>
                  {lastFeedbackParsed.audioUrl && (
                    <div className="mt-2 flex flex-col gap-1 rounded-lg border border-blue-100 bg-blue-50/30 p-2">
                      <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Playback Answer Audio</div>
                      <audio src={lastFeedbackParsed.audioUrl} controls className="w-full h-8 mt-1" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 p-5 text-sm text-slate-500">
                  Feedback appears after the first submitted response.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader><CardTitle className="text-base">Transcript</CardTitle></CardHeader>
            <CardContent className="max-h-[330px] space-y-3 overflow-y-auto">
              {transcript.map((item, index) => (
                <div key={`${item.role}-${index}`} className={item.role === "assistant" ? "rounded-lg bg-blue-50 p-3" : "rounded-lg bg-slate-50 p-3"}>
                  <div className={item.role === "assistant" ? "text-xs font-bold uppercase text-blue-700" : "text-xs font-bold uppercase text-slate-500"}>
                    {item.role === "assistant" ? `AI · Stage ${item.stage}` : "Candidate"}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-700">{item.text}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HeaderBar({ title, subtitle, timeLeft, live }: { title: string; subtitle: string; timeLeft: number; live: boolean }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border px-6 py-4 shadow-md transition-all duration-300 ${
      live 
        ? "border-slate-800 bg-gradient-to-r from-slate-900 via-slate-950 to-indigo-950 text-white" 
        : "border-slate-200 bg-white text-slate-950"
    }`}>
      <div>
        <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${live ? "text-blue-400" : "text-blue-600"}`}>
          <Sparkles className="h-4 w-4" />
          AI Interview Round
        </div>
        <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight">{title}</h1>
        <p className={`mt-1 text-sm ${live ? "text-slate-400" : "text-slate-500"}`}>{subtitle}</p>
      </div>
      <div className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 transition-all ${
        live 
          ? "border-blue-900 bg-blue-950/40 text-blue-300 ring-1 ring-blue-500/20" 
          : "border-slate-200 bg-slate-50 text-slate-600"
      }`}>
        <Clock className={`h-5 w-5 ${live ? "animate-pulse" : ""}`} />
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-75">Time Left</div>
          <div className="text-lg font-extrabold leading-none tracking-tight">{formatTime(timeLeft)}</div>
        </div>
      </div>
    </div>
  );
}

function QualifiedExam({ attempt }: { attempt: PassedAttempt | null }) {
  if (!attempt) return null;
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-bold text-slate-950">{attempt.examTitle}</div>
          <div className="mt-1 text-xs text-slate-500">{formatDate(attempt.submittedAt)}</div>
        </div>
        <div className="rounded-md bg-white px-3 py-1 text-sm font-extrabold text-emerald-700">{attempt.percentage}%</div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <Metric label="Score" value={attempt.score} />
        <Metric label="Pass" value={attempt.passMarks} />
        <Metric label="Total" value={attempt.totalMarks} />
      </div>
    </div>
  );
}

function ChecklistItem({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className={`flex h-6 w-6 items-center justify-center rounded-full ${active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
        <CheckCircle2 className="h-4 w-4" />
      </span>
      <span className={active ? "font-semibold text-slate-800" : "text-slate-500"}>{label}</span>
    </div>
  );
}

function StatusPill({ active, icon: Icon, label }: { active: boolean; icon: typeof Camera; label: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
      <Icon className="h-4 w-4" />
      {label}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-extrabold leading-none text-slate-950">{value}</div>
    </div>
  );
}

function ResultPanel({ result }: { result: InterviewResult }) {
  const selected = result.selected ?? false;
  return (
    <section className={`rounded-lg border p-6 text-center shadow-sm ${selected ? "border-emerald-200 bg-white" : "border-rose-200 bg-white"}`}>
      <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${selected ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"}`}>
        {selected ? <CheckCircle2 className="h-8 w-8" /> : <XCircle className="h-8 w-8" />}
      </div>
      <h2 className={`mt-4 text-3xl font-extrabold ${selected ? "text-emerald-700" : "text-rose-600"}`}>
        {selected ? "🎉 Congratulations! You're Selected!" : "Interview Complete"}
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">{result.summary}</p>

      {/* Stage scores */}
      <div className="mx-auto mt-6 grid max-w-2xl gap-3 sm:grid-cols-3">
        <StageScore label="Introduction" icon="🙋" value={result.intro_score || 0} />
        <StageScore label="Speaking Skills" icon="🗣️" value={result.speaking_score || 0} />
        <StageScore label="Technical" icon="💡" value={result.technical_score || 0} />
      </div>

      {/* Speaking sub-scores */}
      {(result.pronunciation_score || 0) > 0 && (
        <div className="mx-auto mt-3 grid max-w-sm gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2">
            <div className="text-xs font-medium text-violet-600">Pronunciation</div>
            <div className="mt-1 text-lg font-extrabold text-violet-800">{result.pronunciation_score}/100</div>
          </div>
          <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2">
            <div className="text-xs font-medium text-violet-600">Communication</div>
            <div className="mt-1 text-lg font-extrabold text-violet-800">{result.communication_score || 0}/100</div>
          </div>
        </div>
      )}

      {/* Overall */}
      <div className="mx-auto mt-4 flex max-w-xs flex-col items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-5 py-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-500">
          <TrendingUp className="h-4 w-4" /> Overall Score
        </div>
        <div className={`text-4xl font-extrabold ${selected ? "text-emerald-700" : "text-slate-800"}`}>
          {result.score || 0}/100
        </div>
      </div>

      {result.feedback && (
        <div className="mx-auto mt-5 max-w-2xl rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          {result.feedback}
        </div>
      )}
    </section>
  );
}

function StageScore({ label, icon, value }: { label: string; icon: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-center">
      <div className="text-2xl">{icon}</div>
      <div className="mt-1 text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-extrabold text-slate-950">{value}/100</div>
    </div>
  );
}

function InterviewHistory({ history, compact }: { history: InterviewResult[]; compact?: boolean }) {
  if (!history.length) return null;
  return (
    <Card className="rounded-lg">
      <CardHeader><CardTitle className="text-base">Past Interviews</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {history.slice(0, compact ? 3 : undefined).map((item: any, index: number) => (
          <div key={item.id || index} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">
                Overall: {item.score || 0}/100
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString("en-IN") : "In Progress"}
              </div>
            </div>
            {item.selected !== undefined && (
              <div className={`rounded-md px-3 py-1 text-xs font-bold ${item.selected ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                {item.selected ? "Selected" : "Not Selected"}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
