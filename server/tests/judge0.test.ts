import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import {
  b64encode,
  b64decode,
  getJudge0Status,
  runWithJudge0,
} from "../src/lib/judge0.js";

describe("Judge0 compiler interface", () => {
  describe("b64encode & b64decode", () => {
    it("encodes and decodes string data cleanly", () => {
      const original = "Hello Judge0!";
      const encoded = b64encode(original);
      const decoded = b64decode(encoded);
      assert.equal(decoded, original);
    });

    it("returns empty string when decoding undefined/empty", () => {
      assert.equal(b64decode(""), "");
    });
  });

  describe("getJudge0Status", () => {
    it("returns active status configuration details", () => {
      const status = getJudge0Status();
      assert.ok(status.endpoint);
      assert.equal(typeof status.isPrivate, "boolean");
    });
  });

  describe("runWithJudge0", () => {
    it("throws for unsupported programming languages", async () => {
      await assert.rejects(
        runWithJudge0("print(1)", "ruby"),
        /Unsupported language: ruby/
      );
    });

    it("invokes post requests to Judge0 submissions endpoint", async () => {
      const postMock = mock.method(axios, "post", async () => {
        return {
          data: {
            stdout: b64encode("hello\n"),
            stderr: "",
            compile_output: "",
            status: { description: "Accepted" },
          },
        };
      });

      const result = await runWithJudge0('console.log("hello")', "javascript");
      assert.equal(result.stdout, "hello\n");
      assert.equal(result.status, "Accepted");

      postMock.mock.restore();
    });
  });
});
