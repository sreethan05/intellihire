#!/usr/bin/env python3
"""
IntelliHire Resume Parsing and Skill Extractor.
Extracts candidate info (email, phone, skills, experience) from resumes.
"""

import re
import sys
import json

# Common recruitment keywords
SKILLS_DB = {
    "frontend": ["react", "vue", "angular", "html", "css", "javascript", "typescript", "tailwind", "nextjs", "vite"],
    "backend": ["node", "express", "python", "django", "flask", "fastapi", "java", "springboot", "go", "php", "ruby", "c#", "dotnet"],
    "database": ["postgresql", "mysql", "mongodb", "sqlite", "redis", "oracle", "supabase", "mariadb", "cassandra"],
    "devops": ["docker", "kubernetes", "aws", "gcp", "azure", "jenkins", "cicd", "terraform", "ansible", "linux"],
    "ml_ai": ["tensorflow", "pytorch", "keras", "opencv", "nltk", "scikit-learn", "pandas", "numpy", "gemini", "openai"]
}

class ResumeAnalyzer:
    def __init__(self):
        pass

    def extract_text_from_pdf(self, file_path):
        """
        Loads text from a PDF resume.
        Supports pdfplumber or pypdf if available, otherwise falls back to a mock loader.
        """
        try:
            import pdfplumber
            text = ""
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
            return text
        except ImportError:
            # Fallback to reading file as raw text if it is actually text, or mock
            try:
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    return f.read()
            except Exception:
                return ""

    def parse_resume(self, text):
        """
        Parses resume text using regex and word matching.
        """
        result = {
            "email": None,
            "phone": None,
            "skills": [],
            "years_of_experience": 0,
            "education": []
        }

        if not text:
            return result

        # 1. Extract Email
        email_match = re.search(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', text)
        if email_match:
            result["email"] = email_match.group(0)

        # 2. Extract Phone Number
        phone_patterns = [
            r'\b(?:\+\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}\b', # Standard US
            r'\b(?:\+?91[- ]?)?[6789]\d{9}\b' # Indian Mobiles
        ]
        for pattern in phone_patterns:
            phone_match = re.search(pattern, text)
            if phone_match:
                result["phone"] = phone_match.group(0)
                break

        # 3. Extract Skills
        text_lower = text.lower()
        matched_skills = set()
        for category, list_of_skills in SKILLS_DB.items():
            for skill in list_of_skills:
                # Use word boundaries for skills to avoid partial match (e.g. 'go' in 'good')
                pattern = r'\b' + re.escape(skill) + r'\b'
                if re.search(pattern, text_lower):
                    matched_skills.add(skill)
        result["skills"] = list(matched_skills)

        # 4. Estimate Experience (Years)
        # Look for keywords like "X years of experience" or date patterns
        exp_matches = re.findall(r'(\d+)\+?\s*(?:years?|yrs?)\b.*experience', text_lower)
        if exp_matches:
            result["years_of_experience"] = max(map(int, exp_matches))
        else:
            # Check for year ranges e.g. 2018 - 2022
            years = list(map(int, re.findall(r'\b(20\d{2})\b', text)))
            if len(years) >= 2:
                inferred_diff = max(years) - min(years)
                result["years_of_experience"] = min(inferred_diff, 15)

        # 5. Extract Education Keywords
        edu_keywords = ["bachelor", "master", "phd", "btech", "mtech", "bsc", "msc", "degree", "university", "college"]
        for line in text.split("\n"):
            line_lower = line.lower()
            if any(k in line_lower for k in edu_keywords):
                result["education"].append(line.strip())

        return result

    def analyze_resume_file(self, file_path):
        """
        Parses resume file and returns a JSON response.
        """
        text = self.extract_text_from_pdf(file_path)
        if not text:
            return {"error": "Could not extract text from file or file is empty"}
        return self.parse_resume(text)

if __name__ == "__main__":
    analyzer = ResumeAnalyzer()
    if len(sys.argv) > 1:
        file_to_parse = sys.argv[1]
        print(f"Parsing resume at: {file_to_parse}")
        parsed_data = analyzer.analyze_resume_file(file_to_parse)
        print(json.dumps(parsed_data, indent=2))
    else:
        print("IntelliHire Resume Analyzer loaded successfully.")
        print("Usage: python resume_analyzer.py <path_to_resume_pdf_or_txt>")
        
        # Self-test demonstration with a mock string
        sample_text = """
        John Doe
        Email: john.doe@intellihire.com
        Phone: +91 9876543210
        Education:
        B.Tech in Computer Science and Engineering from ABC University (2020-2024)
        
        Skills:
        React, Next.js, TypeScript, Node.js, Express, PostgreSQL, Supabase, Python, Docker, AWS
        
        Experience:
        Software Engineer Intern at XYZ Solutions (2023 - 2024)
        Over 2 years of experience building scalable web applications.
        """
        print("\n--- Running Self-Test Validation ---")
        test_result = analyzer.parse_resume(sample_text)
        print(json.dumps(test_result, indent=2))
