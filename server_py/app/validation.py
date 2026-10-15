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


def is_valid_iso_date(date_str: Optional[Any]) -> bool:
    if not date_str:
        return True
    try:
        from datetime import datetime, date
        s = str(date_str).strip()
        clean = s.replace("Z", "+00:00")
        datetime.fromisoformat(clean)
        return True
    except Exception:
        try:
            from datetime import date
            date.fromisoformat(str(date_str).strip())
            return True
        except Exception:
            return False


def get_drive_validation_error(drive: dict) -> str:
    title = drive.get("title")
    if not title or not str(title).strip():
        return "Drive title is required"
    company_name = drive.get("company_name")
    if not company_name or not str(company_name).strip():
        return "Company name is required"
    college_id = drive.get("college_id") or (drive.get("college_ids", [None])[0] if isinstance(drive.get("college_ids"), list) and drive.get("college_ids") else None)
    if not college_id:
        return "At least one college is required"
    branches = drive.get("allowed_branches")
    if not isinstance(branches, list) or len(branches) == 0:
        return "At least one allowed branch is required"
    min_cgpa = drive.get("min_cgpa")
    if min_cgpa is not None:
        try:
            cgpa_val = float(min_cgpa)
            if cgpa_val < 0.0 or cgpa_val > 10.0:
                return "Minimum CGPA must be between 0.0 and 10.0"
        except (ValueError, TypeError):
            return "Invalid CGPA value"
    salary_min = drive.get("salary_min")
    salary_max = drive.get("salary_max")
    if salary_min is not None and salary_max is not None:
        try:
            if int(salary_min) > int(salary_max):
                return "Minimum salary cannot exceed maximum salary"
        except (ValueError, TypeError):
            pass
    drive_date = drive.get("drive_date")
    if drive_date and not is_valid_iso_date(drive_date):
        return "Invalid drive date format (expected ISO format, e.g. YYYY-MM-DD)"
    return ""
