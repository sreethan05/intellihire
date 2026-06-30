export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function getPasswordValidationError(password: string) {
  if (!password || password.length < 8) {
    return "Password must be at least 8 characters long";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must include at least one uppercase letter";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must include at least one lowercase letter";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must include at least one number";
  }
  return "";
}

export function getExamValidationError(input: {
  title?: string;
  duration?: number;
  total_marks?: number;
  pass_marks?: number;
  available_from?: string;
  available_until?: string;
}) {
  const title = String(input.title || "").trim();
  const duration = Number(input.duration);
  const totalMarks = Number(input.total_marks);
  const passMarks = Number(input.pass_marks || 0);

  if (!title) return "Exam title is required";
  if (!Number.isFinite(duration) || duration < 5) return "Duration must be at least 5 minutes";
  if (!Number.isFinite(totalMarks) || totalMarks <= 0) return "Total marks must be greater than 0";
  if (!Number.isFinite(passMarks) || passMarks < 0) return "Pass marks cannot be negative";
  if (passMarks > totalMarks) return "Pass marks cannot be greater than total marks";

  if (input.available_from && input.available_until) {
    const from = new Date(input.available_from).getTime();
    const until = new Date(input.available_until).getTime();
    if (Number.isFinite(from) && Number.isFinite(until) && until <= from) {
      return "Attempt until time must be after the start time";
    }
  }

  return "";
}

