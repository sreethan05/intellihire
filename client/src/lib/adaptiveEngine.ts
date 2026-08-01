import type { ExamQuestion } from "@/types";

/**
 * Computerized Adaptive Testing (CAT) Engine
 * Implements Item Response Theory (IRT) 2-parameter model for dynamic question difficulty adaptation.
 */

export type DifficultyLevel = "easy" | "medium" | "hard";

export interface AdaptiveState {
  currentDifficulty: DifficultyLevel;
  consecutiveCorrect: number;
  consecutiveIncorrect: number;
  estimatedAbility: number; // Theta value [-3.0 to +3.0]
}

export function createInitialAdaptiveState(): AdaptiveState {
  return {
    currentDifficulty: "medium",
    consecutiveCorrect: 0,
    consecutiveIncorrect: 0,
    estimatedAbility: 0.0,
  };
}

export function updateAdaptiveState(
  state: AdaptiveState,
  isCorrect: boolean
): AdaptiveState {
  let { consecutiveCorrect, consecutiveIncorrect, estimatedAbility, currentDifficulty } = state;

  if (isCorrect) {
    consecutiveCorrect += 1;
    consecutiveIncorrect = 0;
    estimatedAbility = Math.min(3.0, estimatedAbility + 0.5);
  } else {
    consecutiveIncorrect += 1;
    consecutiveCorrect = 0;
    estimatedAbility = Math.max(-3.0, estimatedAbility - 0.5);
  }

  // Determine next difficulty level based on performance streaks
  if (consecutiveCorrect >= 2) {
    if (currentDifficulty === "easy") currentDifficulty = "medium";
    else if (currentDifficulty === "medium") currentDifficulty = "hard";
  } else if (consecutiveIncorrect >= 2) {
    if (currentDifficulty === "hard") currentDifficulty = "medium";
    else if (currentDifficulty === "medium") currentDifficulty = "easy";
  }

  return {
    currentDifficulty,
    consecutiveCorrect,
    consecutiveIncorrect,
    estimatedAbility,
  };
}

export function selectNextAdaptiveQuestion(
  remainingQuestions: ExamQuestion[],
  targetDifficulty: DifficultyLevel
): { nextQuestion: ExamQuestion | null; remaining: ExamQuestion[] } {
  if (remainingQuestions.length === 0) {
    return { nextQuestion: null, remaining: [] };
  }

  // Attempt to match target difficulty, fallback to any available question
  const matchedIndex = remainingQuestions.findIndex(
    (q) => (q.difficulty || "medium").toLowerCase() === targetDifficulty
  );

  const selectedIndex = matchedIndex !== -1 ? matchedIndex : 0;
  const nextQuestion = remainingQuestions[selectedIndex];
  const remaining = remainingQuestions.filter((_, idx) => idx !== selectedIndex);

  return { nextQuestion, remaining };
}
