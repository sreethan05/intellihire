"""
Pipeline Stage 2: Normalizer

Maps arbitrary column names to canonical fields using fuzzy matching.
So "Roll No", "roll_number", "htno", "Hall Ticket No." all map to "roll_number".

Returns a list of clean dict records ready for ingestion.
"""
import re
from typing import Dict, List, Any

import pandas as pd


# Canonical field -> possible raw column header variations (lowercased)
COLUMN_MAP: Dict[str, List[str]] = {
    "name": [
        "name", "student name", "full name", "student",
    ],
    "roll_number": [
        "roll no", "roll number", "roll", "ht no", "htno", "hall ticket",
        "hall ticket no", "regd no", "regd", "registration no",
        "registration number", "reg no", "enrollment no", "enrollment",
        "h t no", "roll no.",
    ],
    "email": [
        "email", "email id", "email address", "mail", "college email",
        "institute email", "e-mail",
    ],
    "branch": [
        "branch", "department", "dept", "stream", "specialization",
        "branch name", "department name",
    ],
    "cgpa": [
        "cgpa", "gpa", "current cgpa", "overall cgpa", "cumulative gpa",
        "grade point average",
    ],
    "graduation_year": [
        "graduation year", "grad year", "passing year", "passout year",
        "year of graduation", "passing out year", "batch",
    ],
    "phone": [
        "phone", "phone no", "phone number", "mobile", "mobile no",
        "mobile number", "contact", "contact no", "contact number",
    ],
}


def _normalize_text(text: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace. So 'H.T.No.' -> 'ht no'."""
    lower = str(text).strip().lower()
    lower = re.sub(r"[.\-_]+", " ", lower)
    lower = re.sub(r"\s+", " ", lower).strip()
    return lower


def _fuzzy_match_column(raw_col: str) -> str:
    """
    Match a raw column name to a canonical field.
    Returns the canonical field name, or the original column if no match.
    """
    normalized = _normalize_text(raw_col)
    lower = str(raw_col).strip().lower()

    for canonical_field, keywords in COLUMN_MAP.items():
        for keyword in keywords:
            if keyword in lower or keyword in normalized:
                return canonical_field

    return raw_col


def normalize_dataframe(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    Transform a raw DataFrame into a list of standardized dicts.

    Each dict has keys: name, roll_number, email, branch, cgpa,
    graduation_year, phone (optional).

    Rows missing a name or roll_number are skipped.
    """
    # 1. Rename columns via fuzzy matching
    rename_mapping = {}
    for col in df.columns:
        canonical = _fuzzy_match_column(col)
        if canonical != col:
            if canonical not in rename_mapping.values():
                rename_mapping[col] = canonical

    df_mapped = df.rename(columns=rename_mapping)

    # 2. Iterate and normalize rows
    records: List[Dict[str, Any]] = []

    for idx, row in df_mapped.iterrows():
        raw_name = row.get("name")
        raw_roll = row.get("roll_number")
        if pd.isna(raw_name) or raw_name is None or pd.isna(raw_roll) or raw_roll is None:
            continue

        name = str(raw_name).strip()
        roll_number = str(raw_roll).strip()

        if not name or name.lower() in ("nan", "none", "null") or not roll_number or roll_number.lower() in ("nan", "none", "null"):
            continue

        cgpa_raw = str(row.get("cgpa", "")).strip()
        cgpa = _parse_cgpa(cgpa_raw)

        grad_year_raw = str(row.get("graduation_year", "")).strip()
        graduation_year = _parse_graduation_year(grad_year_raw)

        raw_email = row.get("email")
        email = str(raw_email).strip() if not pd.isna(raw_email) and raw_email is not None else ""
        if email and email.lower() not in ("nan", "none", "null"):
            email = email.lower()
        else:
            email = f"{roll_number.lower()}@college.edu"

        raw_phone = row.get("phone")
        phone = str(raw_phone).strip() if not pd.isna(raw_phone) and raw_phone is not None else ""
        if phone and phone.lower() in ("nan", "none", "null"):
            phone = ""

        raw_branch = row.get("branch")
        branch = str(raw_branch).strip() if not pd.isna(raw_branch) and raw_branch is not None else ""
        if not branch or branch.lower() in ("nan", "none", "null"):
            branch = "Unknown"
        else:
            branch = branch.upper()


        record = {
            "name": name,
            "roll_number": roll_number.upper(),
            "email": email,
            "branch": branch,
            "cgpa": cgpa,
            "graduation_year": graduation_year,
            "phone": phone if phone else None,
            "source_row": idx + 2,
        }
        records.append(record)

    return records


def _parse_cgpa(raw: str) -> float:
    """Parse a CGPA value from a string. Handles '8.5', '8,5', '85%' etc."""
    if not raw or raw.lower() == "nan":
        return 0.0
    raw = raw.replace(",", ".")
    cleaned = re.sub(r"[^0-9.]", "", raw)
    if not cleaned:
        return 0.0
    try:
        val = float(cleaned)
        if val > 10:
            return round(val / 10.0, 2)
        return round(val, 2)
    except ValueError:
        return 0.0


def _parse_graduation_year(raw: str) -> int:
    """Parse a 4-digit graduation year from a string."""
    if not raw or raw.lower() == "nan":
        return 0
    match = re.search(r"\d{4}", raw)
    if match:
        return int(match.group())
    try:
        return int(float(raw))
    except (ValueError, TypeError):
        return 0
