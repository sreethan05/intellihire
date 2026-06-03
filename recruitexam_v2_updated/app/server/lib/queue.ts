import { supabase } from "./supabase";
import { runWithJudge0 } from "./judge0";
import { runPlagiarismCheck } from "./plagiarism";

class BackgroundGradingQueue {
  private queue: string[] = [];
  private isProcessing = false;

  /**
   * Pushes a new candidate attempt ID to the background grading queue.
   */
  public push(attemptId: string) {
    if (!attemptId) return;

    if (!this.queue.includes(attemptId)) {
      this.queue.push(attemptId);
      console.log(`[Queue] Added attempt ${attemptId} to background grading queue. Queue size: ${this.queue.length}`);
    }

    if (!this.isProcessing) {
      void this.processQueue();
    }
  }

  /**
   * Background queue worker processing loops.
   */
  private async processQueue() {
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const currentAttemptId = this.queue.shift()!;
      console.log(`[Queue] Starting grading for attempt: ${currentAttemptId}`);

      try {
        await this.gradeAttempt(currentAttemptId);
        console.log(`[Queue] Finished grading successfully for attempt: ${currentAttemptId}`);
      } catch (error) {
        console.error(`[Queue] Failed to grade attempt ${currentAttemptId}:`, error);
      }
    }

    this.isProcessing = false;
    console.log("[Queue] Worker idle. No more items in queue.");
  }

  /**
   * Processes all pending coding submissions of an attempt, tallies scores,
   * updates status to completed, triggers plagiarism checking and shortlisting.
   */
  private async gradeAttempt(attemptId: string) {
    // 1. Fetch the attempt details
    const { data: attempt, error: attErr } = await supabase
      .from("attempts")
      .select("*")
      .eq("id", attemptId)
      .single();

    if (attErr || !attempt) {
      throw new Error(`Attempt ${attemptId} not found in database.`);
    }

    // 2. Fetch all coding submissions associated with this attempt
    const { data: submissions, error: subErr } = await supabase
      .from("coding_submissions")
      .select("*, coding_questions(*)")
      .eq("attempt_id", attemptId);

    if (subErr) {
      throw new Error(`Failed to fetch submissions for attempt ${attemptId}: ${subErr.message}`);
    }

    // 3. Grade each submission against its test cases
    if (submissions && submissions.length > 0) {
      for (const submission of submissions) {
        // Skip grading if already tested to avoid duplicate network calls
        if (submission.status === "tested" && submission.score > 0) {
          console.log(`[Queue] Submission ${submission.id} already graded. Score: ${submission.score}`);
          continue;
        }

        if (!submission.code || !submission.code.trim()) {
          console.log(`[Queue] Submission ${submission.id} has empty code. Skipping.`);
          continue;
        }

        const question = submission.coding_questions;
        if (!question) continue;

        // Parse test cases
        let testCases: any[] = [];
        try {
          testCases = typeof question.test_cases === "string"
            ? JSON.parse(question.test_cases)
            : question.test_cases;
        } catch (e) {
          console.warn(`[Queue] Failed to parse test cases for question ${question.id}`);
        }

        if (!Array.isArray(testCases) || testCases.length === 0) {
          console.log(`[Queue] Question ${question.id} has no test cases. Assigning full marks.`);
          await supabase
            .from("coding_submissions")
            .update({ score: question.marks || 10, status: "tested" })
            .eq("id", submission.id);
          continue;
        }

        // Run Judge0 compiler against test cases sequentially to respect API rate limits
        let passedCount = 0;
        console.log(`[Queue] Running ${testCases.length} test cases for question: "${question.title}" (language: ${submission.language})`);

        for (const tc of testCases) {
          try {
            const result = await runWithJudge0(submission.code, submission.language, tc.input || "");
            const actual = result.stdout.trim();
            const expected = (tc.expected_output || "").trim();

            if (actual === expected) {
              passedCount++;
            }
          } catch (execErr: any) {
            console.error(`[Queue] Test case execution failed: ${execErr.message}`);
          }
          // Subtle pause to avoid hitting public Judge0 API rate limits
          await new Promise((resolve) => setTimeout(resolve, 300));
        }

        const scorePercentage = passedCount / testCases.length;
        const finalCodingScore = Math.round(scorePercentage * (question.marks || 10));

        console.log(`[Queue] Submission ${submission.id} graded: ${passedCount}/${testCases.length} passed. Final Score: ${finalCodingScore}`);

        // Update database submission score
        await supabase
          .from("coding_submissions")
          .update({
            score: finalCodingScore,
            status: "tested"
          })
          .eq("id", submission.id);
      }
    }

    // 4. Fetch final updated scores (MCQs + Coding Submissions)
    const [{ data: answers }, { data: updatedSubmissions }] = await Promise.all([
      supabase.from("answers").select("marks_obtained").eq("attempt_id", attemptId),
      supabase.from("coding_submissions").select("score").eq("attempt_id", attemptId)
    ]);

    const mcqScore = answers?.reduce((sum: number, a: any) => sum + (a.marks_obtained || 0), 0) ?? 0;
    const codingScore = updatedSubmissions?.reduce((sum: number, s: any) => sum + (s.score || 0), 0) ?? 0;
    const totalScore = mcqScore + codingScore;

    // 5. Finalize the attempt overall score
    const { data: updatedAttempt, error: updErr } = await supabase
      .from("attempts")
      .update({
        score: totalScore,
        status: "completed",
        submitted_at: new Date().toISOString(),
      })
      .eq("id", attemptId)
      .select()
      .single();

    if (updErr || !updatedAttempt) {
      throw new Error(`Failed to finalize attempt score in database: ${updErr?.message}`);
    }

    console.log(`[Queue] Attempt ${attemptId} finalized. Total Score: ${totalScore} (MCQ: ${mcqScore}, Coding: ${codingScore})`);

    // 6. Trigger auto-shortlisting and AI Interview scheduling logic
    try {
      const { data: examData } = await supabase
        .from("exams")
        .select("pass_marks, title")
        .eq("id", updatedAttempt.exam_id)
        .single();

      const passMarks = Number(examData?.pass_marks || 0);
      const passed = totalScore >= passMarks;

      if (passed) {
        console.log(`[Queue] Attempt ${attemptId} qualified! Running auto-shortlisting workflow.`);

        // Find the job assignment
        const { data: assignment } = await supabase
          .from("exam_assignments")
          .select("job_id, assigned_by")
          .eq("exam_id", updatedAttempt.exam_id)
          .eq("candidate_id", updatedAttempt.candidate_id)
          .maybeSingle();

        // Update candidate status
        if (assignment?.job_id) {
          await supabase
            .from("candidate_status")
            .upsert(
              { job_id: assignment.job_id, candidate_id: updatedAttempt.candidate_id, status: "shortlisted" },
              { onConflict: "job_id,candidate_id" }
            );
        }

        // Create pending AI interview
        const { data: existingInterview } = await supabase
          .from("ai_interviews")
          .select("id")
          .eq("candidate_id", updatedAttempt.candidate_id)
          .eq("exam_id", updatedAttempt.exam_id)
          .maybeSingle();

        if (!existingInterview) {
          await supabase.from("ai_interviews").insert({
            candidate_id: updatedAttempt.candidate_id,
            job_id: assignment?.job_id || null,
            exam_id: updatedAttempt.exam_id,
            status: "pending",
            started_at: null,
          });
          console.log(`[Queue] Successfully scheduled pending AI face-to-face interview.`);
        }

        // Notify recruiter
        const recruiterId = assignment?.assigned_by;
        if (recruiterId) {
          await supabase.from("notifications").insert({
            user_id: recruiterId,
            title: "AI Interview Scheduling Required",
            body: `A candidate qualified "${examData?.title || "the exam"}". Please set the interview start and end time.`,
          });
        }
      }
    } catch (shortlistErr) {
      console.warn("[Queue] Auto-shortlist warning (non-fatal):", shortlistErr);
    }

    // 7. Trigger the plagiarism checker
    console.log(`[Queue] Triggering plagiarism matching for attempt: ${attemptId}`);
    await runPlagiarismCheck(attemptId);
  }
}

// Export singleton queue instance
export const gradingQueue = new BackgroundGradingQueue();
