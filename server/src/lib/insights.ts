/**
 * IntelliHire Insights Engine
 * Shared logic for aggregating topic scores, generating radar data,
 * and producing dynamic strengths/weaknesses from candidate performance.
 */

export interface TopicScoreAccumulator {
  total: number;
  count: number;
}

export interface RadarPoint {
  subject: string;
  score: number;
  fullMark: number;
}

export interface InsightsResult {
  radarData: RadarPoint[];
  strengths: string[];
  weaknesses: string[];
  evaluatedCount: number;
}

const DEFAULT_TOPICS = ["DSA", "DBMS", "OS", "Networking", "Communication", "Aptitude"];

const STRENGTH_TEMPLATES: Record<string, string> = {
  DSA: "Strong analytical skills and dynamic problem-solving proficiency in Data Structures & Algorithms.",
  DBMS: "Excellent database concept knowledge, index design, query tuning, and schema normalization capabilities.",
  OS: "Solid understanding of Operating System architectures, process management, memory optimization, and concurrency controls.",
  Networking: "Good grasp of computer networking protocols, network layout modeling, routing, and HTTP lifecycle.",
  Communication: "Strong verbal delivery, clarity of expression, and vocabulary during AI face-to-face interviews.",
  Aptitude: "Sharp logical reasoning, mathematical proficiency, and structured quantitative aptitude.",
};

const WEAKNESS_TEMPLATES: Record<string, string> = {
  DSA: "Focus on optimization of space/time complexities in arrays, hashing, and trees.",
  DBMS: "Revision recommended for DBMS transaction management, isolation levels, and indexing details.",
  OS: "Needs improvement in process scheduling, CPU execution cycles, and deadlock detection controls.",
  Networking: "Revise TCP/IP model layers, DNS, subnetting, and socket connection management fundamentals.",
  Communication: "Focus on speech pacing, clarity, and key term usage during oral interview evaluations.",
  Aptitude: "Spend more time solving analytical reasoning and quantitative aptitude exercises.",
};

/**
 * Initialize a fresh topic-score accumulator for all known topics.
 */
export function createTopicScores(): Record<string, TopicScoreAccumulator> {
  const scores: Record<string, TopicScoreAccumulator> = {};
  for (const topic of DEFAULT_TOPICS) {
    scores[topic] = { total: 0, count: 0 };
  }
  return scores;
}

/**
 * Feed an MCQ answer into the topic scores.
 * @param topicScores Mutable accumulator
 * @param isCorrect Whether the answer was correct
 * @param topicRaw The raw topic string from the question (e.g. "dsa", "DBMS")
 */
export function feedMcqAnswer(
  topicScores: Record<string, TopicScoreAccumulator>,
  isCorrect: boolean,
  topicRaw: string | null | undefined
): void {
  const key =
    Object.keys(topicScores).find(
      (k) => k.toLowerCase() === (topicRaw || "Aptitude").toLowerCase()
    ) || "Aptitude";
  topicScores[key].total += isCorrect ? 100 : 0;
  topicScores[key].count += 1;
}

/**
 * Feed a coding submission score into the DSA topic.
 * @param topicScores Mutable accumulator
 * @param score Obtained score
 * @param maxMarks Maximum possible marks (defaults to 10)
 */
export function feedCodingSubmission(
  topicScores: Record<string, TopicScoreAccumulator>,
  score: number,
  maxMarks = 10
): void {
  const pct = maxMarks > 0 ? (score / maxMarks) * 100 : 0;
  topicScores["DSA"].total += pct;
  topicScores["DSA"].count += 1;
}

/**
 * Feed an AI interview communication score into the Communication topic.
 * @param topicScores Mutable accumulator
 * @param communicationScore Score on a 1–10 scale
 */
export function feedCommunicationScore(
  topicScores: Record<string, TopicScoreAccumulator>,
  communicationScore: number
): void {
  topicScores["Communication"].total += (communicationScore || 0) * 10; // scale 1-10 → 0-100
  topicScores["Communication"].count += 1;
}

/**
 * Generate radar data, strengths, and weaknesses from accumulated topic scores.
 * @param topicScores Mutable accumulator (already populated via feed* helpers)
 * @param emptyMessagePrefix Optional prefix for fallback messages when no data exists
 */
export function generateInsights(
  topicScores: Record<string, TopicScoreAccumulator>,
  emptyMessagePrefix = "Profile"
): InsightsResult {
  const radarData: RadarPoint[] = Object.keys(topicScores).map((subject) => {
    const val = topicScores[subject];
    const score = val.count > 0 ? Math.round(val.total / val.count) : 0;
    return { subject, score, fullMark: 100 };
  });

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  let evaluatedCount = 0;

  for (const subject of Object.keys(topicScores)) {
    const val = topicScores[subject];
    if (val.count > 0) {
      evaluatedCount++;
      const score = Math.round(val.total / val.count);
      if (score >= 70) {
        strengths.push(STRENGTH_TEMPLATES[subject]);
      } else if (score < 50) {
        weaknesses.push(WEAKNESS_TEMPLATES[subject]);
      }
    }
  }

  if (evaluatedCount === 0) {
    strengths.push(`${emptyMessagePrefix} is being populated as you take proctored placement exams.`);
    weaknesses.push("Attempt assigned mock and placement exams to generate skill-based recommendations.");
  } else {
    if (strengths.length === 0) {
      strengths.push("Keep taking exams to demonstrate mastery and unlock strengths.");
    }
    if (weaknesses.length === 0) {
      weaknesses.push("Outstanding! No major performance weaknesses detected across evaluated topics.");
    }
  }

  return { radarData, strengths, weaknesses, evaluatedCount };
}
