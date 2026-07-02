import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../src/app.js";

describe("GET /api/health", () => {
  it("returns 200 with service status", async () => {
    const res = await request(app).get("/api/health");

    assert.equal(res.status, 200);
    assert.equal(res.body.status, "healthy");
    assert.ok(res.body.timestamp);
    assert.ok("services" in res.body);
    assert.ok("postgres" in res.body.services);
    assert.ok("groq" in res.body.services);
    assert.ok(["development", "test"].includes(res.body.environment));
  });
});

describe("GET /{*splat} (SPA fallback)", () => {
  it("returns 200 or 404 for unknown routes", async () => {
    const res = await request(app).get("/some-random-page");
    // In dev, the dist folder may not exist, so it could 404 or serve index.html
    assert.ok([200, 404].includes(res.status));
  });
});
