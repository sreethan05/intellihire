import { db, storageRoot } from "./postgres.js";
import { runWithJudge0 } from "./judge0.js";
import { runPlagiarismCheck } from "./plagiarism.js";
import { sendResultPublishedEmail } from "./email.js";
import { logger } from "./logger.js";
import fs from "fs/promises";
import path from "path";

const APP_URL = process.env.VITE_API_URL?.replace("/api", "") || "http://localhost:3000";

class BackgroundGradingQueue {
  private queue: string[] = [];
  private isProcessing = false;
  private queueFilePath = path.join(storageRoot, "grading_queue.json");

  constructor() {
    void this.initQueue();
  }

  private async initQueue() {
    try {
      await fs.mkdir(storageRoot, { recursive: true });
      const data = await fs.readFile(this.queueFilePath, "utf8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        this.queue = parsed;
        logger.info({ queueSize: this.queue.length }, "Loaded pending attempts from disk queue");
        if (!this.isProcessing) {
          void this.processQueue();
        }
      }
    } catch {
      // File doesn't exist or is invalid, which is fine
    }
  }

  private async saveQueue() {
    try {
      await fs.mkdir(storageRoot, { recursive: true });
      await fs.writeFile(this.queueFilePath, JSON.stringify(this.queue), "utf8");
    } catch (err) {
      logger.error({ err }, "Failed to save grading queue to disk");
    }
  }

  /**
   * Pushes a new candidate attempt ID to the background grading queue.
   */
  public push(attemptId: string) {
    if (!attemptId) return;

    if (!this.queue.includes(attemptId)) {
      this.queue.push(attemptId);
      logger.info({ attemptId, queueSize: this.queue.length }, "Added attempt to grading queue");
      void this.saveQueue();
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
      void this.saveQueue();
      logger.info({ attemptId: currentAttemptId }, "Starting grading");

      try {
        await this.gradeAttempt(currentAttemptId);
        logger.info({ attemptId: currentAttemptId }, "Grading completed successfully");
      } catch (error) {
        logger.error({ error, attemptId: currentAttemptId }, "Grading failed");
      }
    }

    this.isProcessing = false;
    logger.info("Worker idle — no more items in queue");
  }

  /**
   * Processes all pending coding submissions of an attempt, tallies scores,
   * updates status to completed, triggers plagiarism checking and shortlisting.
   */
  private async gradeAttempt(attemptId: string) {
    // 1. Fetch the attempt details
    const { data: attempt, error: attErr } = await db
      .from("attempts")
      .select("*")
      .eq("id", attemptId)
      .single();

    if (attErr || !attempt) {
      throw new Error(`Attempt ${attemptId} not found in database.`);
    }

    // 2. Fetch all coding submissions associated with this attempt
    const { data: submissions, error: subErr } = await db
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
          logger.info({ submissionId: submission.id, score: submission.score }, "Submission already graded, skipping");
          continue;
        }

        if (!submission.code || !submission.code.trim()) {
          logger.info({ submissionId: submission.id }, "Submission has empty code, skipping");
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
        } catch {
          logger.warn({ questionId: question.id }, "Failed to parse test cases");
        }

        if (!Array.isArray(testCases) || testCases.length === 0) {
          logger.info({ questionId: question.id }, "Question has no test cases, assigning full marks");
          await db
            .from("coding_submissions")
            .update({ score: question.marks || 10, status: "tested" })
            .eq("id", submission.id);
          continue;
        }

        // Run Judge0 compiler against test cases sequentially to respect API rate limits
        let passedCount = 0;
        logger.info({ testCaseCount: testCases.length, questionTitle: question.title, language: submission.language }, "Running test cases");

        for (const tc of testCases) {
          try {
            const result = await runWithJudge0(submission.code, submission.language, tc.input || "");
            const actual = result.stdout.trim();
            const expected = (tc.expected_output || "").trim();

            if (actual === expected) {
              passedCount++;
            }
          } catch (execErr: any) {
            logger.error({ error: execErr.message }, "Test case execution failed");
          }
          // Subtle pause to avoid hitting public Judge0 API rate limits
          await new Promise((resolve) => setTimeout(resolve, 300));
        }

        const scorePercentage = passedCount / testCases.length;
        const finalCodingScore = Math.round(scorePercentage * (question.marks || 10));

        logger.info({ submissionId: submission.id, passedCount, total: testCases.length, finalScore: finalCodingScore }, "Submission graded");

        // Update database submission score
        await db
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
      db.from("answers").select("marks_obtained").eq("attempt_id", attemptId),
      db.from("coding_submissions").select("score").eq("attempt_id", attemptId)
    ]);

    const mcqScore = answers?.reduce((sum: number, a: any) => sum + (a.marks_obtained || 0), 0) ?? 0;
    const codingScore = updatedSubmissions?.reduce((sum: number, s: any) => sum + (s.score || 0), 0) ?? 0;
    const totalScore = mcqScore + codingScore;

    // 5. Finalize the attempt overall score
    const { data: updatedAttempt, error: updErr } = await db
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

    logger.info({ attemptId, totalScore, mcqScore, codingScore }, "Attempt finalized");

    // 6. Fetch exam and candidate details for email notification
    const { data: examData } = await db
      .from("exams")
      .select("pass_marks, title, total_marks")
      .eq("id", updatedAttempt.exam_id)
      .single();

    const { data: candidate } = await db
      .from("users")
      .select("name, email")
      .eq("id", updatedAttempt.candidate_id)
      .single();

    // Send result notification email (fire-and-forget)
    if (candidate?.email && examData) {
      const passed = totalScore >= (examData.pass_marks || 0);
      sendResultPublishedEmail(
        candidate.email,
        candidate.name || "Candidate",
        examData.title || "Exam",
        totalScore,
        examData.total_marks || 0,
        passed,
        APP_URL
      ).catch((err: any) => logger.error({ err, candidateId: updatedAttempt.candidate_id }, "Failed to send result email"));
    }

    // 7. Trigger auto-shortlisting and AI Interview scheduling logic
    try {
      const passMarks = Number(examData?.pass_marks || 0);
      const passed = totalScore >= passMarks;

      if (passed) {
        logger.info({ attemptId }, "Attempt qualified, running auto-shortlisting");

        // Find the job assignment
        const { data: assignment } = await db
          .from("exam_assignments")
          .select("job_id, assigned_by")
          .eq("exam_id", updatedAttempt.exam_id)
          .eq("candidate_id", updatedAttempt.candidate_id)
          .maybeSingle();

        // Update candidate status
        if (assignment?.job_id) {
          await db
            .from("candidate_status")
            .upsert(
              { job_id: assignment.job_id, candidate_id: updatedAttempt.candidate_id, status: "shortlisted" },
              { onConflict: "job_id,candidate_id" }
            );
        }

        // Create pending AI interview
        const { data: existingInterview } = await db
          .from("ai_interviews")
          .select("id")
          .eq("candidate_id", updatedAttempt.candidate_id)
          .eq("exam_id", updatedAttempt.exam_id)
          .maybeSingle();

        if (!existingInterview) {
          await db.from("ai_interviews").insert({
            candidate_id: updatedAttempt.candidate_id,
            job_id: assignment?.job_id || null,
            exam_id: updatedAttempt.exam_id,
            status: "pending",
            started_at: null,
          });
          logger.info({ attemptId, candidateId: updatedAttempt.candidate_id }, "Scheduled pending AI interview");
        }

        // Notify recruiter
        const recruiterId = assignment?.assigned_by;
        if (recruiterId) {
          await db.from("notifications").insert({
            user_id: recruiterId,
            title: "AI Interview Scheduling Required",
            body: `A candidate qualified "${examData?.title || "the exam"}". Please set the interview start and end time.`,
          });
        }
      }
    } catch (shortlistErr) {
      logger.warn({ error: shortlistErr }, "Auto-shortlist warning (non-fatal)");
    }

    // 8. Trigger the plagiarism checker
    logger.info({ attemptId }, "Triggering plagiarism check");
    await runPlagiarismCheck(attemptId);
  }
}

// Export singleton queue instance
export const gradingQueue = new BackgroundGradingQueue();
