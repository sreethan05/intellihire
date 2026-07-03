import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { recruiterRepository as recruiterRepo } from "../../src/repositories/recruiterRepository.js";
import * as recruiterService from "../../src/services/recruiterService.js";

describe("recruiterService - serializeDriveColleges", () => {
  it("roundtrips description and metadata", () => {
    const serialized = recruiterService.serializeDriveColleges("A test drive", ["col-1", "col-2"], { persona: "friendly" });
    const parsed = recruiterService.deserializeDriveColleges(serialized);
    assert.equal(parsed.description, "A test drive");
    assert.deepEqual(parsed.college_ids, ["col-1", "col-2"]);
    assert.equal(parsed.aiConfig.persona, "friendly");
  });

  it("handles empty description gracefully", () => {
    const parsed = recruiterService.deserializeDriveColleges("");
    assert.equal(parsed.description, "");
    assert.deepEqual(parsed.college_ids, []);
    assert.equal(parsed.aiConfig.temperature, 0.4);
  });
});

describe("recruiterService - createCandidate", () => {
  it("validates password and creates user via repo", async () => {
    const createUserMock = mock.method(recruiterRepo, "createUser", async (data: any) => ({
      id: "new-user",
      ...data,
    }));

    const result = await recruiterService.createCandidate(
      { name: "New Candidate", email: "new@test.com", password: "StrongPass123!" },
      "recruiter-123"
    );

    assert.equal(result.id, "new-user");
    assert.equal(result.role, "candidate");
    assert.equal(result.created_by, "recruiter-123");
    assert.equal(createUserMock.mock.calls.length, 1);

    createUserMock.mock.restore();
  });

  it("rejects weak password", async () => {
    await assert.rejects(
      async () => await recruiterService.createCandidate(
        { name: "Test", email: "test@test.com", password: "weak" },
        "recruiter-123"
      ),
      /at least 8 characters/
    );
  });
});

describe("recruiterService - getCandidatesList", () => {
  it("returns paginated candidates with total", async () => {
    const getCandidatesMock = mock.method(recruiterRepo, "getCandidates", async () => [
      { id: "user-1", name: "Alice" },
      { id: "user-2", name: "Bob" },
    ]);
    const getCountMock = mock.method(recruiterRepo, "getCandidatesCount", async () => 42);

    const result = await recruiterService.getCandidatesList(1, 10);

    assert.equal(result.candidates.length, 2);
    assert.equal(result.total, 42);
    assert.equal(getCandidatesMock.mock.calls[0].arguments[0], 1); // page
    assert.equal(getCandidatesMock.mock.calls[0].arguments[1], 10); // limit

    getCandidatesMock.mock.restore();
    getCountMock.mock.restore();
  });
});

describe("recruiterService - getDashboardData", () => {
  it("computes stats correctly with empty data", async () => {
    const getJobsMock = mock.method(recruiterRepo, "getJobsForDashboard", async () => []);
    const getProfilesMock = mock.method(recruiterRepo, "getCandidateProfilesByCollege", async () => []);
    const getUsersMock = mock.method(recruiterRepo, "getUsersForDashboard", async () => []);
    const getPipelineMock = mock.method(recruiterRepo, "getCandidateStatusForDashboard", async () => []);
    const getAssignmentsMock = mock.method(recruiterRepo, "getAssignmentsForDashboard", async () => []);
    const getAttemptsMock = mock.method(recruiterRepo, "getAttemptsForDashboard", async () => []);
    const getExamsMock = mock.method(recruiterRepo, "getExamsByRecruiter", async () => []);

    const result = await recruiterService.getDashboardData("recruiter-123");

    assert.equal(result.stats.candidates, 0);
    assert.equal(result.stats.drives, 0);
    assert.equal(result.stats.completionRate, 0);
    assert.equal(result.examPerformance.length, 0);
    assert.equal(result.funnel.length, 6);

    getJobsMock.mock.restore();
    getProfilesMock.mock.restore();
    getUsersMock.mock.restore();
    getPipelineMock.mock.restore();
    getAssignmentsMock.mock.restore();
    getAttemptsMock.mock.restore();
    getExamsMock.mock.restore();
  });

  it("calculates pass rate correctly", async () => {
    const getJobsMock = mock.method(recruiterRepo, "getJobsForDashboard", async () => [{ id: "drive-1" }]);
    const getProfilesMock = mock.method(recruiterRepo, "getCandidateProfilesByCollege", async () => []);
    const getUsersMock = mock.method(recruiterRepo, "getUsersForDashboard", async () => []);
    const getPipelineMock = mock.method(recruiterRepo, "getCandidateStatusForDashboard", async () => []);
    const getAssignmentsMock = mock.method(recruiterRepo, "getAssignmentsForDashboard", async () => [{ exam_id: "exam-1" }]);
    const getAttemptsMock = mock.method(recruiterRepo, "getAttemptsForDashboard", async () => [
      { exam_id: "exam-1", status: "completed", score: 75, exams: [{ pass_marks: 40 }] },
      { exam_id: "exam-1", status: "completed", score: 30, exams: [{ pass_marks: 40 }] },
      { exam_id: "exam-1", status: "in_progress", score: 0, exams: [{ pass_marks: 40 }] },
    ]);
    const getExamsMock = mock.method(recruiterRepo, "getExamsByRecruiter", async () => [
      { id: "exam-1", title: "Test", pass_marks: 40, total_marks: 100, created_at: "2024-01-01T00:00:00Z" },
    ]);

    const result = await recruiterService.getDashboardData("recruiter-123");

    assert.equal(result.stats.completedAttempts, 2);
    assert.equal(result.stats.passRate, 50); // 1 passed out of 2 completed
    assert.equal(result.stats.completionRate, 200); // 2 completed / 1 assignment * 100 = 200% (because assignments = 1, completed = 2)

    getJobsMock.mock.restore();
    getProfilesMock.mock.restore();
    getUsersMock.mock.restore();
    getPipelineMock.mock.restore();
    getAssignmentsMock.mock.restore();
    getAttemptsMock.mock.restore();
    getExamsMock.mock.restore();
  });
});

describe("recruiterService - getCompareCandidates", () => {
  it("compares candidates with scores", async () => {
    const getUserMock = mock.method(recruiterRepo, "getUserById", async (id: string) => ({
      id, name: "Candidate " + id, roll_number: "R" + id,
    }));
    const getProfileMock = mock.method(recruiterRepo, "getCandidateProfileByUserId", async () => ({
      branch: "CSE", cgpa: 8.5, skills: ["JS"],
    }));
    const getAttemptsMock = mock.method(recruiterRepo, "getAttemptsByCandidateId", async () => [
      { score: 80 }, { score: 90 },
    ]);
    const getInterviewsMock = mock.method(recruiterRepo, "getInterviewsByCandidateId", async () => [
      { communication_score: 85, technical_score: 75 },
    ]);

    const result = await recruiterService.getCompareCandidates(["c1", "c2"]);

    assert.equal(result.comparison.length, 2);
    assert.equal(result.comparison[0].avgExamScore, 85); // (80+90)/2
    assert.equal(result.comparison[0].avgCommScore, 85);
    assert.equal(result.comparison[0].avgTechScore, 75);

    getUserMock.mock.restore();
    getProfileMock.mock.restore();
    getAttemptsMock.mock.restore();
    getInterviewsMock.mock.restore();
  });
});

describe("recruiterService - getAiConfig / saveAiConfig", () => {
  it("roundtrips AI config through drive description", async () => {
    const getJobMock = mock.method(recruiterRepo, "getJobByIdAndRecruiter", async () => ({
      id: "drive-1",
      company_description: recruiterService.serializeDriveColleges("Desc", ["col-1"], { persona: "expert" }),
    }));

    const result = await recruiterService.getAiConfig("drive-1", "recruiter-1");
    assert.equal(result.aiConfig.persona, "expert");

    getJobMock.mock.restore();
  });
});
