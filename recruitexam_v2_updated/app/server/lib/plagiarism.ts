import { supabase } from "./supabase";

// A set of core programming keywords across Python, JS, C++, and Java to analyze structural syntax similarity.
const PROGRAMMING_KEYWORDS = new Set([
  "def", "function", "fn", "var", "let", "const", "class", "return", "if", "else", "elif", "for", "while", "do",
  "in", "of", "try", "catch", "except", "finally", "throw", "throws", "import", "from", "as", "require",
  "public", "private", "protected", "static", "final", "void", "int", "double", "float", "char", "string",
  "boolean", "bool", "nil", "null", "undefined", "true", "false", "and", "or", "not", "break", "continue",
  "yield", "async", "await", "lambda", "enumerate", "range", "len", "print", "console", "log", "self", "this"
]);

/**
 * Strips comments and normalizes whitespace in the source code to provide
 * a more accurate logic-based structural comparison.
 */
export function normalizeCode(code: string): string {
  if (!code) return "";

  // 1. Strip multi-line comments: /* ... */ or ''' ... ''' or """ ... """
  let cleaned = code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/'''[\s\S]*?'''/g, "")
    .replace(/"""[\s\S]*?"""/g, "");

  // 2. Strip single-line comments: // ... or # ...
  cleaned = cleaned
    .replace(/\/\/.*$/gm, "")
    .replace(/#.*$/gm, "");

  // 3. Normalize spaces and newlines
  return cleaned
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculates Cosine Similarity between two strings by tokenizing them.
 * If keywordOnly is true, it compares ONLY language syntax constructs/keywords.
 */
export function calculateCosineSimilarity(str1: string, str2: string, keywordOnly = false): number {
  const norm1 = normalizeCode(str1);
  const norm2 = normalizeCode(str2);

  if (!norm1 && !norm2) return 1.0;
  if (!norm1 || !norm2) return 0.0;

  const tokenize = (text: string) => {
    const rawTokens = text.split(/[^a-zA-Z0-9_$]/).filter(Boolean);
    if (keywordOnly) {
      return rawTokens.filter((token) => PROGRAMMING_KEYWORDS.has(token));
    }
    return rawTokens;
  };

  const tokens1 = tokenize(norm1);
  const tokens2 = tokenize(norm2);

  if (tokens1.length === 0 && tokens2.length === 0) return 1.0;
  if (tokens1.length === 0 || tokens2.length === 0) return 0.0;

  const getFreqs = (tokens: string[]) => {
    const freqs: Record<string, number> = {};
    for (const t of tokens) {
      freqs[t] = (freqs[t] || 0) + 1;
    }
    return freqs;
  };

  const freqs1 = getFreqs(tokens1);
  const freqs2 = getFreqs(tokens2);

  const allWords = new Set([...Object.keys(freqs1), ...Object.keys(freqs2)]);

  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;

  for (const w of allWords) {
    const f1 = freqs1[w] || 0;
    const f2 = freqs2[w] || 0;
    dotProduct += f1 * f2;
    mag1 += f1 * f1;
    mag2 += f2 * f2;
  }

  if (mag1 === 0 || mag2 === 0) return 0.0;
  return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
}

/**
 * Calculates Levenshtein Distance and maps it to a normalized similarity percentage.
 */
export function calculateLevenshteinSimilarity(str1: string, str2: string): number {
  const norm1 = normalizeCode(str1);
  const norm2 = normalizeCode(str2);

  if (!norm1 && !norm2) return 1.0;
  if (!norm1 || !norm2) return 0.0;

  const len1 = norm1.length;
  const len2 = norm2.length;

  let prevRow = Array.from({ length: len2 + 1 }, (_, i) => i);
  let currRow = new Array<number>(len2 + 1);

  for (let i = 1; i <= len1; i++) {
    currRow[0] = i;
    for (let j = 1; j <= len2; j++) {
      const cost = norm1[i - 1] === norm2[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        currRow[j - 1] + 1,      // insertion
        prevRow[j] + 1,          // deletion
        prevRow[j - 1] + cost    // substitution
      );
    }
    prevRow = [...currRow];
  }

  const distance = prevRow[len2];
  const maxLen = Math.max(len1, len2);
  return 1 - distance / maxLen;
}

/**
 * Returns a weighted similarity score between 0 and 100 representing percentage similarity.
 * Employs structural syntax analysis to detect variable-renamed plagiarisms.
 */
export function getSimilarityScore(code1: string, code2: string): number {
  const cosineFull = calculateCosineSimilarity(code1, code2, false);
  const cosineKeywords = calculateCosineSimilarity(code1, code2, true);
  const levenshteinSim = calculateLevenshteinSimilarity(code1, code2);

  // Match full identifiers (standard copy-paste)
  const fullScore = 0.6 * cosineFull + 0.4 * levenshteinSim;

  // Match structural keywords (handles code where variables are renamed but loops/conditionals stay the same)
  const structuralScore = 0.7 * cosineKeywords + 0.3 * levenshteinSim;

  // We return the maximum to catch both variable-renaming and direct copy-pasting!
  return Math.round(Math.max(fullScore, structuralScore) * 100);
}

/**
 * Scans all coding submissions of a candidate's attempt and flags similarity matches
 * greater than 85% in the database plagiarism_flags table.
 */
export async function runPlagiarismCheck(attemptId: string): Promise<void> {
  try {
    // 1. Fetch coding submissions for this attempt
    const { data: currentSubmissions, error: curErr } = await supabase
      .from("coding_submissions")
      .select("*, coding_questions(title)")
      .eq("attempt_id", attemptId);

    if (curErr || !currentSubmissions || currentSubmissions.length === 0) {
      return;
    }

    // 2. Fetch target candidate name for audit logs
    const { data: curAttempt } = await supabase
      .from("attempts")
      .select("users(name)")
      .eq("id", attemptId)
      .single();

    const curCandidateName = (curAttempt as any)?.users?.name || "Candidate";

    for (const sub of currentSubmissions) {
      if (!sub.code || !sub.code.trim()) continue;

      // 3. Clear existing plagiarism flags for this specific submission to ensure fresh runs
      await supabase
        .from("plagiarism_flags")
        .delete()
        .eq("attempt_id", attemptId)
        .eq("coding_submission_id", sub.id);

      // 4. Fetch all other candidates' submissions for the same coding question
      const { data: otherSubmissions, error: othErr } = await supabase
        .from("coding_submissions")
        .select("*, attempts(id, candidate_id, users(name))")
        .eq("coding_question_id", sub.coding_question_id)
        .neq("attempt_id", attemptId);

      if (othErr || !otherSubmissions) continue;

      for (const otherSub of otherSubmissions) {
        if (!otherSub.code || !otherSub.code.trim()) continue;

        const similarity = getSimilarityScore(sub.code, otherSub.code);

        // Flag matches that exceed the 85% threshold
        if (similarity >= 85) {
          const otherCandidateName = (otherSub.attempts as any)?.users?.name || "Other Candidate";
          const questionTitle = (sub.coding_questions as any)?.title || "Coding Challenge";

          const notes = `High code similarity (${similarity}%) detected on "${questionTitle}" with ${otherCandidateName}'s submission.`;

          await supabase.from("plagiarism_flags").insert({
            attempt_id: attemptId,
            coding_submission_id: sub.id,
            similarity_score: similarity,
            matched_with_attempt_id: otherSub.attempt_id,
            status: "open",
            notes,
          });

          // Also flag the match symmetrically on the other candidate's side if not flagged already
          const { data: existingSymmetric } = await supabase
            .from("plagiarism_flags")
            .select("id")
            .eq("attempt_id", otherSub.attempt_id)
            .eq("coding_submission_id", otherSub.id)
            .eq("matched_with_attempt_id", attemptId)
            .maybeSingle();

          if (!existingSymmetric) {
            await supabase.from("plagiarism_flags").insert({
              attempt_id: otherSub.attempt_id,
              coding_submission_id: otherSub.id,
              similarity_score: similarity,
              matched_with_attempt_id: attemptId,
              status: "open",
              notes: `High code similarity (${similarity}%) detected on "${questionTitle}" with ${curCandidateName}'s submission.`,
            });
          }
        }
      }
    }
  } catch (error) {
    console.error("Error executing plagiarism checks:", error);
  }
}
