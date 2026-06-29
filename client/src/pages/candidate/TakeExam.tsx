import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
  Camera,
  CameraOff,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Calculator,
  FileCode2,
  Maximize,
  ListChecks,
  Monitor,
  NotebookTabs,
  Send,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { candidateApi, compilerApi, proctoringApi, resultApi } from "@/lib/api";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import CodingCompiler from "@/components/compiler/CodingCompiler";
import type { Exam, ExamCodingQuestion, ExamQuestion } from "@/types";

const MAX_VIOLATIONS = 3;

function getOptionText(question: ExamQuestion["question"], option: "a" | "b" | "c" | "d") {
  if (option === "a") return question.option_a;
  if (option === "b") return question.option_b;
  if (option === "c") return question.option_c;
  return question.option_d;
}

function getCodingStarterCode(question: ExamCodingQuestion["question"]) {
  const starterCode = question.starter_code || "";
  const normalizedStarter = starterCode.trim();
  const normalizedDescription = (question.description || "").trim();
  const hasCodeSignal = /[{};=()<>]|\b(def|class|function|public|static|void|return|const|let|var|import|#include)\b/i.test(normalizedStarter);
  const hasProblemSignal = /\b(given|task|write|find|return|array|string|integer|output|input|distinct|element)\b/i.test(normalizedStarter);

  if (
    (normalizedDescription && normalizedStarter === normalizedDescription) ||
    (!normalizedDescription && hasProblemSignal && !hasCodeSignal && normalizedStarter.split(/\s+/).length >= 8)
  ) {
    return "";
  }

  return starterCode;
}

function shuffleList<T>(items: T[]) {
  return [...items]
    .map((item) => ({ item, sort: Math.random() }))
    .sort((left, right) => left.sort - right.sort)
    .map(({ item }) => item);
}

export default function TakeExam() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const examContainerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const violationCooldownRef = useRef(0);
  const submittedRef = useRef(false);

  const [exam, setExam] = useState<Exam | null>(null);
  const [mcqQuestions, setMcqQuestions] = useState<ExamQuestion[]>([]);
  const [codingQuestions, setCodingQuestions] = useState<ExamCodingQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [codeSubmissions, setCodeSubmissions] = useState<Record<string, { code: string; language: string }>>({});
  const [currentMcq, setCurrentMcq] = useState(0);
  const [currentCoding, setCurrentCoding] = useState(0);
  const [attemptId, setAttemptId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [tab, setTab] = useState<"mcq" | "coding">("mcq");
  const [started, setStarted] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  const [securityLocked, setSecurityLocked] = useState(false);
  const [securityMessage, setSecurityMessage] = useState("Return to fullscreen mode to continue your exam.");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [reviewFlags, setReviewFlags] = useState<Record<string, boolean>>({});
  const [showNotes, setShowNotes] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!examId) return;

    candidateApi.getExam(examId)
      .then(({ data }) => {
        const shouldShuffle = Boolean(data.exam?.shuffle_questions);
        const loadedMcqQuestions = shouldShuffle ? shuffleList(data.mcqQuestions || []) : data.mcqQuestions || [];
        const loadedCodingQuestions = shouldShuffle ? shuffleList(data.codingQuestions || []) : data.codingQuestions || [];

        setExam(data.exam);
        setMcqQuestions(loadedMcqQuestions);
        setCodingQuestions(loadedCodingQuestions);
        setTimeLeft(data.exam.duration * 60);

        const initialAnswers: Record<string, string> = {};
        loadedMcqQuestions.forEach((question: ExamQuestion) => {
          initialAnswers[question.question_id] = "";
        });
        setAnswers(initialAnswers);

        const initialCode: Record<string, { code: string; language: string }> = {};
        loadedCodingQuestions.forEach((question: ExamCodingQuestion) => {
          initialCode[question.coding_question_id] = {
            code: getCodingStarterCode(question.question),
            language: "python",
          };
        });
        setCodeSubmissions(initialCode);
      })
      .catch(() => toast.error("Failed to load exam"))
      .finally(() => setLoading(false));
  }, [examId]);

  const requestExamFullscreen = useCallback(async () => {
    const target = examContainerRef.current || document.documentElement;

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
      setSecurityMessage("Fullscreen access is required during the exam. Please enable it and continue.");
      toast.error("Fullscreen mode is required for this exam.");
      return false;
    }
  }, []);

  const exitExamFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) return;

    try {
      await document.exitFullscreen();
    } catch {
      // Ignore fullscreen exit failures while navigating away.
    }
  }, []);

  const stopCamera = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraReady(false);
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
        message,
        snapshot_data: snapshotData ?? null,
      });
    } catch {
      // Proctoring logs should not interrupt the candidate's exam flow.
    }
  }, [attemptId, examId, violationCount]);

  const requestCameraAccess = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("This browser does not support camera access.");
      setCameraReady(false);
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });

      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraError("");
      setCameraReady(true);
      return true;
    } catch {
      setCameraError("Camera permission is required before starting the exam.");
      setCameraReady(false);
      return false;
    }
  }, []);

  const handleSubmitExam = useCallback(async (reason?: string) => {
    if (!attemptId || submittedRef.current) {
      return;
    }

    submittedRef.current = true;
    setSubmitting(true);
    await logProctoringEvent("submission", reason || "Candidate submitted exam", captureSnapshot());
    await exitExamFullscreen();
    stopCamera();

    try {
      for (const question of mcqQuestions) {
        if (answers[question.question_id]) {
          await resultApi.submitMcq({
            attempt_id: attemptId,
            question_id: question.question_id,
            selected_option: answers[question.question_id],
          });
        }
      }

      for (const question of codingQuestions) {
        const submission = codeSubmissions[question.coding_question_id];
        if (submission && submission.code.trim()) {
          await resultApi.submitCode({
            attempt_id: attemptId,
            coding_question_id: question.coding_question_id,
            code: submission.code,
            language: submission.language,
          });
        }
      }

      await resultApi.submitExam(attemptId);
      toast.success(reason ? `Exam submitted: ${reason}` : "Exam submitted successfully!");
      navigate("/candidate/overview");
    } catch (error: unknown) {
      submittedRef.current = false;
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : "Failed to submit exam";

      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [answers, attemptId, captureSnapshot, codeSubmissions, codingQuestions, exitExamFullscreen, logProctoringEvent, mcqQuestions, navigate, stopCamera]);

  const registerViolation = useCallback((message: string, shouldLock = false) => {
    if (!started || submitting || submittedRef.current) return;

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

      if (next >= MAX_VIOLATIONS) {
        toast.error("Maximum security violations reached. Auto-submitting exam.");
        void handleSubmitExam("security violations");
      } else {
        toast.error(`${message} Warning ${next}/${MAX_VIOLATIONS}.`);
      }

      return next;
    });
  }, [captureSnapshot, handleSubmitExam, logProctoringEvent, started, submitting]);

  useEffect(() => {
    if (!started || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((previous) => {
        if (previous <= 1) {
          clearInterval(timer);
          return 0;
        }
        return previous - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [started, timeLeft]);

  useEffect(() => {
    if (started && timeLeft === 0 && attemptId) {
      void handleSubmitExam("time expired");
    }
  }, [attemptId, handleSubmitExam, started, timeLeft]);

  useEffect(() => {
    if (!started) return;
    void requestExamFullscreen();
  }, [requestExamFullscreen, started]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    if (!cameraStreamRef.current || !videoRef.current) return;

    videoRef.current.srcObject = cameraStreamRef.current;
    if (started) {
      void videoRef.current.play();
    }
  }, [cameraReady, started]);

  useEffect(() => {
    if (!started || !attemptId) return;

    void logProctoringEvent("camera_check", "Camera enabled before exam start", captureSnapshot());

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
  }, [attemptId, captureSnapshot, logProctoringEvent, registerViolation, started]);

  useEffect(() => {
    if (!started || !securityLocked || !attemptId) return;

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
          toast.success("Exam unlocked by recruiter! You can now resume.");
        }
      } catch (error) {
        console.error("Failed to poll attempt status:", error);
      }
    }, 2000);

    return () => {
      isSubscribed = false;
      window.clearInterval(intervalId);
    };
  }, [started, securityLocked, attemptId]);

  useEffect(() => {
    if (!started) return;

    const onFullscreenChange = () => {
      if (submittedRef.current || submitting) return;

      if (!document.fullscreenElement) {
        registerViolation("Fullscreen mode was exited.", true);
      } else {
        setSecurityLocked(false);
        void logProctoringEvent("camera_check", "Candidate resumed exam", captureSnapshot());
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        registerViolation("Tab switch or app minimize detected.", true);
      }
    };

    const onBlur = () => {
      if (submittedRef.current || submitting) return;
      registerViolation("Exam window lost focus. Please stay focused on the exam screen.", true);
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!submittedRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      toast.error("Right-click is disabled during the exam.");
    };

    const onClipboard = (event: ClipboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      toast.error("Copy, cut, and paste are disabled during the exam.");
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
  }, [registerViolation, started, submitting]);

  const startExam = async () => {
    if (!examId) return;

    try {
      const hasCamera = cameraReady || await requestCameraAccess();
      if (!hasCamera) {
        toast.error("Enable camera access to start this secure exam.");
        return;
      }

      const { data } = await api.post("/exam/start", { exam_id: examId });
      if (!data.attempt?.id) {
        toast.error("Failed to start exam");
        return;
      }

      setAttemptId(data.attempt.id);
      setStarted(true);
      setViolationCount(0);
      submittedRef.current = false;
    } catch (error: unknown) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : "Failed to start exam";

      toast.error(message);
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const handleAnswerChange = (questionId: string, option: string) => {
    setAnswers((previous) => ({ ...previous, [questionId]: option }));
  };

  const handleCodeChange = (questionId: string, code: string, language: string) => {
    setCodeSubmissions((previous) => ({ ...previous, [questionId]: { code, language } }));
  };

  const handleRunCode = async (stdin?: string) => {
    const codingQuestionId = codingQuestions[currentCoding]?.coding_question_id;
    const submission = codeSubmissions[codingQuestionId];
    if (!submission) return null;

    const { data } = await compilerApi.runCode({
      code: submission.code,
      language: submission.language,
      stdin,
    });

    return data;
  };

  const handleTestCode = async () => {
    const codingQuestion = codingQuestions[currentCoding];
    if (!codingQuestion) return null;

    const submission = codeSubmissions[codingQuestion.coding_question_id];
    if (!submission) return null;

    const { data } = await compilerApi.submitCode({
      code: submission.code,
      language: submission.language,
      test_cases: codingQuestion.question.test_cases || [],
    });

    if (attemptId && data?.score !== undefined) {
      const rawScore = Math.round((data.score / 100) * codingQuestion.marks);
      await resultApi.updateCodeScore({
        attempt_id: attemptId,
        coding_question_id: codingQuestion.coding_question_id,
        score: rawScore,
        code: submission.code,
        language: submission.language,
      });
    }

    return data;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-16 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-96 animate-pulse rounded-lg bg-gray-100" />
      </div>
    );
  }

  if (!exam) return null;

  if (!started) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardContent className="space-y-6 p-8">
          <div className="space-y-3 text-center">
            <h2 className="text-2xl font-bold text-gray-900">{exam.title}</h2>
            <p className="text-gray-500">{exam.description || "No description available"}</p>
            <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-600">
              <span>Duration: <strong>{exam.duration} min</strong></span>
              <span>Total Marks: <strong>{exam.total_marks}</strong></span>
              <span>Pass Marks: <strong>{exam.pass_marks}</strong></span>
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <div className="mb-3 flex items-center gap-2 font-semibold text-amber-800">
              <ShieldAlert className="h-4 w-4" />
              Exam Integrity Rules
            </div>
            <div className="grid gap-2 text-sm text-amber-900">
              <div>1. The exam must stay in fullscreen mode until submission.</div>
              <div>2. Tab switching, minimizing the app, or exiting fullscreen will trigger security warnings.</div>
              <div>3. Copy, paste, right-click, refresh, and restricted shortcuts are blocked during the exam.</div>
              <div>4. After {MAX_VIOLATIONS} security violations, the exam is automatically submitted.</div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                {cameraReady ? <Camera className="h-4 w-4 text-emerald-600" /> : <CameraOff className="h-4 w-4 text-rose-600" />}
                Camera Check
              </div>
              <Button variant="outline" size="sm" onClick={() => void requestCameraAccess()}>
                {cameraReady ? "Refresh Camera" : "Enable Camera"}
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
              <video
                ref={videoRef}
                muted
                playsInline
                className="aspect-video w-full rounded-lg border border-slate-200 bg-slate-950 object-cover"
              />
              <div className="flex flex-col justify-center text-sm leading-6 text-slate-600">
                <div>{cameraReady ? "Camera is active. Keep your face visible throughout the exam." : "Camera permission is required before the Start button will work."}</div>
                {cameraError && <div className="mt-2 font-medium text-rose-600">{cameraError}</div>}
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-gray-500">
            Once started, the timer cannot be paused and fullscreen access will be requested immediately.
          </p>

          <div className="flex justify-center">
            <Button size="lg" onClick={startExam} disabled={!cameraReady}>
              Start Secure Exam
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const answeredMcqCount = Object.values(answers).filter(Boolean).length;
  const answeredCodingCount = codingQuestions.filter((question) => {
    const currentCode = codeSubmissions[question.coding_question_id]?.code || "";
    const starterCode = getCodingStarterCode(question.question);
    return currentCode.trim().length > 0 && currentCode.trim() !== starterCode.trim();
  }).length;
  const totalQuestions = mcqQuestions.length + codingQuestions.length;
  const totalAnswered = answeredMcqCount + answeredCodingCount;
  const totalMarked = Object.values(reviewFlags).filter(Boolean).length;
  const currentItemKey =
    tab === "mcq"
      ? mcqQuestions[currentMcq]?.question_id
      : codingQuestions[currentCoding]?.coding_question_id;
  const currentMarked = currentItemKey ? !!reviewFlags[currentItemKey] : false;

  const toggleReviewFlag = () => {
    if (!currentItemKey) return;

    setReviewFlags((previous) => ({
      ...previous,
      [currentItemKey]: !previous[currentItemKey],
    }));
  };

  const getMcqStatus = (questionId: string, index: number) => {
    const answered = !!answers[questionId];
    const reviewing = !!reviewFlags[questionId];
    const active = index === currentMcq && tab === "mcq";
    return { answered, reviewing, active };
  };

  const getCodingStatus = (question: ExamCodingQuestion, index: number) => {
    const currentCode = codeSubmissions[question.coding_question_id]?.code || "";
    const starterCode = getCodingStarterCode(question.question);
    const answered = currentCode.trim().length > 0 && currentCode.trim() !== starterCode.trim();
    const reviewing = !!reviewFlags[question.coding_question_id];
    const active = index === currentCoding && tab === "coding";
    return { answered, reviewing, active };
  };

  const currentMcqQuestion = mcqQuestions[currentMcq];
  const activeQuestionIndex = tab === "mcq" ? currentMcq : currentCoding;
  const activeQuestionTotal = tab === "mcq" ? mcqQuestions.length : codingQuestions.length;
  const unattemptedCount = Math.max(0, totalQuestions - totalAnswered);
  const currentMarks = tab === "mcq" ? currentMcqQuestion?.marks || 0 : codingQuestions[currentCoding]?.marks || 0;

  const goToPrevious = () => {
    if (tab === "mcq") {
      setCurrentMcq((previous) => Math.max(0, previous - 1));
      return;
    }

    setCurrentCoding((previous) => Math.max(0, previous - 1));
  };

  const goToNext = () => {
    if (tab === "mcq") {
      setCurrentMcq((previous) => Math.min(mcqQuestions.length - 1, previous + 1));
      return;
    }

    setCurrentCoding((previous) => Math.min(codingQuestions.length - 1, previous + 1));
  };

  const clearCurrentAnswer = () => {
    if (!currentMcqQuestion) return;
    setAnswers((previous) => ({ ...previous, [currentMcqQuestion.question_id]: "" }));
  };

  const getQuestionTileClass = (active: boolean, answered: boolean, reviewing: boolean) => {
    if (active) return "border-blue-600 bg-blue-50 text-blue-700 ring-1 ring-blue-600";
    if (answered && reviewing) return "border-violet-300 bg-violet-100 text-violet-800";
    if (reviewing) return "border-orange-300 bg-orange-100 text-orange-800";
    if (answered) return "border-emerald-200 bg-emerald-100 text-emerald-800";
    return "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50";
  };

  return (
    <div ref={examContainerRef} className="min-h-screen bg-white text-slate-950">
      {securityLocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.35)]">
            <div className="mb-3 flex items-center gap-3 text-slate-900">
              <Monitor className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-bold">Exam Locked</h3>
            </div>
            <p className="text-sm leading-6 text-slate-600">{securityMessage}</p>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Violations used: {violationCount}/{MAX_VIOLATIONS}
            </div>
            <div className="mt-5 flex gap-3">
              <Button className="flex-1" onClick={() => void requestExamFullscreen()}>
                Return to Fullscreen
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => void handleSubmitExam("security lock")}>
                Submit Now
              </Button>
            </div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-30 grid h-[68px] grid-cols-[280px_minmax(0,1fr)_390px] items-center border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <FileCode2 className="h-5 w-5" />
          </div>
          <div className="text-lg font-bold text-slate-950">Online Examination</div>
        </div>
        <div className="truncate text-center text-xl font-bold text-blue-900">{exam.title}</div>
        <div className="flex items-center justify-end gap-4">
          <Button
            variant="outline"
            onClick={() => void handleSubmitExam()}
            disabled={submitting}
            className="h-10 rounded-md border-red-200 px-5 text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Send className="mr-2 h-4 w-4" />
            {submitting ? "Submitting..." : "Submit Exam"}
          </Button>
          <div className="h-8 w-px bg-slate-200" />
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <span>Time Left</span>
            <Clock className="h-5 w-5 text-slate-700" />
            <span className={timeLeft < 300 ? "font-bold text-red-600" : "font-bold text-slate-950"}>{formatTime(timeLeft)}</span>
          </div>
          <button type="button" onClick={() => void requestExamFullscreen()} className="rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label="Fullscreen">
            <Maximize className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="border-b border-slate-200 bg-white px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex">
            <button
              type="button"
              onClick={() => setTab("mcq")}
              className={`min-w-36 border-b-2 px-5 py-4 text-left transition ${
                tab === "mcq" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              <div className="font-semibold">Section A</div>
              <div className="mt-1 text-sm">{mcqQuestions.length} Questions</div>
            </button>
            <button
              type="button"
              onClick={() => setTab("coding")}
              className={`min-w-36 border-b-2 px-5 py-4 text-left transition ${
                tab === "coding" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              <div className="font-semibold">Section B</div>
              <div className="mt-1 text-sm">{codingQuestions.length} Questions</div>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" className="h-11 rounded-md" onClick={() => setShowCalculator((value) => !value)}>
              <Calculator className="mr-2 h-4 w-4" />
              Calculator
            </Button>
            <Button variant="outline" className="h-11 rounded-md" onClick={() => setShowNotes((value) => !value)}>
              <NotebookTabs className="mr-2 h-4 w-4" />
              Notes
            </Button>
            <Button variant="outline" className="h-11 rounded-md" onClick={toggleReviewFlag}>
              {currentMarked ? <BookmarkCheck className="mr-2 h-4 w-4 text-orange-500" /> : <Bookmark className="mr-2 h-4 w-4" />}
              {currentMarked ? "Marked" : "Mark for Review"}
            </Button>
          </div>
        </div>
      </div>

      {(showNotes || showCalculator || timeLeft < 300) && (
        <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-6 py-3 lg:grid-cols-3">
          {timeLeft < 300 && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              <AlertTriangle className="h-4 w-4" />
              Less than 5 minutes remaining.
            </div>
          )}
          {showCalculator && (
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
              <div className="mb-2 font-semibold text-slate-900">Calculator</div>
              <div className="grid grid-cols-4 gap-2">
                {["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "=", "+"].map((key) => (
                  <button key={key} type="button" className="h-9 rounded-md border border-slate-200 bg-slate-50 font-semibold hover:bg-blue-50">
                    {key}
                  </button>
                ))}
              </div>
            </div>
          )}
          {showNotes && (
            <div className="rounded-lg border border-slate-200 bg-white p-3 lg:col-span-2">
              <div className="mb-2 font-semibold text-slate-900">Notes</div>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Write rough notes here..."
                className="h-24 w-full resize-none rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-blue-400"
              />
            </div>
          )}
        </div>
      )}

      <main className="grid min-h-[calc(100vh-140px)] grid-cols-[minmax(0,1fr)_370px]">
        <section className="flex flex-col border-r border-slate-200">
          <div className="flex-1 overflow-auto p-6">
            {tab === "mcq" ? (
              mcqQuestions.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-gray-400">No MCQ questions in this exam.</CardContent>
                </Card>
              ) : (
                <div className="min-h-[620px] rounded-lg border border-slate-200 bg-white p-6">
                  <div className="mb-10 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="text-lg font-bold text-slate-900">Question {currentMcq + 1} of {mcqQuestions.length}</div>
                      <span className="rounded-md bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">Multiple Choice</span>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <span>Marks: <strong className="text-emerald-600">+{currentMarks.toFixed(2)}</strong></span>
                      <span>Negative Marks: <strong className="text-red-600">-{Number(exam.negative_marking || 0).toFixed(2)}</strong></span>
                      <button type="button" onClick={toggleReviewFlag} className="text-slate-600 hover:text-blue-700">
                        {currentMarked ? <BookmarkCheck className="h-5 w-5 text-orange-500" /> : <Bookmark className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  <h2 className="mb-9 text-lg font-bold leading-8 text-slate-950">{currentMcqQuestion?.question.question_text}</h2>

                  <RadioGroup
                    value={currentMcqQuestion ? answers[currentMcqQuestion.question_id] || "" : ""}
                    onValueChange={(value) => currentMcqQuestion && handleAnswerChange(currentMcqQuestion.question_id, value)}
                    className="grid gap-4"
                  >
                    {currentMcqQuestion && (["a", "b", "c", "d"] as const).map((option) => {
                      const selected = answers[currentMcqQuestion.question_id] === option.toUpperCase();

                      return (
                        <Label
                          key={option}
                          htmlFor={`opt-${option}`}
                          className={`flex min-h-[72px] cursor-pointer items-center gap-5 rounded-lg border px-5 text-base transition ${
                            selected ? "border-blue-500 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-blue-200"
                          }`}
                        >
                          <RadioGroupItem value={option.toUpperCase()} id={`opt-${option}`} />
                          <span className="w-8 font-bold text-blue-700">{option.toUpperCase()}.</span>
                          <span className="font-medium text-slate-800">{getOptionText(currentMcqQuestion.question, option)}</span>
                          {selected && <Check className="ml-auto h-5 w-5 text-blue-600" />}
                        </Label>
                      );
                    })}
                  </RadioGroup>

                  <Button variant="outline" className="mt-7 h-11 rounded-md" onClick={clearCurrentAnswer}>
                    Clear Answer
                  </Button>
                </div>
              )
            ) : codingQuestions.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-gray-400">No coding questions in this exam.</CardContent>
              </Card>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="text-lg font-bold text-slate-900">Question {currentCoding + 1} of {codingQuestions.length}</div>
                    <span className="rounded-md bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">Coding Problem</span>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <span>Marks: <strong className="text-emerald-600">+{currentMarks.toFixed(2)}</strong></span>
                    <span>Negative Marks: <strong className="text-red-600">-{Number(exam.negative_marking || 0).toFixed(2)}</strong></span>
                    <button type="button" onClick={toggleReviewFlag} className="flex items-center gap-2 text-slate-600 hover:text-blue-700">
                      {currentMarked ? <BookmarkCheck className="h-5 w-5 text-orange-500" /> : <Bookmark className="h-5 w-5" />}
                      Bookmark
                    </button>
                  </div>
                </div>

                <CodingCompiler
                  question={codingQuestions[currentCoding].question}
                  code={codeSubmissions[codingQuestions[currentCoding].coding_question_id]?.code || ""}
                  language={codeSubmissions[codingQuestions[currentCoding].coding_question_id]?.language || "python"}
                  onCodeChange={(code, language) => handleCodeChange(codingQuestions[currentCoding].coding_question_id, code, language)}
                  onRun={handleRunCode}
                  onSubmit={handleTestCode}
                  questionNumber={currentCoding + 1}
                  totalQuestions={codingQuestions.length}
                />
              </div>
            )}
          </div>

          <div className="grid h-20 grid-cols-3 items-center border-t border-slate-200 bg-white px-6">
            <div>
              <Button variant="outline" className="h-11 min-w-36 rounded-md border-blue-300 text-blue-700" onClick={goToPrevious} disabled={activeQuestionIndex === 0}>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Previous
              </Button>
            </div>
            <div className="text-center text-sm font-medium text-slate-500">
              Question {activeQuestionIndex + 1} / {activeQuestionTotal}
            </div>
            <div className="flex justify-end">
              <Button className="h-11 min-w-36 rounded-md bg-blue-700 hover:bg-blue-800" onClick={goToNext} disabled={activeQuestionIndex === activeQuestionTotal - 1}>
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>

        <aside className="bg-white">
          <div className="border-b border-slate-200 p-6">
            <div className="mb-5 text-lg font-bold text-slate-900">Question Navigator</div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm text-slate-600">
              <div className="flex items-center gap-2"><span className="h-4 w-4 rounded bg-emerald-100 ring-1 ring-emerald-200" />Answered</div>
              <div className="flex items-center gap-2"><span className="h-4 w-4 rounded bg-white ring-1 ring-slate-200" />Not Answered</div>
              <div className="flex items-center gap-2"><span className="h-4 w-4 rounded bg-orange-100 ring-1 ring-orange-300" />Marked</div>
              <div className="flex items-center gap-2"><span className="h-4 w-4 rounded bg-violet-100 ring-1 ring-violet-300" />Answered & Marked</div>
            </div>

            <div className="mt-7 grid grid-cols-5 gap-3">
              {mcqQuestions.map((question, index) => {
                const status = getMcqStatus(question.question_id, index);
                return (
                  <button
                    key={question.question_id}
                    type="button"
                    onClick={() => {
                      setTab("mcq");
                      setCurrentMcq(index);
                    }}
                    className={`h-12 rounded-md border text-sm font-bold transition ${getQuestionTileClass(status.active, status.answered, status.reviewing)}`}
                  >
                    {index + 1}
                  </button>
                );
              })}
              {codingQuestions.map((question, index) => {
                const status = getCodingStatus(question, index);
                return (
                  <button
                    key={question.coding_question_id}
                    type="button"
                    onClick={() => {
                      setTab("coding");
                      setCurrentCoding(index);
                    }}
                    className={`h-12 rounded-md border text-sm font-bold transition ${getQuestionTileClass(status.active, status.answered, status.reviewing)}`}
                  >
                    {mcqQuestions.length + index + 1}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-4">
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-950 p-2">
              <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase text-white/80">
                <span className="flex items-center gap-2">
                  <Camera className="h-3.5 w-3.5 text-emerald-300" />
                  Camera On
                </span>
                <span>{violationCount}/{MAX_VIOLATIONS}</span>
              </div>
              <video
                ref={videoRef}
                muted
                playsInline
                className="aspect-video w-full rounded-md bg-slate-900 object-cover"
              />
            </div>

            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-2.5 font-bold text-slate-900">Test Overview</div>
              {[
                { label: "Total Questions", value: totalQuestions, icon: ListChecks, color: "text-blue-600" },
                { label: "Attempted", value: totalAnswered, icon: CheckCircle2, color: "text-emerald-600" },
                { label: "Not Attempted", value: unattemptedCount, icon: Circle, color: "text-slate-500" },
                { label: "Marked for Review", value: totalMarked, icon: Bookmark, color: "text-orange-500" },
                { label: "Violations", value: `${violationCount}/${MAX_VIOLATIONS}`, icon: ShieldAlert, color: "text-amber-500" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 last:border-b-0">
                    <div className="flex items-center gap-3 text-sm text-slate-600">
                      <Icon className={`h-4 w-4 ${item.color}`} />
                      {item.label}
                    </div>
                    <div className="font-semibold text-slate-900">{item.value}</div>
                  </div>
                );
              })}
            </div>

            {tab === "coding" && (
              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div className="mb-2 flex items-center gap-2 font-bold text-blue-800">
                  <FileCode2 className="h-4 w-4" />
                  Coding Instructions
                </div>
                <ul className="list-disc space-y-0.5 pl-5 text-xs leading-5 text-slate-700">
                  <li>Use standard input for taking input.</li>
                  <li>Print output to standard output.</li>
                  <li>Your code is autosaved while typing.</li>
                  <li>You can run code multiple times before submitting.</li>
                </ul>
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
