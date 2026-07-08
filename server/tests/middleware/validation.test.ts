import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateBody, validateQuery, validateParams } from "../../src/middleware/validation.js";
import { z } from "zod";

describe("Validation middleware", () => {
  function createMockReq(body: any = {}, query: any = {}, params: any = {}) {
    return {
      body,
      query,
      params,
      headers: {},
    } as any;
  }

  function createMockRes() {
    const res: any = {
      statusCode: 200,
      jsonBody: null,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: any) {
        this.jsonBody = body;
        return this;
      },
    };
    return res;
  }

  const next = () => {};

  describe("validateBody", () => {
    const schema = z.object({
      name: z.string().min(1),
      age: z.number().int().positive(),
    });

    it("allows valid body and assigns parsed data", () => {
      const req = createMockReq({ name: "Alice", age: 30 });
      const res = createMockRes();
      let calledNext = false;
      validateBody(schema)(req, res, () => { calledNext = true; });
      assert.ok(calledNext);
      assert.equal(req.body.name, "Alice");
      assert.equal(req.body.age, 30);
    });

    it("returns 400 for invalid body with field info", () => {
      const req = createMockReq({ name: "", age: -5 });
      const res = createMockRes();
      validateBody(schema)(req, res, next);
      assert.equal(res.statusCode, 400);
      assert.ok(res.jsonBody?.error);
      assert.ok(res.jsonBody?.field);
    });

    it("returns 400 for missing required field", () => {
      const req = createMockReq({ name: "Alice" });
      const res = createMockRes();
      validateBody(schema)(req, res, next);
      assert.equal(res.statusCode, 400);
    });

    it("returns 400 for extra type errors (string instead of number)", () => {
      const req = createMockReq({ name: "Alice", age: "thirty" });
      const res = createMockRes();
      validateBody(schema)(req, res, next);
      assert.equal(res.statusCode, 400);
    });
  });

  describe("validateQuery", () => {
    const schema = z.object({
      page: z.string().optional().transform((v) => Math.max(1, Number(v) || 1)),
      limit: z.string().optional().transform((v) => Math.min(50, Math.max(1, Number(v) || 10))),
    });

    it("allows valid query and transforms types", () => {
      const req = createMockReq({}, { page: "2", limit: "25" });
      const res = createMockRes();
      let calledNext = false;
      validateQuery(schema)(req, res, () => { calledNext = true; });
      assert.ok(calledNext);
      assert.equal(req.query.page, 2);
      assert.equal(req.query.limit, 25);
    });

    it("returns 400 for invalid query", () => {
      const badSchema = z.object({ sort: z.enum(["asc", "desc"]) });
      const req = createMockReq({}, { sort: "invalid" });
      const res = createMockRes();
      validateQuery(badSchema)(req, res, next);
      assert.equal(res.statusCode, 400);
    });
  });

  describe("validateParams", () => {
    const schema = z.object({
      id: z.string().uuid(),
    });

    it("allows valid UUID param", () => {
      const req = createMockReq({}, {}, { id: "550e8400-e29b-41d4-a716-446655440000" });
      const res = createMockRes();
      let calledNext = false;
      validateParams(schema)(req, res, () => { calledNext = true; });
      assert.ok(calledNext);
    });

    it("returns 400 for invalid UUID param", () => {
      const req = createMockReq({}, {}, { id: "not-a-uuid" });
      const res = createMockRes();
      validateParams(schema)(req, res, next);
      assert.equal(res.statusCode, 400);
      assert.ok(res.jsonBody?.error);
    });
  });
});
