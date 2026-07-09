import os
import sys
import json
from groq import Groq

class QuestionGenerator:
    """
    Python-based AI Question Generator using the Groq API.
    Generates structured MCQs or Coding questions matching the exact schema requirements.
    """
    def __init__(self):
        self.api_key = os.environ.get("GROQ_API_KEY")
        self.model = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")

    def generate_mcqs(self, topic, difficulty, count=3):
        if not self.api_key:
            return [{
                "question": f"Sample {topic} question ({difficulty})?",
                "options": ["A", "B", "C", "D"],
                "correct_option": 0,
                "explanation": "Example explanation.",
                "marks": 5
            } for _ in range(count)]

        client = Groq(api_key=self.api_key)
        prompt = f"""
        Generate {count} multiple choice questions (MCQs) for the technical topic '{topic}' with a difficulty level of '{difficulty}'.
        Return a valid JSON array of objects fitting this exact schema:
        [
            {{
                "question": "What is the output of X?",
                "options": ["option 0", "option 1", "option 2", "option 3"],
                "correct_option": 0,
                "explanation": "Because of reason Y.",
                "marks": 5
            }}
        ]
        """

        try:
            chat_completion = client.chat.completions.create(
                messages=[
                    {"role": "system", "content": "You are a compiler science professor generating exams. Return only JSON data."},
                    {"role": "user", "content": prompt}
                ],
                model=self.model,
                response_format={"type": "json_object"},
                temperature=0.4
            )
            result = json.loads(chat_completion.choices[0].message.content)
            # Handle if the LLM wraps it under a key like 'questions' or returns an array directly
            if isinstance(result, dict) and "questions" in result:
                return result["questions"]
            return result
        except Exception as e:
            return {"error": f"Failed to generate questions: {str(e)}"}

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python question_generator.py <topic> <difficulty> [count]"}))
        sys.exit(1)

    topic_name = sys.argv[1]
    difficulty_level = sys.argv[2]
    num_questions = int(sys.argv[3]) if len(sys.argv) > 3 else 3

    generator = QuestionGenerator()
    questions = generator.generate_mcqs(topic_name, difficulty_level, num_questions)
    print(json.dumps(questions, indent=2))
