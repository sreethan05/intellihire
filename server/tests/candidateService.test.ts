import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { candidateRepository as candidateRepo } from "../src/repositories/candidateRepository.js";
import * as candidateService from "../src/services/candidateService.js";
import { cache } from "../src/lib/cache.js";

describe("candidateService", () => {
  it("buildPublicPortfolio compiles portfolio and handles cache hit/miss successfully", async () => {
    const mockProfile = {
      user_id: "user-123",
      public_portfolio_slug: "test-slug",
      branch: "Computer Science",
      cgpa: 9.1,
      skills: ["React", "TypeScript"],
      graduation_year: 2026,
      bio: "Software developer",
      projects: [],
      semester_grades: [],
      college: { id: "col-1", name: "IIT", code: "IIT" }
    };

    const mockAnswers = [
      { is_correct: true, question: { topic: "dsa" } }
    ];

    // Mock repository
    const getProfileMock = mock.method(candidateRepo, "findPublicPortfolio", async () => mockProfile);
    const getAnswersMock = mock.method(candidateRepo, "getCandidateAnswers", async () => mockAnswers);
    const getInterviewsMock = mock.method(candidateRepo, "getCompletedInterviews", async () => []);
    const getCodingMock = mock.method(candidateRepo, "getCodingSubmissions", async () => []);
    const getAppsMock = mock.method(candidateRepo, "getCandidateApplications", async () => []);

    // Mock cache
    let cachedValue: any = null;
    const cacheGetMock = mock.method(cache, "get", async () => cachedValue);
    const cacheSetMock = mock.method(cache, "set", async (key: string, val: any) => {
      cachedValue = val;
    });

    // 1st call: Cache miss, database fetch
    const result = await candidateService.buildPublicPortfolio("test-slug");

    assert.equal(result.profile.user_id, "user-123");
    assert.equal(result.profile.branch, "Computer Science");
    assert.equal(cacheGetMock.mock.calls.length, 1);
    assert.equal(cacheSetMock.mock.calls.length, 1);
    assert.equal(getProfileMock.mock.calls.length, 1);

    // 2nd call: Cache hit, database bypass
    const result2 = await candidateService.buildPublicPortfolio("test-slug");
    assert.equal(result2.profile.user_id, "user-123");
    assert.equal(cacheGetMock.mock.calls.length, 2);
    // Repository method count should still be 1 (cache hit!)
    assert.equal(getProfileMock.mock.calls.length, 1);

    // Cleanup mocks
    getProfileMock.mock.restore();
    getAnswersMock.mock.restore();
    getInterviewsMock.mock.restore();
    getCodingMock.mock.restore();
    getAppsMock.mock.restore();
    cacheGetMock.mock.restore();
    cacheSetMock.mock.restore();
  });

  it("updateProfile invalidates candidate portfolio cache pattern", async () => {
    const mockProfile = { user_id: "user-123", public_portfolio_slug: "test-slug" };
    const updateProfileMock = mock.method(candidateRepo, "updateProfile", async () => mockProfile);
    const invalidatePatternMock = mock.method(cache, "invalidatePattern", async () => {});

    await candidateService.updateProfile("user-123", { bio: "Updated bio description" });

    assert.equal(invalidatePatternMock.mock.calls.length, 1);
    assert.equal(invalidatePatternMock.mock.calls[0].arguments[0], "portfolio:*");

    updateProfileMock.mock.restore();
    invalidatePatternMock.mock.restore();
  });

  it("completeOnboarding validates credentials and invalidates caches", async () => {
    const mockProfile = { user_id: "user-123" };
    const updateUserMock = mock.method(candidateRepo, "updateUser", async () => ({}));
    const updateProfileMock = mock.method(candidateRepo, "updateProfile", async () => mockProfile);
    const invalidatePatternMock = mock.method(cache, "invalidatePattern", async () => {});

    const profile = await candidateService.completeOnboarding("user-123", {
      password: "StrongPassword123!",
      phone: "1234567890",
      skills: ["Java", "SQL"],
      domain_preference: "backend",
    });

    assert.equal(profile.user_id, "user-123");
    assert.equal(updateUserMock.mock.calls.length, 1);
    assert.equal(invalidatePatternMock.mock.calls.length, 1);
    assert.equal(invalidatePatternMock.mock.calls[0].arguments[0], "portfolio:*");

    updateUserMock.mock.restore();
    updateProfileMock.mock.restore();
    invalidatePatternMock.mock.restore();
  });
});
