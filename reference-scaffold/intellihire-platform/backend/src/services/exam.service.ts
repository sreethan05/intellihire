import { supabaseAdmin } from "../lib/supabase.js";

export function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

export async function calculateAttemptScore(attemptId: string) {
  const { data: answers, error } = await supabaseAdmin
    .from("answers")
    .select("marks_obtained")
    .eq("attempt_id", attemptId);
  if (error) throw error;
  const total = (answers ?? []).reduce((sum, row) => sum + Number(row.marks_obtained ?? 0), 0);
  await supabaseAdmin.from("attempts").update({ total_score: total, status: "completed", end_time: new Date().toISOString() }).eq("id", attemptId);
  return total;
}

