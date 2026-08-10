"""
Pipeline Stage 1: Parser

Accepts raw file bytes + filename, returns a pandas DataFrame.
Supports .csv, .xlsx, .xls.

University roster exports often have metadata rows above the actual header.
We try header=0 first, then fall back to scanning the first 10 rows for the
one that looks most like a header using the csv module (handles inconsistent
column counts natively).
"""
import io
import os
import csv as csv_mod
from typing import Tuple, List

import pandas as pd


class ParserError(Exception):
    """Raised when a file cannot be parsed."""
    pass


# Columns that, if found in a row, strongly indicate it's the header row
_HEADER_KEYWORDS = {"name", "roll", "email", "branch", "cgpa", "phone"}


def parse_file(file_bytes: bytes, filename: str) -> Tuple[pd.DataFrame, List[str]]:
    """
    Parse an uploaded file into a raw DataFrame.

    Args:
        file_bytes: Raw file content as bytes.
        filename: Original filename (used to detect extension).

    Returns:
        (DataFrame, list of column names)

    Raises:
        ParserError: If the file format is unsupported or parsing fails.
    """
    ext = os.path.splitext(filename)[1].lower()

    try:
        if ext == ".csv":
            try:
                try:
                    df = pd.read_csv(io.BytesIO(file_bytes), encoding="utf-8")
                except UnicodeDecodeError:
                    df = pd.read_csv(io.BytesIO(file_bytes), encoding="latin-1")
            except Exception:
                # If the file has metadata rows with inconsistent column counts
                # (common in university exports), the strict C parser fails.
                try:
                    df = pd.read_csv(
                        io.BytesIO(file_bytes),
                        encoding="utf-8",
                        header=None,
                        engine="python",
                        on_bad_lines="skip",
                    )
                except UnicodeDecodeError:
                    df = pd.read_csv(
                        io.BytesIO(file_bytes),
                        encoding="latin-1",
                        header=None,
                        engine="python",
                        on_bad_lines="skip",
                    )
                df.columns = [f"Unnamed_{i}" for i in range(len(df.columns))]
        elif ext in (".xlsx", ".xls"):
            df = pd.read_excel(io.BytesIO(file_bytes), engine="openpyxl")
        else:
            raise ParserError(
                f"Unsupported file type: {ext}. Expected .csv, .xlsx, or .xls"
            )
    except ParserError:
        raise
    except Exception as e:
        raise ParserError(f"Failed to read file: {e}")

    if df.empty:
        raise ParserError("The uploaded file contains no data rows.")

    # Clean headers: strip whitespace, fill empties with placeholders
    df.columns = [str(col).strip() for col in df.columns]
    df.columns = [
        col if col and not str(col).startswith("Unnamed:") else f"Unnamed_{i}" for i, col in enumerate(df.columns)
    ]

    # Check if header row contains any recognizable keywords.
    from .normalizer import COLUMN_MAP, _fuzzy_match_column
    has_recognized_header = any(_fuzzy_match_column(c) in COLUMN_MAP for c in df.columns)

    if all(str(c).startswith("Unnamed_") for c in df.columns) or not has_recognized_header:
        df = _find_header_row(file_bytes, ext)

    return df, df.columns.tolist()


def _find_header_row(file_bytes: bytes, ext: str) -> pd.DataFrame:
    """
    Scan the first 10 rows of the file to find the one that looks most like a
    header (i.e., contains the most recognized keywords like 'name', 'roll', etc.)

    Uses the csv module to read all rows (handles inconsistent column counts
    by padding shorter rows), then scans for the header row.
    """
    try:
        text = file_bytes.decode("utf-8")
    except UnicodeDecodeError:
        text = file_bytes.decode("latin-1")

    rows = list(csv_mod.reader(io.StringIO(text)))
    if not rows:
        raise ParserError("The file contains no data rows.")

    # Pad shorter rows to the max column count
    max_cols = max(len(r) for r in rows)
    padded = [r + [None] * (max_cols - len(r)) for r in rows]
    raw_df = pd.DataFrame(padded, columns=[f"Unnamed_{i}" for i in range(max_cols)])

    # Scan the first 10 rows to find the one that looks most like a header
    best_header_idx = 0
    best_score = 0
    max_scan = min(10, len(raw_df))

    for idx in range(max_scan):
        row_values = {
            str(v).strip().lower() for v in raw_df.iloc[idx].values if str(v).strip()
        }
        score = sum(1 for v in row_values if any(kw in v for kw in _HEADER_KEYWORDS))
        if score > best_score:
            best_score = score
            best_header_idx = idx

    if best_score == 0:
        raise ParserError(
            "Could not detect column headers. Ensure the file has columns like "
            "'Name', 'Roll Number', 'Email', 'Branch', 'CGPA'."
        )

    # Use the detected header row and take all rows after it as data
    header_row = raw_df.iloc[best_header_idx].tolist()
    data_df = raw_df.iloc[best_header_idx + 1 :].copy()
    data_df.columns = [
        str(c).strip() if str(c).strip() else f"Unnamed_{i}"
        for i, c in enumerate(header_row)
    ]
    data_df.reset_index(drop=True, inplace=True)

    return data_df
