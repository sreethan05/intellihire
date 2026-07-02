import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../src/app.js";

describe("GET /api/candidate/activity", () => {
  it("returns 401 when no auth token is provided", async () => {
    const res = await request(app).get("/api/candidate/activity");
    assert.equal(res.status, 401);
  });

  it("returns 401 when an invalid auth token is provided", async () => {
    const res = await request(app)
      .get("/api/candidate/activity")
      .set("Authorization", "Bearer invalid-token-12345");
    assert.equal(res.status, 401);
  });
});

describe("GET /api/candidate/offers", () => {
  it("returns 401 when no auth token is provided", async () => {
    const res = await request(app).get("/api/candidate/offers");
    assert.equal(res.status, 401);
  });

  it("returns 401 when an invalid auth token is provided", async () => {
    const res = await request(app)
      .get("/api/candidate/offers")
      .set("Authorization", "Bearer invalid-token-12345");
    assert.equal(res.status, 401);
  });
});

describe("POST /api/candidate/offers/:jobId/respond", () => {
  it("returns 401 when no auth token is provided", async () => {
    const res = await request(app)
      .post("/api/candidate/offers/00000000-0000-0000-0000-000000000000/respond")
      .send({ response: "accept" });
    assert.equal(res.status, 401);
  });

  it("returns 401 when an invalid auth token is provided", async () => {
    const res = await request(app)
      .post("/api/candidate/offers/00000000-0000-0000-0000-000000000000/respond")
      .set("Authorization", "Bearer invalid-token-12345")
      .send({ response: "accept" });
    assert.equal(res.status, 401);
  });
});

describe("GET /api/candidate/journey-tracker", () => {
  it("returns 401 when no auth token is provided", async () => {
    const res = await request(app).get("/api/candidate/journey-tracker");
    assert.equal(res.status, 401);
  });

  it("returns 401 when an invalid auth token is provided", async () => {
    const res = await request(app)
      .get("/api/candidate/journey-tracker")
      .set("Authorization", "Bearer invalid-token-12345");
    assert.equal(res.status, 401);
  });
});
