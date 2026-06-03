import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { runWithJudge0 } from "../lib/judge0";

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
    console.error("Run code error:", err?.response?.data || err?.message);
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

    const results = [];
    let passed = 0;

    for (const tc of test_cases) {
      const result = await runWithJudge0(code, language, tc.input || "");
      const actual = result.stdout.trim();
      const expected = (tc.expected_output || "").trim();
      const isPassed = actual === expected;
      if (isPassed) passed++;

      results.push({
        input: tc.input,
        expected_output: expected,
        actual_output: actual,
        passed: isPassed,
        status: result.status,
      });
    }

    const score = test_cases.length > 0
      ? Math.round((passed / test_cases.length) * 100)
      : 0;

    res.json({ results, passed, total: test_cases.length, score });
  } catch (err: any) {
    console.error("Submit code error:", err?.response?.data || err?.message);
    res.status(500).json({ error: "Code submission failed" });
  }
});

export default router;
