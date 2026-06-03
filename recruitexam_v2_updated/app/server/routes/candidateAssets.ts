import { Router } from "express";
import { supabase } from "../lib/supabase";
import { authMiddleware, type AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

router.get("/certificates", async (req: AuthRequest, res) => {
  try {
    const candidateId = req.user!.id;

    const { data: attempts } = await supabase
      .from("attempts")
      .select("id, exam_id, score, submitted_at, exams:exam_id(id, title, total_marks, pass_marks)")
      .eq("candidate_id", candidateId)
      .eq("status", "completed")
      .order("submitted_at", { ascending: false });

    const passed = (attempts || []).filter((attempt: any) => {
      const exam = Array.isArray(attempt.exams) ? attempt.exams[0] : attempt.exams;
      return (attempt.score || 0) >= (exam?.pass_marks || 0);
    });

    for (const attempt of passed as any[]) {
      await supabase.from("certificates").upsert({
        candidate_id: candidateId,
        exam_id: attempt.exam_id,
        certificate_url: `/certificate/${candidateId}/${attempt.exam_id}`,
      }, { onConflict: "candidate_id,exam_id" });
    }

    const { data: certificates } = await supabase
      .from("certificates")
      .select("*, exam:exam_id(title, total_marks)")
      .eq("candidate_id", candidateId)
      .order("issued_at", { ascending: false });

    res.json({ certificates: certificates || [] });
  } catch (err) {
    console.error("Certificates error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/badges", async (req: AuthRequest, res) => {
  try {
    const candidateId = req.user!.id;
    const { data: attempts } = await supabase
      .from("attempts")
      .select("score, exams:exam_id(total_marks)")
      .eq("candidate_id", candidateId)
      .eq("status", "completed");

    const completed = attempts || [];
    const bestPercentage = completed.length
      ? Math.max(...completed.map((attempt: any) => {
          const exam = Array.isArray(attempt.exams) ? attempt.exams[0] : attempt.exams;
          return exam?.total_marks ? ((attempt.score || 0) / exam.total_marks) * 100 : 0;
        }))
      : 0;

    const earned = [
      completed.length >= 1 && { name: "Assessment Starter", description: "Completed the first assessment." },
      completed.length >= 3 && { name: "Consistent Performer", description: "Completed three assessments." },
      bestPercentage >= 80 && { name: "Top Scorer", description: "Scored 80% or above in an assessment." },
    ].filter(Boolean) as Array<{ name: string; description: string }>;

    for (const badge of earned) {
      const { data: existing } = await supabase
        .from("badges")
        .select("id")
        .eq("candidate_id", candidateId)
        .eq("name", badge.name)
        .maybeSingle();

      if (!existing) {
        await supabase.from("badges").insert({ candidate_id: candidateId, ...badge });
      }
    }

    const { data } = await supabase
      .from("badges")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("awarded_at", { ascending: false });

    res.json({ badges: data || [] });
  } catch (err) {
    console.error("Badges error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
