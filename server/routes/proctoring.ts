import { Router } from "express";
import { supabase } from "../lib/supabase";
import { authMiddleware, type AuthRequest } from "../middleware/auth";
import { hasAiKey, verifyWebcamSnapshot } from "../lib/ai";

const router = Router();

router.use(authMiddleware);

async function verifyAndLogSnapshotViolation(
  attemptId: string,
  examId: string,
  candidateId: string,
  snapshotData: string,
  currentViolationCount: number
) {
  try {
    const analysis = await verifyWebcamSnapshot(snapshotData);
    console.log(`[AI Proctoring] Snapshot verified:`, analysis);

    // Check if candidate is currently taking an AI interview
    const { data: activeInterview } = await supabase
      .from("ai_interviews")
      .select("id")
      .eq("candidate_id", candidateId)
      .eq("status", "in_progress")
      .maybeSingle();

    const isInterview = !!activeInterview;

    let violationMessage = "";
    const prefix = isInterview ? "[AI Interview] " : "";
    if (analysis.multiple_people) {
      violationMessage = `${prefix}AI Proctoring Flag: Multiple people detected in webcam feed. (${analysis.summary})`;
    } else if (!analysis.single_person) {
      violationMessage = `${prefix}AI Proctoring Flag: No candidate face visible in webcam feed. (${analysis.summary})`;
    } else if (analysis.phone_detected) {
      violationMessage = `${prefix}AI Proctoring Flag: Secondary device / mobile phone detected. (${analysis.summary})`;
    } else if (analysis.looking_away) {
      violationMessage = `${prefix}AI Proctoring Flag: Candidate persistently looking away from screen. (${analysis.summary})`;
    }

    if (violationMessage) {
      // Find the latest override event for this attempt
      const { data: latestOverride, error: overrideErr } = await supabase
        .from("proctoring_snapshots")
        .select("captured_at")
        .eq("attempt_id", attemptId)
        .eq("event_type", "camera_check")
        .eq("message", "OVERRIDE_UNLOCK")
        .order("captured_at", { ascending: false })
        .limit(1);

      if (overrideErr) {
        console.error("[AI Proctoring] Failed to fetch latest override:", overrideErr);
      }

      // Query the database for the current violation count dynamically relative to latest override
      let countQuery = supabase
        .from("proctoring_snapshots")
        .select("id", { count: "exact", head: true })
        .eq("attempt_id", attemptId)
        .eq("event_type", "violation");

      if (latestOverride && latestOverride.length > 0) {
        countQuery = countQuery.gt("captured_at", latestOverride[0].captured_at);
      }

      const { count, error: countErr } = await countQuery;

      if (countErr) {
        console.error("[AI Proctoring] Failed to fetch existing violation count:", countErr);
      }

      const nextViolationCount = (count || 0) + 1;
      console.log(`[AI Proctoring] Security anomaly flagged. Incrementing warnings to ${nextViolationCount}.`);

      // Log the violation in the proctoring snapshots table
      await supabase.from("proctoring_snapshots").insert({
        attempt_id: attemptId,
        exam_id: examId,
        candidate_id: candidateId,
        event_type: "violation",
        violation_count: nextViolationCount,
        message: violationMessage,
        snapshot_data: snapshotData,
      });

      // Fetch recruiter ID and candidate name to trigger notification
      const { data: attemptData } = await supabase
        .from("attempts")
        .select("recruiter_id, users:candidate_id(name)")
        .eq("id", attemptId)
        .single();

      if (attemptData?.recruiter_id) {
        const candidateName = (attemptData.users as any)?.name || "Candidate";
        await supabase.from("notifications").insert({
          user_id: attemptData.recruiter_id,
          title: isInterview ? `AI Interview Security Violation - ${candidateName}` : `Security Violation Flagged - ${candidateName}`,
          body: `${violationMessage} (Warning ${nextViolationCount}/3)`,
        });
      }

      // Symmetrically trigger auto-submission if violations exceed limit of 3
      if (nextViolationCount >= 3) {
        if (isInterview) {
          console.log(`[AI Proctoring] Violation limit reached for AI Interview ${activeInterview.id}. Auto-submitting.`);
          await supabase
            .from("ai_interviews")
            .update({
              status: "completed",
              score: 0,
              summary: "AI Interview auto-submitted due to excessive proctoring violations (3/3 warnings reached).",
              feedback: "Candidate exceeded the maximum allowable security violations during the AI face-to-face round. Interview terminated.",
              submitted_at: new Date().toISOString(),
            })
            .eq("id", activeInterview.id);
        } else {
          console.log(`[AI Proctoring] Violation limit reached for attempt ${attemptId}. Auto-submitting exam.`);
          // Finalize the attempt overall score using background queue
          await supabase
            .from("attempts")
            .update({
              status: "completed",
              submitted_at: new Date().toISOString(),
            })
            .eq("id", attemptId);

          const { gradingQueue } = await import("../lib/queue");
          gradingQueue.push(attemptId);
        }
      }
    }
  } catch (err) {
    console.error("[AI Proctoring] Failed to analyze snapshot:", err);
  }
}

router.post("/events", async (req: AuthRequest, res) => {
  try {
    const { attempt_id, exam_id, event_type, violation_count, message, snapshot_data } = req.body;

    if (!attempt_id || !exam_id || !event_type) {
      res.status(400).json({ error: "attempt_id, exam_id, and event_type are required" });
      return;
    }

    const { data: attempt, error: attemptError } = await supabase
      .from("attempts")
      .select("id, candidate_id, exam_id")
      .eq("id", attempt_id)
      .single();

    if (attemptError || !attempt) {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }

    if (attempt.candidate_id !== req.user!.id || attempt.exam_id !== exam_id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { data, error } = await supabase
      .from("proctoring_snapshots")
      .insert({
        attempt_id,
        exam_id,
        candidate_id: req.user!.id,
        event_type,
        violation_count: violation_count || 0,
        message: message || null,
        snapshot_data: snapshot_data || null,
      })
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    // Backend enforcement of 3-strikes rule logged from frontend
    if (violation_count >= 3) {
      if (message && message.includes("[AI Interview]")) {
        console.log(`[AI Proctoring] Frontend flagged 3 violations. Auto-submitting AI interview.`);
        await supabase
          .from("ai_interviews")
          .update({
            status: "completed",
            score: 0,
            summary: "AI Interview auto-submitted due to excessive proctoring violations (3/3 warnings reached).",
            feedback: "Candidate exceeded the maximum allowable security violations during the AI face-to-face round. Interview terminated.",
            submitted_at: new Date().toISOString(),
          })
          .eq("candidate_id", req.user!.id)
          .eq("status", "in_progress");
      } else {
        console.log(`[AI Proctoring] Frontend flagged 3 violations. Auto-submitting exam.`);
        await supabase
          .from("attempts")
          .update({
            status: "completed",
            submitted_at: new Date().toISOString(),
          })
          .eq("id", attempt_id);
      }
    }

    // Asynchronously trigger AI verification of the snapshot if snapshot data is present and AI key is configured
    if (snapshot_data && hasAiKey() && (event_type === "snapshot" || event_type === "camera_check")) {
      void verifyAndLogSnapshotViolation(attempt_id, exam_id, req.user!.id, snapshot_data, violation_count || 0);
    }

    res.json({ message: "Proctoring event logged", event: data });
  } catch (err) {
    console.error("Proctoring event error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/attempt/:attemptId", async (req: AuthRequest, res) => {
  try {
    const { attemptId } = req.params;
    const { role, id } = req.user!;

    const { data: attempt, error: attemptError } = await supabase
      .from("attempts")
      .select("id, candidate_id, recruiter_id")
      .eq("id", attemptId)
      .single();

    if (attemptError || !attempt) {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }

    const canView =
      role === "admin" ||
      attempt.candidate_id === id ||
      attempt.recruiter_id === id;

    if (!canView) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { data, error } = await supabase
      .from("proctoring_snapshots")
      .select("*")
      .eq("attempt_id", attemptId)
      .order("captured_at", { ascending: false });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ events: data || [] });
  } catch (err) {
    console.error("Proctoring fetch error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/exam/:examId/summary", async (req: AuthRequest, res) => {
  try {
    if (!["admin", "recruiter"].includes(req.user!.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { examId } = req.params;
    const collegeId = req.query.collegeId as string | undefined;

    let attemptsQuery = supabase
      .from("attempts")
      .select("id, candidate_id, recruiter_id, status, score, users:candidate_id(name, email)")
      .eq("exam_id", examId);

    if (req.user!.role === "recruiter") {
      attemptsQuery = attemptsQuery.eq("recruiter_id", req.user!.id);
    }

    if (collegeId) {
      const { data: profiles } = await supabase
        .from("candidate_profiles")
        .select("user_id")
        .eq("college_id", collegeId);
      const userIds = (profiles || []).map(p => p.user_id);
      if (userIds.length === 0) {
        res.json({ summary: [] });
        return;
      }
      attemptsQuery = attemptsQuery.in("candidate_id", userIds);
    }

    const { data: attempts, error: attemptError } = await attemptsQuery;
    if (attemptError) {
      res.status(400).json({ error: attemptError.message });
      return;
    }

    const attemptIds = (attempts || []).map((attempt) => attempt.id);
    const { data: events } = attemptIds.length
      ? await supabase
          .from("proctoring_snapshots")
          .select("attempt_id, event_type, violation_count, message, captured_at")
          .in("attempt_id", attemptIds)
      : { data: [] as any[] };

    const summary = (attempts || []).map((attempt: any) => {
      const attemptEvents = (events || []).filter((event: any) => event.attempt_id === attempt.id);
      const violations = attemptEvents.filter((event: any) => event.event_type === "violation");
      return {
        attemptId: attempt.id,
        candidateId: attempt.candidate_id,
        candidateName: attempt.users?.name || "Candidate",
        candidateEmail: attempt.users?.email || "",
        status: attempt.status,
        score: attempt.score || 0,
        snapshots: attemptEvents.filter((event: any) => event.event_type === "snapshot").length,
        violations: violations.length,
        lastViolation: violations.slice().sort((a: any, b: any) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime())[0]?.message || "",
      };
    });

    res.json({ summary });
  } catch (err) {
    console.error("Proctoring summary error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/exam/:examId/active-monitoring", async (req: AuthRequest, res) => {
  try {
    if (!["admin", "recruiter"].includes(req.user!.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { examId } = req.params;
    const collegeId = req.query.collegeId as string | undefined;

    let attemptsQuery = supabase
      .from("attempts")
      .select("id, candidate_id, recruiter_id, status, started_at, users:candidate_id(name, email)")
      .eq("exam_id", examId)
      .eq("status", "in_progress");

    if (req.user!.role === "recruiter") {
      attemptsQuery = attemptsQuery.eq("recruiter_id", req.user!.id);
    }

    if (collegeId) {
      const { data: profiles } = await supabase
        .from("candidate_profiles")
        .select("user_id")
        .eq("college_id", collegeId);
      const userIds = (profiles || []).map(p => p.user_id);
      if (userIds.length === 0) {
        res.json({ attempts: [] });
        return;
      }
      attemptsQuery = attemptsQuery.in("candidate_id", userIds);
    }

    const { data: attempts, error: attemptError } = await attemptsQuery;
    if (attemptError) {
      res.status(400).json({ error: attemptError.message });
      return;
    }

    const attemptIds = (attempts || []).map((attempt) => attempt.id);
    const { data: events } = attemptIds.length
      ? await supabase
          .from("proctoring_snapshots")
          .select("attempt_id, event_type, violation_count, message, captured_at")
          .in("attempt_id", attemptIds)
          .order("captured_at", { ascending: false })
      : { data: [] as any[] };

    const activeAttempts = (attempts || []).map((attempt: any) => {
      const attemptEvents = (events || []).filter((event: any) => event.attempt_id === attempt.id);
      
      const latestEvent = attemptEvents[0];
      const isLocked = latestEvent?.event_type === "violation";

      const latestOverride = attemptEvents.find(
        (event: any) => event.event_type === "camera_check" && event.message === "OVERRIDE_UNLOCK"
      );

      let warningCount = 0;
      if (latestOverride) {
        const overrideTime = new Date(latestOverride.captured_at).getTime();
        warningCount = attemptEvents.filter(
          (event: any) => event.event_type === "violation" && new Date(event.captured_at).getTime() > overrideTime
        ).length;
      } else {
        warningCount = attemptEvents.filter((event: any) => event.event_type === "violation").length;
      }

      return {
        attemptId: attempt.id,
        candidateId: attempt.candidate_id,
        candidateName: attempt.users?.name || "Candidate",
        candidateEmail: attempt.users?.email || "",
        startedAt: attempt.started_at,
        warningCount,
        isLocked,
        latestMessage: latestEvent?.message || null,
        latestCapturedAt: latestEvent?.captured_at || null,
      };
    });

    res.json({ attempts: activeAttempts });
  } catch (err) {
    console.error("Active monitoring error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/attempt/:attemptId/override", async (req: AuthRequest, res) => {
  try {
    if (!["admin", "recruiter"].includes(req.user!.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { attemptId } = req.params;
    const { role, id: userId } = req.user!;

    const { data: attempt, error: attemptError } = await supabase
      .from("attempts")
      .select("id, exam_id, candidate_id, recruiter_id")
      .eq("id", attemptId)
      .single();

    if (attemptError || !attempt) {
      res.status(404).json({ error: "Attempt not found" });
      return;
    }

    if (role !== "admin" && attempt.recruiter_id !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { data, error } = await supabase
      .from("proctoring_snapshots")
      .insert({
        attempt_id: attemptId,
        exam_id: attempt.exam_id,
        candidate_id: attempt.candidate_id,
        event_type: "camera_check",
        violation_count: 0,
        message: "OVERRIDE_UNLOCK",
        snapshot_data: null,
      })
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({ message: "Override unlock logged", event: data });
  } catch (err) {
    console.error("Override unlock error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
