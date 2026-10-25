"""Repository for drive (job posting) data access that requires raw SQL.

The eligibility query uses PostgreSQL array containment (``IN %s`` with tuple
parameters), which the fluent query builder does not express, so it stays on
psycopg — but it lives in the repository layer instead of the router.
"""
from typing import Any

from psycopg.rows import dict_row

from ..db import get_connection
from ..utils import deserialize_drive_colleges


def get_drive_college_ids(drive: Any) -> list:
    if drive.get("company_description"):
        parsed = deserialize_drive_colleges(drive["company_description"])
        if parsed["college_ids"]:
            return parsed["college_ids"]
    return [drive["college_id"]] if drive.get("college_id") else []


async def find_eligible_candidates(drive: Any) -> list:
    branches = drive.get("allowed_branches") or []
    college_ids = get_drive_college_ids(drive)
    if not college_ids:
        return []

    query = """
        SELECT cp.*, u.id as user_id, u.name, u.email, u.roll_number, u.profile_complete
        FROM candidate_profiles cp
        JOIN users u ON u.id = cp.user_id
        WHERE cp.college_id IN %s AND cp.cgpa >= %s
    """
    params = [tuple(college_ids), float(drive.get("min_cgpa") or 0.0)]

    if branches:
        query += " AND cp.branch IN %s"
        params.append(tuple(branches))

    query += " ORDER BY cp.cgpa DESC"

    with get_connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query, params)
            rows = cur.fetchall()
            return [dict(r) for r in rows]
