"""DB boundary normalization tests.

psycopg returns ``uuid`` columns as ``uuid.UUID`` objects while JWT identities
are plain strings. Before normalization, checks such as
``attempt["candidate_id"] != user["id"]`` were always true, so candidates got
403s on their own attempts (an exam could never be submitted). These tests pin
the boundary behaviour that prevents the whole bug class.
"""
from uuid import uuid4

from app.db import DBBuilder, normalize_row_values, parse_select


def test_normalize_row_values_stringifies_uuid_values():
    uid = uuid4()
    out = normalize_row_values({
        "id": uid,
        "candidate_id": uid,
        "name": "Asha",
        "score": 7,
        "optional": None,
    })
    assert out["id"] == str(uid)
    assert isinstance(out["id"], str)
    assert out["candidate_id"] == str(uid)
    # Non-UUID values are untouched.
    assert out["name"] == "Asha"
    assert out["score"] == 7
    assert out["optional"] is None


def test_project_row_normalizes_select_star():
    uid = uuid4()
    builder = DBBuilder("attempts")
    parsed = parse_select("*", "attempts")
    row = builder._project_row({"id": uid, "candidate_id": uid, "status": "in_progress"}, parsed)
    assert row == {"id": str(uid), "candidate_id": str(uid), "status": "in_progress"}


def test_project_row_normalizes_projected_columns():
    uid = uuid4()
    builder = DBBuilder("attempts")
    parsed = parse_select("id, candidate_id", "attempts")
    row = builder._project_row({"id": uid, "candidate_id": uid}, parsed)
    assert row["id"] == str(uid)
    assert row["candidate_id"] == str(uid)


def test_string_identity_matches_normalized_rows():
    """The exact regression: a JWT-style string id must equal the row value."""
    uid = uuid4()
    jwt_like_id = str(uid)
    row = normalize_row_values({"candidate_id": uid})
    assert row["candidate_id"] == jwt_like_id
