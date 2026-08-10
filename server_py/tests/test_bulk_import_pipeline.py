"""
Tests for the advanced bulk import pipeline: parser, normalizer,
SHA-256 dedup logic, conflict types, and end-to-end.
"""
import io
import csv
import hashlib
import pytest

from app.pipeline.parser import parse_file, ParserError
from app.pipeline.normalizer import (
    normalize_dataframe,
    _fuzzy_match_column,
    _parse_cgpa,
    _parse_graduation_year,
)


def _make_csv_bytes(rows: list, header: list = None) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    if header:
        writer.writerow(header)
    for row in rows:
        writer.writerow(row)
    return buf.getvalue().encode("utf-8")


def test_parser_csv_basic():
    csv_bytes = _make_csv_bytes(
        [["John Doe", "21CS0101", "john@college.edu", "CSE", "8.5"],
         ["Jane Smith", "21CS0102", "jane@college.edu", "CSE", "9.1"]],
        header=["Name", "Roll Number", "Email", "Branch", "CGPA"],
    )
    df, columns = parse_file(csv_bytes, "students.csv")
    assert len(df) == 2
    assert "Name" in columns


def test_parser_rejects_unsupported_format():
    with pytest.raises(ParserError):
        parse_file(b"hello", "students.pdf")


def test_parser_rejects_empty_file():
    with pytest.raises(ParserError):
        parse_file(b"", "empty.csv")


def test_parser_handles_metadata_rows():
    csv_bytes = _make_csv_bytes(
        [["MGIT College of Engineering"],
         ["Department of Computer Science"],
         ["Semester Results 2024"],
         ["Name", "Roll No", "Email", "Branch", "CGPA"],
         ["John Doe", "21CS0101", "john@college.edu", "CSE", "8.5"],
         ["Jane Smith", "21CS0102", "jane@college.edu", "CSE", "9.1"]],
    )
    df, columns = parse_file(csv_bytes, "roster.csv")
    records = normalize_dataframe(df)
    assert len(records) >= 2
    assert records[0]["name"] == "John Doe"


def test_fuzzy_match_basic():
    assert _fuzzy_match_column("Name") == "name"
    assert _fuzzy_match_column("Roll No") == "roll_number"
    assert _fuzzy_match_column("Email") == "email"
    assert _fuzzy_match_column("Branch") == "branch"
    assert _fuzzy_match_column("CGPA") == "cgpa"


def test_fuzzy_match_variations():
    assert _fuzzy_match_column("H.T.No.") == "roll_number"
    assert _fuzzy_match_column("hall ticket no") == "roll_number"
    assert _fuzzy_match_column("regd no") == "roll_number"
    assert _fuzzy_match_column("Student Name") == "name"
    assert _fuzzy_match_column("email id") == "email"
    assert _fuzzy_match_column("Department") == "branch"


def test_fuzzy_match_no_match():
    assert _fuzzy_match_column("favorite_color") == "favorite_color"
    assert _fuzzy_match_column("xyz") == "xyz"


def test_parse_cgpa():
    assert _parse_cgpa("8.5") == 8.5
    assert _parse_cgpa("9") == 9.0
    assert _parse_cgpa("8,5") == 8.5
    assert _parse_cgpa("85%") == 8.5
    assert _parse_cgpa("") == 0.0
    assert _parse_cgpa("nan") == 0.0
    assert _parse_cgpa("abc") == 0.0


def test_parse_graduation_year():
    assert _parse_graduation_year("2025") == 2025
    assert _parse_graduation_year("Batch 2025") == 2025
    assert _parse_graduation_year("Passing Year 2024") == 2024
    assert _parse_graduation_year("") == 0
    assert _parse_graduation_year("nan") == 0


def test_normalize_dataframe_basic():
    import pandas as pd
    df = pd.DataFrame([
        {"Name": "John Doe", "Roll No": "21CS0101", "Email": "john@college.edu", "Branch": "CSE", "CGPA": 8.5},
        {"Name": "Jane Smith", "Roll No": "21CS0102", "Email": "jane@college.edu", "Branch": "CSE", "CGPA": 9.1},
    ])
    records = normalize_dataframe(df)
    assert len(records) == 2
    assert records[0]["name"] == "John Doe"
    assert records[0]["roll_number"] == "21CS0101"
    assert records[0]["email"] == "john@college.edu"
    assert records[0]["branch"] == "CSE"
    assert records[0]["cgpa"] == 8.5


def test_normalize_dataframe_fuzzy_columns():
    import pandas as pd
    df = pd.DataFrame([
        {"Student Name": "John", "H.T.No.": "21CS0101", "email id": "john@college.edu", "Department": "CSE", "GPA": "8.5"},
    ])
    records = normalize_dataframe(df)
    assert len(records) == 1
    assert records[0]["name"] == "John"
    assert records[0]["roll_number"] == "21CS0101"
    assert records[0]["email"] == "john@college.edu"
    assert records[0]["branch"] == "CSE"
    assert records[0]["cgpa"] == 8.5


def test_normalize_skips_empty_rows():
    import pandas as pd
    df = pd.DataFrame([
        {"Name": "John", "Roll Number": "21CS0101", "Email": "john@college.edu", "Branch": "CSE", "CGPA": 8.5},
        {"Name": "", "Roll Number": "", "Email": "", "Branch": "", "CGPA": None},
        {"Name": None, "Roll Number": None, "Email": None, "Branch": None, "CGPA": None},
    ])
    records = normalize_dataframe(df)
    assert len(records) == 1


def test_normalize_auto_generates_email():
    import pandas as pd
    df = pd.DataFrame([{"Name": "John", "Roll No": "21CS0101"}])
    records = normalize_dataframe(df)
    assert len(records) == 1
    assert records[0]["email"] == "21cs0101@college.edu"


def test_sha256_duplicate_detection():
    csv_bytes = _make_csv_bytes(
        [["John Doe", "21CS0101"]],
        header=["Name", "Roll No"],
    )
    hash1 = hashlib.sha256(csv_bytes).hexdigest()
    hash2 = hashlib.sha256(csv_bytes).hexdigest()
    assert hash1 == hash2

    csv_bytes2 = _make_csv_bytes(
        [["Jane Smith", "21CS0102"]],
        header=["Name", "Roll No"],
    )
    hash3 = hashlib.sha256(csv_bytes2).hexdigest()
    assert hash1 != hash3


def test_end_to_end_csv_parse_and_normalize():
    csv_bytes = _make_csv_bytes(
        [["John Doe", "21CS0101", "john@college.edu", "CSE", "8.5", "2025", "9876543210"],
         ["Jane Smith", "21CS0102", "jane@college.edu", "ECE", "9.1", "2025", "9876543211"]],
        header=["Name", "Roll No", "Email", "Branch", "CGPA", "Graduation Year", "Phone"],
    )
    df, columns = parse_file(csv_bytes, "students.csv")
    records = normalize_dataframe(df)
    assert len(records) == 2
    assert records[0]["name"] == "John Doe"
    assert records[0]["roll_number"] == "21CS0101"
    assert records[0]["phone"] == "9876543210"
    assert records[0]["graduation_year"] == 2025
    assert records[1]["name"] == "Jane Smith"
    assert records[1]["branch"] == "ECE"
    assert records[1]["cgpa"] == 9.1


def test_end_to_end_messy_columns():
    csv_bytes = _make_csv_bytes(
        [["John Doe", "21CS0101", "john@college.edu", "cse", "8,5"]],
        header=["Student Name", "H.T.No.", "E-Mail", "Department", "GPA"],
    )
    df, _ = parse_file(csv_bytes, "messy.csv")
    records = normalize_dataframe(df)
    assert len(records) == 1
    assert records[0]["name"] == "John Doe"
    assert records[0]["roll_number"] == "21CS0101"
    assert records[0]["email"] == "john@college.edu"
    assert records[0]["branch"] == "CSE"
    assert records[0]["cgpa"] == 8.5


def test_end_to_end_large_file():
    rows = []
    for i in range(500):
        rows.append([f"Student{i}", f"21CS{i:04d}", f"student{i}@college.edu", "CSE", "8.0", "2025"])
    csv_bytes = _make_csv_bytes(
        rows,
        header=["Name", "Roll No", "Email", "Branch", "CGPA", "Graduation Year"],
    )
    df, _ = parse_file(csv_bytes, "large.csv")
    records = normalize_dataframe(df)
    assert len(records) == 500
    assert records[0]["name"] == "Student0"
    assert records[499]["roll_number"] == "21CS0499"
