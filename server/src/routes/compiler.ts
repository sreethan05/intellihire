import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { runWithJudge0 } from "../lib/judge0.js";
import { logger } from "../lib/logger.js";

const router = Router();
router.use(authMiddleware);

router.post("/run", async (req, res) => {
  try {
    const { code, language, stdin } = req.body;
    if (!code || !language) {
      res.status(400).json({ error: "Code and language required" });
      return;
    }
    const result = await runWithJudge0(code, language, stdin || "");
    res.json({
      output: result.stdout,
      error: result.stderr,
      compile_output: result.compile_output,
      status: result.status,
    });
  } catch (err: any) {
    logger.error({ error: err?.response?.data || err?.message }, "Run code error");
    res.status(500).json({ error: "Code execution failed" });
  }
});

router.post("/submit", async (req, res) => {
  try {
    const { code, language, test_cases } = req.body;
    if (!code || !language || !Array.isArray(test_cases)) {
      res.status(400).json({ error: "Code, language, and test_cases required" });
      return;
    }

    const results = await Promise.all(
      test_cases.map(async (tc: any) => {
        const result = await runWithJudge0(code, language, tc.input || "");
        const actual = result.stdout.trim();
        const expected = (tc.expected_output || "").trim();
        const isPassed = actual === expected;
        return {
          input: tc.input,
          expected_output: expected,
          actual_output: actual,
          passed: isPassed,
          status: result.status,
        };
      })
    );
    const passed = results.filter((r) => r.passed).length;

    const score = test_cases.length > 0
      ? Math.round((passed / test_cases.length) * 100)
      : 0;

    res.json({ results, passed, total: test_cases.length, score });
  } catch (err: any) {
    logger.error({ error: err?.response?.data || err?.message }, "Submit code error");
    res.status(500).json({ error: "Code submission failed" });
  }
});

export default router;
