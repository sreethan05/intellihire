import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createTopicScores,
  feedMcqAnswer,
  feedCodingSubmission,
  feedCommunicationScore,
  generateInsights,
} from "../src/lib/insights.js";

describe("insights engine", () => {
  it("initializes empty topic score accumulator structure", () => {
    const scores = createTopicScores();
    assert.deepEqual(Object.keys(scores), [
      "DSA",
      "DBMS",
      "OS",
      "Networking",
      "Communication",
      "Aptitude",
    ]);
    assert.equal(scores["DSA"].total, 0);
    assert.equal(scores["DSA"].count, 0);
  });

  it("calculates mcq answer accuracy correctly with case insensitivity", () => {
    const scores = createTopicScores();
    feedMcqAnswer(scores, true, "dsa");
    feedMcqAnswer(scores, false, "DSA");
    feedMcqAnswer(scores, true, "unknown-topic"); // falls back to Aptitude

    const result = generateInsights(scores);

    const dsaPoint = result.radarData.find((r) => r.subject === "DSA");
    const aptPoint = result.radarData.find((r) => r.subject === "Aptitude");

    assert.equal(dsaPoint?.score, 50);
    assert.equal(aptPoint?.score, 100);
  });

  it("calculates coding submission percentage correctly", () => {
    const scores = createTopicScores();
    feedCodingSubmission(scores, 8, 10); // 80%
    feedCodingSubmission(scores, 4, 10); // 40%

    const result = generateInsights(scores);
    const dsaPoint = result.radarData.find((r) => r.subject === "DSA");

    assert.equal(dsaPoint?.score, 60);
  });

  it("calculates communication score properly", () => {
    const scores = createTopicScores();
    feedCommunicationScore(scores, 9); // 90%
    feedCommunicationScore(scores, 5); // 50%

    const result = generateInsights(scores);
    const commPoint = result.radarData.find((r) => r.subject === "Communication");

    assert.equal(commPoint?.score, 70);
  });

  it("generates correct strengths and weaknesses based on score cutoffs", () => {
    const scores = createTopicScores();
    feedMcqAnswer(scores, true, "DBMS");
    feedMcqAnswer(scores, true, "DBMS"); // 100% (>= 70 strength)
    feedMcqAnswer(scores, false, "OS");
    feedMcqAnswer(scores, false, "OS"); // 0% (< 50 weakness)

    const result = generateInsights(scores);

    assert.equal(result.evaluatedCount, 2);
    assert.ok(result.strengths.some((s) => s.includes("database concept")));
    assert.ok(result.weaknesses.some((w) => w.includes("process scheduling")));
  });

  it("supplies default fallback messages when no test data has been fed", () => {
    const scores = createTopicScores();
    const result = generateInsights(scores, "Test Profile");

    assert.equal(result.evaluatedCount, 0);
    assert.ok(result.strengths[0].includes("Test Profile is being populated"));
    assert.ok(result.weaknesses[0].includes("Attempt assigned mock"));
  });
});
