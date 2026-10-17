import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Deep exam journey — exercises the full product path end to end against the
 * real backend + database:
 *
 *   recruiter creates exam → adds questions → assigns candidate
 *   candidate starts attempt → reads (leak-free) questions → answers
 *   candidate files proctoring violations → recruiter sees lock → overrides
 *   candidate submits → background grading → score visible → recruiter review
 *
 * Unlike the smoke specs, this asserts *outcomes* (graded score, proctoring
 * lock/unlock state, answer-key containment), so a regression anywhere along
 * the pipeline fails CI instead of passing a health check.
 */

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:5000";

test.describe.configure({ mode: "serial" });

async function login(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<{ csrfToken: string; user: { id: string; role: string; email: string } }> {
  const response = await request.post(`${BACKEND_URL}/api/auth/login`, {
    data: { email, password },
  });
  expect(response.status(), `login failed for ${email}`).toBe(200);
  return response.json();
}

function csrf(token: string) {
  return { "x-csrf-token": token };
}

test.describe("Full exam journey", () => {
  test("create → assign → attempt → proctor → grade", async ({ request }) => {
    const title = `E2E Journey ${Date.now()}`;

    // ---------------------------------------------------------------
    // 0. Resolve the seeded candidate id
    // ---------------------------------------------------------------
    const candidateBootstrap = await login(request, "candidate@example.com", "candidate123");
    const candidateId = candidateBootstrap.user.id;

    // ---------------------------------------------------------------
    // 1. Recruiter creates the exam, adds questions, assigns candidate
    // ---------------------------------------------------------------
    const recruiter = await login(request, "recruiter@example.com", "recruiter123");
    const recruiterHeaders = csrf(recruiter.csrfToken);

    const createRes = await request.post(`${BACKEND_URL}/api/exam/create`, {
      data: {
        title,
        description: "Automated end-to-end journey exam",
        duration: 30,
        total_marks: 10,
        pass_marks: 4,
      },
      headers: recruiterHeaders,
    });
    expect(createRes.status()).toBe(200);
    const examId: string = (await createRes.json()).exam.id;

    const addRes = await request.post(`${BACKEND_URL}/api/exam/add-questions`, {
      data: {
        exam_id: examId,
        questions: [
          {
            question_text: "2 + 2 = ?",
            option_a: "3",
            option_b: "4",
            option_c: "5",
            option_d: "6",
            correct_option: "B",
            marks: 2,
          },
          {
            question_text: "Capital of France?",
            option_a: "Paris",
            option_b: "Rome",
            option_c: "Berlin",
            option_d: "Madrid",
            correct_option: "A",
            marks: 3,
          },
        ],
      },
      headers: recruiterHeaders,
    });
    expect(addRes.status()).toBe(200);
    expect((await addRes.json()).questions).toHaveLength(2);

    const assignRes = await request.post(`${BACKEND_URL}/api/exam/assign`, {
      data: { exam_id: examId, candidate_ids: [candidateId] },
      headers: recruiterHeaders,
    });
    expect(assignRes.status()).toBe(200);
    expect((await assignRes.json()).assignments).toHaveLength(1);

    // ---------------------------------------------------------------
    // 2. Candidate starts the attempt (and resumes it idempotently)
    // ---------------------------------------------------------------
    const candidate = await login(request, "candidate@example.com", "candidate123");
    const candidateHeaders = csrf(candidate.csrfToken);

    const startRes = await request.post(`${BACKEND_URL}/api/exam/start`, {
      data: { exam_id: examId },
      headers: candidateHeaders,
    });
    expect(startRes.status()).toBe(200);
    const startBody = await startRes.json();
    const attemptId: string = startBody.attempt.id;
    expect(startBody.attempt.status).toBe("in_progress");
    expect(startBody.attempt.remaining_seconds).toBeGreaterThan(0);

    const resumeRes = await request.post(`${BACKEND_URL}/api/exam/start`, {
      data: { exam_id: examId },
      headers: candidateHeaders,
    });
    expect(resumeRes.status()).toBe(200);
    expect((await resumeRes.json()).attempt.id).toBe(attemptId);

    // The candidate-facing payload must not leak the answer key.
    const examRes = await request.get(`${BACKEND_URL}/api/candidate/exam/${examId}`);
    expect(examRes.status()).toBe(200);
    const examBody = await examRes.json();
    expect(examBody.mcqQuestions).toHaveLength(2);
    expect(JSON.stringify(examBody)).not.toContain("correct_option");

    const q1 = examBody.mcqQuestions.find(
      (q: { question: { question_text: string } }) => q.question.question_text === "2 + 2 = ?"
    );
    const q2 = examBody.mcqQuestions.find(
      (q: { question: { question_text: string } }) => q.question.question_text === "Capital of France?"
    );
    expect(q1).toBeTruthy();
    expect(q2).toBeTruthy();

    // ---------------------------------------------------------------
    // 3. Candidate answers: Q1 right, Q2 wrong then corrected (upsert)
    // ---------------------------------------------------------------
    const submitMcq = (questionId: string, option: string) =>
      request.post(`${BACKEND_URL}/api/result/submit-mcq`, {
        data: { attempt_id: attemptId, question_id: questionId, selected_option: option },
        headers: candidateHeaders,
      });

    const a1 = await submitMcq(q1.question_id, "B");
    expect(a1.status()).toBe(200);
    // Per-submission feedback would be a guess-and-check oracle.
    expect(JSON.stringify(await a1.json())).not.toContain("is_correct");

    const a2 = await submitMcq(q2.question_id, "D");
    expect(a2.status()).toBe(200);
    const a2b = await submitMcq(q2.question_id, "A");
    expect(a2b.status()).toBe(200);

    // Mid-attempt candidate result view: no answer key, no correctness flags.
    const midAttempt = await request.get(`${BACKEND_URL}/api/result/attempt/${attemptId}`);
    expect(midAttempt.status()).toBe(200);
    const midBody = await midAttempt.json();
    expect(JSON.stringify(midBody)).not.toContain("correct_option");
    expect(JSON.stringify(midBody)).not.toContain("is_correct");

    // ---------------------------------------------------------------
    // 4. Proctoring: violations escalate, recruiter sees lock, overrides
    // ---------------------------------------------------------------
    const violation = (message: string) =>
      request.post(`${BACKEND_URL}/api/proctoring/events`, {
        data: { attempt_id: attemptId, exam_id: examId, event_type: "violation", message },
        headers: candidateHeaders,
      });

    const v1 = await violation("<b>tab switch</b> detected");
    expect(v1.status()).toBe(200);
    const v1Body = await v1.json();
    expect(v1Body.event.violation_severity).toBe("medium");
    // Client-supplied markup is sanitized before storage.
    expect(v1Body.event.message).not.toContain("<");
    expect(v1Body.event.message).toContain("tab switch");

    const v2 = await violation("copy/paste detected");
    expect(v2.status()).toBe(200);
    const v2Body = await v2.json();
    expect(v2Body.event.violation_severity).toBe("high");
    expect(v2Body.event.violation_count).toBe(2);

    const recruiter2 = await login(request, "recruiter@example.com", "recruiter123");
    const recruiterHeaders2 = csrf(recruiter2.csrfToken);

    const monitorRes = await request.get(
      `${BACKEND_URL}/api/proctoring/exam/${examId}/active-monitoring`
    );
    expect(monitorRes.status()).toBe(200);
    const monitored = (await monitorRes.json()).attempts.find(
      (a: { attemptId: string }) => a.attemptId === attemptId
    );
    expect(monitored).toBeTruthy();
    expect(monitored.isLocked).toBe(true);
    expect(monitored.warningCount).toBe(2);

    const overrideRes = await request.post(
      `${BACKEND_URL}/api/proctoring/attempt/${attemptId}/override`,
      { headers: recruiterHeaders2 }
    );
    expect(overrideRes.status()).toBe(200);

    const monitorRes2 = await request.get(
      `${BACKEND_URL}/api/proctoring/exam/${examId}/active-monitoring`
    );
    const monitored2 = (await monitorRes2.json()).attempts.find(
      (a: { attemptId: string }) => a.attemptId === attemptId
    );
    expect(monitored2.isLocked).toBe(false);
    expect(monitored2.warningCount).toBe(0);

    const timelineRes = await request.get(
      `${BACKEND_URL}/api/proctoring/attempts/${attemptId}/timeline`
    );
    expect(timelineRes.status()).toBe(200);
    const timeline: Array<{ event_type: string; relativeTime: string }> =
      (await timelineRes.json()).timeline;
    expect(timeline.some((e) => e.event_type === "admin_override")).toBe(true);
    for (const event of timeline) {
      expect(event.relativeTime).toMatch(/^\d{2}:\d{2}$/);
    }

    // ---------------------------------------------------------------
    // 5. Candidate submits; background grading completes
    // ---------------------------------------------------------------
    const candidateAgain = await login(request, "candidate@example.com", "candidate123");
    const submitRes = await request.post(`${BACKEND_URL}/api/result/submit-exam`, {
      data: { attempt_id: attemptId },
      headers: csrf(candidateAgain.csrfToken),
    });
    expect(submitRes.status()).toBe(200);

    // Double submission must be rejected (atomic state transition guard).
    const duplicate = await request.post(`${BACKEND_URL}/api/result/submit-exam`, {
      data: { attempt_id: attemptId },
      headers: csrf(candidateAgain.csrfToken),
    });
    expect(duplicate.status()).toBe(400);

    await expect
      .poll(
        async () => {
          const res = await request.get(`${BACKEND_URL}/api/result/attempt/${attemptId}`);
          if (res.status() !== 200) return `http-${res.status()}`;
          return (await res.json()).attempt.status;
        },
        { timeout: 20_000, intervals: [250, 500, 1000] }
      )
      .toBe("completed");

    const resultRes = await request.get(`${BACKEND_URL}/api/result/attempt/${attemptId}`);
    expect(resultRes.status()).toBe(200);
    const result = await resultRes.json();
    // Q1 (2 marks) + Q2 after correction (3 marks) = 5.
    expect(result.attempt.score).toBe(5);
    expect(result.attempt.status).toBe("completed");
    expect(result.answers).toHaveLength(2);
    for (const answer of result.answers) {
      expect(answer.is_correct).toBe(true);
    }
    // Even after completion the candidate view never exposes the answer key.
    expect(JSON.stringify(result)).not.toContain("correct_option");

    // ---------------------------------------------------------------
    // 6. Recruiter review: answer key + proctoring summary available
    // ---------------------------------------------------------------
    const recruiter3 = await login(request, "recruiter@example.com", "recruiter123");
    const reviewRes = await request.get(
      `${BACKEND_URL}/api/result/attempt/${attemptId}/review`,
      { headers: csrf(recruiter3.csrfToken) }
    );
    expect(reviewRes.status()).toBe(200);
    const review = await reviewRes.json();
    expect(review.attempt.score).toBe(5);
    expect(review.mcqAnswers).toHaveLength(2);
    for (const answer of review.mcqAnswers) {
      expect(answer.questions.correct_option).toBeTruthy();
    }
    expect(review.proctoringSummary.totalViolations).toBe(2);
  });
});
