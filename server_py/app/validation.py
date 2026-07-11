import re
from typing import Any, Dict, Optional


def is_valid_email(email: str) -> bool:
    if not email:
        return False
    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    return bool(re.match(pattern, email))


def get_password_validation_error(password: str) -> str:
    if len(password) < 8:
        return "Password must be at least 8 characters long"
    if not any(c.isupper() for c in password):
        return "Password must include at least one uppercase letter"
    if not any(c.islower() for c in password):
        return "Password must include at least one lowercase letter"
    if not any(c.isdigit() for c in password):
        return "Password must include at least one number"
    return ""


def get_exam_validation_error(exam: dict) -> str:
    title = exam.get("title")
    if not title or not str(title).strip():
        return "Exam title is required"
        
    duration = exam.get("duration")
    if duration is not None:
        try:
            dur = int(duration)
            if dur < 5:
                return "Duration must be at least 5 minutes"
        except (ValueError, TypeError):
            pass
            
    total_marks = exam.get("total_marks")
    if total_marks is not None:
        try:
            tm = int(total_marks)
            if tm <= 0:
                return "Total marks must be greater than 0"
        except (ValueError, TypeError):
            pass
            
    pass_marks = exam.get("pass_marks")
    if pass_marks is not None:
        try:
            pm = int(pass_marks)
            if pm < 0:
                return "Pass marks cannot be negative"
            if total_marks is not None and pm > int(total_marks):
                return "Pass marks cannot be greater than total marks"
        except (ValueError, TypeError):
            pass
            
    available_from = exam.get("available_from")
    available_until = exam.get("available_until")
    if available_from and available_until:
        try:
            from datetime import datetime
            # Replace trailing Z with +00:00 to support Python isoformat parsing
            dt_from = datetime.fromisoformat(str(available_from).replace("Z", "+00:00"))
            dt_until = datetime.fromisoformat(str(available_until).replace("Z", "+00:00"))
            if dt_until <= dt_from:
                return "Attempt until time must be after the start time"
        except Exception:
            pass
            
    return ""
