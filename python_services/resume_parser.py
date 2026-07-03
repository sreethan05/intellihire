import re
import json
import sys
import os

class ResumeDataExtractor:
    """
    Python utility to parse resume text and extract candidate profiles,
    experience levels, graduation details, and matched skills.
    """
    def __init__(self):
        self.skills_database = [
            "python", "javascript", "typescript", "react", "node", "express", 
            "postgresql", "mongodb", "redis", "docker", "aws", "git", "html", 
            "css", "tailwind", "next.js", "vitest", "jest", "java", "c++", "c#"
        ]

    def clean_text(self, text):
        """Standardize text for regex searching."""
        text = re.sub(r'\s+', ' ', text)
        return text.strip()

    def extract_email(self, text):
        """Extract email address from resume text."""
        email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
        match = re.search(email_pattern, text)
        return match.group(0) if match else None

    def extract_phone(self, text):
        """Extract phone number (supports varied international formats)."""
        phone_pattern = r'(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}'
        match = re.search(phone_pattern, text)
        return match.group(0) if match else None

    def extract_cgpa(self, text):
        """Extract CGPA values (e.g. 8.7/10 or 3.8/4.0)."""
        cgpa_patterns = [
            r'(?:cgpa|gpa)\s*[:\-]?\s*([0-9]\.[0-9]{1,2})(?:\s*/\s*(?:10|4))?',
            r'\b([0-9]\.[0-9]{1,2})\s*/\s*(?:10|4)\b',
            r'\b([0-9]\.[0-9]{1,2})\s*cgpa\b'
        ]
        for pattern in cgpa_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return float(match.group(1))
        return None

    def extract_graduation_year(self, text):
        """Infer candidate graduation year from years listed in text."""
        year_pattern = r'\b(202[0-9]|203[0-0])\b'
        matches = re.findall(year_pattern, text)
        if matches:
            # Assume latest year is the graduation date
            return int(max(matches))
        return None

    def match_skills(self, text):
        """Find matching skills from our taxonomy database."""
        matched = []
        normalized_text = text.lower()
        for skill in self.skills_database:
            pattern = r'\b' + re.escape(skill) + r'\b'
            if re.search(pattern, normalized_text):
                matched.append(skill)
        return matched

    def parse(self, raw_text):
        """Parse raw resume text and return structured JSON."""
        cleaned = self.clean_text(raw_text)
        return {
            "email": self.extract_email(cleaned),
            "phone": self.extract_phone(cleaned),
            "cgpa": self.extract_cgpa(cleaned),
            "graduation_year": self.extract_graduation_year(cleaned),
            "skills": self.match_skills(cleaned),
            "raw_length_bytes": len(raw_text)
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No resume text content provided"}))
        sys.exit(1)

    extractor = ResumeDataExtractor()
    parsed_profile = extractor.parse(sys.argv[1])
    print(json.dumps(parsed_profile))
