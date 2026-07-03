import { describe, it, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { recruiterRepository as recruiterRepo } from "../src/repositories/recruiterRepository.js";
import * as recruiterService from "../src/services/recruiterService.js";
import { mockExternalServices } from "./mocks/external.js";
import { createMockProfile } from "./factories.js";

describe("recruiterService", () => {
  let extMock: any;

  before(() => {
    extMock = mockExternalServices();
  });

  after(() => {
    extMock.restore();
  });

  it("getEligibleCandidates filters and compiles eligible candidates list", async () => {
    const mockDrive = {
      id: "drive-123",
      college_id: "col-123",
      min_cgpa: 7.5,
      eligible_branches: ["CSE", "ECE"],
      jobs: { id: "job-123", required_skills: ["React"] }
    };

    const mockProfiles = [
      createMockProfile({ user_id: "cand-1", cgpa: 8.0, branch: "CSE", skills: ["React"] }),
      createMockProfile({ user_id: "cand-2", cgpa: 7.0, branch: "CSE", skills: ["React"] }), // Low CGPA
      createMockProfile({ user_id: "cand-3", cgpa: 9.0, branch: "MECH", skills: ["React"] }), // Wrong branch
    ];

    const getDriveMock = mock.method(recruiterRepo, "getJobByIdAndRecruiter", async () => mockDrive);
    // Mock the filtered list being returned by repository delegation
    const getProfilesMock = mock.method(recruiterRepo, "getCandidatesForEligibility", async () => [mockProfiles[0]]);

    const result = await recruiterService.getEligibleCandidates("drive-123", "rec-123");
    
    assert.equal(result.count, 1);
    assert.equal(result.candidates[0].user_id, "cand-1");

    // Verify repository parameters
    const calls = getProfilesMock.mock.calls;
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].arguments[0], ["col-123"]);
    assert.equal(calls[0].arguments[1], 7.5);

    getDriveMock.mock.restore();
    getProfilesMock.mock.restore();
  });

  it("generateAiShortlist triggers AI evaluator and ranks candidates", async () => {
    const mockProfiles = [
      createMockProfile({ user_id: "cand-1", cgpa: 8.5 })
    ];
    const getProfilesMock = mock.method(recruiterRepo, "getCandidateProfiles", async () => mockProfiles);
    const getAttemptsMock = mock.method(recruiterRepo, "getAttemptsByCandidateId", async () => []);
    const getInterviewsMock = mock.method(recruiterRepo, "getInterviewsByCandidateId", async () => []);

    const result = await recruiterService.generateAiShortlist("Select top rank candidate");
    assert.equal(result.shortlist.length, 1);
    assert.equal(result.shortlist[0].name, "Test User");

    getProfilesMock.mock.restore();
    getAttemptsMock.mock.restore();
    getInterviewsMock.mock.restore();
  });
});
