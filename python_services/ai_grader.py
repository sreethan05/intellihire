import os
import sys
import json
from groq import Groq

class AIGrader:
    """
    Python-based AI Grader using the Groq API to evaluate short-answer responses
    and provide detailed scoring metrics and actionable feedback.
    """
    def __init__(self):
        self.api_key = os.environ.get("GROQ_API_KEY")
        self.model = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
        
    def grade_answer(self, question, answer, rubric=None, persona=None):
        if not self.api_key:
            # Fallback scoring heuristic if API key is not configured
            len_words = len(answer.strip().split())
            score = min(95, max(30, 30 + len_words * 2))
            return {
                "score": score,
                "feedback": "Groq API key not configured. Auto-calculated score based on content length.",
                "rubric_breakdown": {
                    "relevance": score,
                    "clarity": score,
                    "technical_accuracy": score
                }
            }

        client = Groq(api_key=self.api_key)
        
        prompt = f"""
        You are an expert technical interviewer evaluating a candidate's answer.
        
        Question: {question}
        Candidate Answer: {answer}
        
        Evaluation Guidelines:
        {f"Rubric: {rubric}" if rubric else "Evaluate relevance, clarity, and technical correctness."}
        {f"Interviewer Persona: {persona}" if persona else ""}
        
        Return a valid JSON object matching this schema:
        {{
            "score": 85,
            "feedback": "Provide 1-2 sentences of actionable, constructive feedback.",
            "rubric_breakdown": {{
                "relevance": 90,
                "clarity": 80,
                "technical_accuracy": 85
            }}
        }}
        """

        try:
            chat_completion = client.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": "You are a precise grading assistant. Return only JSON data. No markdown wrap."
                    },
                    {
                        "role": "user",
                        "content": prompt,
                    }
                ],
                model=self.model,
                response_format={"type": "json_object"},
                temperature=0.2,
            )
            
            result_text = chat_completion.choices[0].message.content
            return json.loads(result_text)
            
        except Exception as e:
            return {
                "error": f"Failed to call Groq AI: {str(e)}",
                "score": 50,
                "feedback": "Grading failed due to network error."
            }

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python ai_grader.py <question> <answer> [rubric] [persona]"}))
        sys.exit(1)
        
    question_text = sys.argv[1]
    answer_text = sys.argv[2]
    rubric_text = sys.argv[3] if len(sys.argv) > 3 else None
    persona_text = sys.argv[4] if len(sys.argv) > 4 else None
    
    grader = AIGrader()
    grading_result = grader.grade_answer(question_text, answer_text, rubric_text, persona_text)
    print(json.dumps(grading_result, indent=2))
