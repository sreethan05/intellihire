import { describe, it, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { interviewRepository as interviewRepo } from "../src/repositories/interviewRepository.js";
import * as interviewService from "../src/services/interviewService.js";
import { mockExternalServices } from "./mocks/external.js";
import { createMockInterview, createMockAttempt, createMockAnswer } from "./factories.js";

describe("interviewService", () => {
  let extMock: any;

  before(() => {
    extMock = mockExternalServices();
  });

  after(() => {
    extMock.restore();
  });

  it("checkEligibility returns false if candidate has not passed any exams", async () => {
    const getAttemptsMock = mock.method(interviewRepo, "getAttemptsByCandidate", async () => []);
    const result = await interviewService.checkEligibility("user-123");
    assert.equal(result.eligible, false);
    getAttemptsMock.mock.restore();
  });

  it("checkEligibility returns true and list of passed attempts if score >= pass_marks", async () => {
    const mockAttempts = [
      createMockAttempt({ score: 70 })
    ];
    const getAttemptsMock = mock.method(interviewRepo, "getAttemptsByCandidate", async () => mockAttempts);
    
    const result = await interviewService.checkEligibility("user-123");
    assert.equal(result.eligible, true);
    assert.equal(result.attempts!.length, 1);
    assert.equal(result.attempts![0].score, 70);

    getAttemptsMock.mock.restore();
  });

  it("evaluateInterview gathers answers, grades, and marks complete", async () => {
    const mockInterview = createMockInterview({ id: "interview-123", jobs: { interview_pass_score: 50 } });
    const mockAnswers = [
      createMockAnswer({ score: 80, pronunciation_score: 85, clarity_score: 75 })
    ];

    const getInterviewMock = mock.method(interviewRepo, "getInterviewById", async () => mockInterview);
    const getAnswersMock = mock.method(interviewRepo, "getInterviewAnswers", async () => mockAnswers);
    const updateInterviewMock = mock.method(interviewRepo, "updateInterview", async (_id: string, updates: any) => ({
      status: "completed",
      ...updates
    }));

    const result = await interviewService.evaluateInterview("interview-123");
    
    assert.equal(result.status, "completed");
    assert.equal(result.score, 80);
    assert.equal(result.selected, true);

    getInterviewMock.mock.restore();
    getAnswersMock.mock.restore();
    updateInterviewMock.mock.restore();
  });
});
