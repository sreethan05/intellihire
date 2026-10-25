"""Coverage for the bulk-import ingestion pipeline and its repository layer.

Two units are exercised here:

- ``app.pipeline.ingestion`` — progress emission and the row-by-row
  ``ingest_students`` flow (create / update / conflict / failure paths) with
  fake ``db`` chains and a mocked ``bulk_import_repo``.
- ``app.repositories.bulk_import_repo`` — batch lifecycle, conflict staging /
  listing / resolution and rollback, calling the real repository functions
  against ``tests.db_mocks`` query chains.
"""
import asyncio
import datetime
import hashlib

import pytest
from unittest.mock import AsyncMock, MagicMock, call, patch

from app.db import QueryError
from app.pipeline.ingestion import _emit_progress, ingest_students
from app.repositories import bulk_import_repo
from tests.db_mocks import db_routing, query, sequence_db

INGESTION_DB = "app.pipeline.ingestion.db"
INGESTION_REPO = "app.pipeline.ingestion.bulk_import_repo"
REPO_DB = "app.repositories.bulk_import_repo.db"
REPO_LOGGER = "app.repositories.bulk_import_repo.logger"


def _student_row(**overrides):
    row = {
        "name": "Asha",
        "email": "asha@x.com",
        "roll_number": "21CS0101",
        "branch": "CSE",
        "cgpa": 8.5,
        "graduation_year": 2026,
    }
    row.update(overrides)
    return row


def _repo_mock():
    """MagicMock stand-in for the ingested module's ``bulk_import_repo``."""
    repo = MagicMock()
    repo.update_batch_stage = AsyncMock()
    repo.complete_batch = AsyncMock()
    counter = {"n": 0}

    def _next_conflict_id(*args, **kwargs):
        counter["n"] += 1
        return f"conf-{counter['n']}"

    repo.stage_conflict = AsyncMock(side_effect=_next_conflict_id)
    return repo


# ---------------------------------------------------------------------------
# app.pipeline.ingestion — _emit_progress
# ---------------------------------------------------------------------------


def test_emit_progress_skips_without_room():
    with patch("app.pipeline.ingestion.sio.emit") as emit:
        _emit_progress("", "ingesting", 3, 10)
    emit.assert_not_called()


def test_emit_progress_without_running_loop_quietly_returns():
    # A synchronous caller has no running event loop; the RuntimeError must be
    # swallowed and nothing emitted.
    with patch("app.pipeline.ingestion.sio.emit") as emit:
        _emit_progress("user:1", "ingesting", 3, 10)
    emit.assert_not_called()


@pytest.mark.asyncio
async def test_emit_progress_sends_stage_payload_with_extra():
    with patch("app.pipeline.ingestion.sio.emit", new=AsyncMock()) as emit:
        _emit_progress("user:1", "ingesting", 40, 200, {"created": 2})
        _emit_progress("user:1", "completed", 0, 0)  # total 0 -> percent 0
        await asyncio.sleep(0)

    assert emit.await_count == 2
    first = emit.await_args_list[0]
    assert first.args[0] == "bulk_import:progress"
    assert first.args[1] == {
        "stage": "ingesting",
        "current": 40,
        "total": 200,
        "percent": 20,
        "created": 2,
    }
    assert first.kwargs == {"room": "user:1"}
    assert emit.await_args_list[1].args[1]["percent"] == 0


@pytest.mark.asyncio
async def test_emit_progress_swallows_emit_failures():
    with patch("app.pipeline.ingestion.sio.emit", new=MagicMock(side_effect=ValueError("socket down"))):
        with patch("app.pipeline.ingestion.logger") as log:
            _emit_progress("user:1", "ingesting", 1, 2)
    log.warning.assert_called_once()
    assert "Failed to emit progress" in log.warning.call_args[0][0]


# ---------------------------------------------------------------------------
# app.pipeline.ingestion — ingest_students
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ingest_students_creates_users_and_profiles():
    rows = [
        _student_row(name="Asha", email="asha@x.com", roll_number="21CS0101"),
        _student_row(name="Bala", email="bala@x.com", roll_number="21CS0102", branch="ECE", cgpa=9.1),
    ]
    chains = []
    for index in range(2):
        chains += [
            query(data=[]),                       # email lookup miss
            query(data=[]),                       # roll lookup miss
            query(data={"id": f"u-{index}"}),     # user insert
            query(data=None),                     # profile maybeSingle miss
            query(data={"id": f"p-{index}"}),     # profile insert
            query(data=[]),                       # user profile_complete update
        ]
    mock_db = sequence_db(*chains)
    repo = _repo_mock()

    with patch(INGESTION_DB, mock_db), \
            patch(INGESTION_REPO, repo), \
            patch("app.pipeline.ingestion.hash_password", return_value="hashed-pw"), \
            patch("app.pipeline.ingestion._emit_progress") as emits:
        created, updated, conflict_count, conflicts = await ingest_students(
            rows, "col-1", "tpo-1", "b-1", room="")

    assert (created, updated, conflict_count, conflicts) == (2, 0, 0, [])
    assert [c.args[0] for c in mock_db.from_.call_args_list] == [
        "users", "users", "users", "candidate_profiles", "candidate_profiles", "users",
        "users", "users", "users", "candidate_profiles", "candidate_profiles", "users",
    ]
    user_payload = chains[2].insert.call_args[0][0]
    assert user_payload["name"] == "Asha"
    assert user_payload["email"] == "asha@x.com"
    assert user_payload["roll_number"] == "21CS0101"
    assert user_payload["password_hash"] == "hashed-pw"
    assert user_payload["role"] == "candidate"
    assert user_payload["college_id"] == "col-1"
    assert user_payload["created_by"] == "tpo-1"
    assert user_payload["must_change_password"] is True
    assert chains[4].insert.call_args[0][0] == {
        "user_id": "u-0",
        "college_id": "col-1",
        "roll_number": "21CS0101",
        "branch": "CSE",
        "cgpa": 8.5,
        "graduation_year": 2026,
        "phone": None,
        "profile_complete": True,
        "documents_verified": False,
    }
    chains[5].update.assert_called_once_with({
        "profile_complete": True,
        "must_change_password": True,
    })
    repo.update_batch_stage.assert_awaited_once_with("b-1", "ingesting", {"total_rows_raw": 2})
    repo.complete_batch.assert_awaited_once_with(
        batch_id="b-1", total_created=2, total_updated=0, total_conflicts=0,
        total_rows=2, total_parsed=2, status="COMPLETED",
    )
    emits.assert_not_called()  # room="" suppresses every progress emission
    repo.stage_conflict.assert_not_awaited()


@pytest.mark.asyncio
async def test_ingest_students_updates_existing_candidate_profile():
    rows = [_student_row()]
    chains = [
        query(data=[{"id": "u-1", "role": "candidate", "college_id": "col-1"}]),
        query(data={"id": "p-1"}),
        query(data=[{"id": "p-1"}]),
        query(data=[]),
    ]
    repo = _repo_mock()
    with patch(INGESTION_DB, sequence_db(*chains)), patch(INGESTION_REPO, repo):
        created, updated, conflict_count, conflicts = await ingest_students(
            rows, "col-1", "tpo-1", "b-1")

    assert (created, updated, conflict_count, conflicts) == (0, 1, 0, [])
    update_payload = chains[2].update.call_args[0][0]
    assert update_payload == {
        "user_id": "u-1",
        "college_id": "col-1",
        "roll_number": "21CS0101",
        "branch": "CSE",
        "cgpa": 8.5,
        "graduation_year": 2026,
        "phone": None,
        "profile_complete": True,
        "documents_verified": False,
    }
    chains[2].eq.assert_called_once_with("id", "p-1")
    chains[3].update.assert_called_once_with({
        "profile_complete": True,
        "must_change_password": True,
    })
    assert repo.complete_batch.await_args.kwargs["status"] == "COMPLETED"
    assert repo.complete_batch.await_args.kwargs["total_updated"] == 1


@pytest.mark.asyncio
async def test_ingest_students_matches_existing_user_by_roll_number():
    rows = [_student_row()]
    chains = [
        query(data=[]),  # email lookup miss
        query(data=[{"id": "u-9", "role": "candidate", "college_id": "col-1"}]),
        query(data=None),                 # no profile yet
        query(data={"id": "p-9"}),        # profile insert
        query(data=[]),                   # user update
    ]
    mock_db = sequence_db(*chains)
    repo = _repo_mock()
    with patch(INGESTION_DB, mock_db), patch(INGESTION_REPO, repo):
        created, updated, conflict_count, _ = await ingest_students(
            rows, "col-1", "tpo-1", "b-1")

    assert (created, updated, conflict_count) == (1, 0, 0)
    assert [c.args[0] for c in mock_db.from_.call_args_list] == [
        "users", "users", "candidate_profiles", "candidate_profiles", "users",
    ]
    chains[2].eq.assert_called_once_with("user_id", "u-9")  # existing account reused


@pytest.mark.asyncio
async def test_ingest_students_stages_conflicts_with_reasons_and_row_numbers():
    rows = [
        _student_row(email="dup@x.com"),                       # non-candidate
        _student_row(email="other@x.com", source_row=17),      # different college
        _student_row(email="fail@x.com"),                      # creation failure
    ]
    chains = [
        query(data=[{"id": "u-1", "role": "recruiter"}]),
        query(data=[{"id": "u-2", "role": "candidate", "college_id": "col-other"}]),
        query(data=[]),
        query(data=[]),
        query(data=None, error=QueryError("duplicate key")),
    ]
    repo = _repo_mock()
    with patch(INGESTION_DB, sequence_db(*chains)), \
            patch(INGESTION_REPO, repo), \
            patch("app.pipeline.ingestion.hash_password", return_value="hashed-pw"):
        created, updated, conflict_count, conflicts = await ingest_students(
            rows, "col-1", "tpo-1", "b-1")

    assert (created, updated, conflict_count) == (0, 0, 3)
    assert conflict_count == len(conflicts) == 3
    assert conflicts[0] == {
        "row": rows[0], "reason": "Existing recruiter", "conflict_id": "conf-1",
    }
    assert conflicts[1]["reason"] == "Different college"
    assert conflicts[2]["reason"] == "User creation failed"
    assert all(c["row"] is rows[index] for index, c in enumerate(conflicts))

    staged = repo.stage_conflict.await_args_list
    assert [c.kwargs["conflict_type"] for c in staged] == [
        "EXISTING_NON_CANDIDATE", "DIFFERENT_COLLEGE", "CREATION_FAILED",
    ]
    assert [c.args[2] for c in staged] == [2, 17, 4]  # default row numbers / source_row
    assert staged[2].kwargs["conflict_detail"] == "duplicate key"
    completion = repo.complete_batch.await_args.kwargs
    assert completion["status"] == "PARTIAL"
    assert completion["total_conflicts"] == 3
    assert completion["total_created"] == 0


@pytest.mark.asyncio
async def test_ingest_students_stages_profile_write_failures():
    rows = [_student_row(), _student_row(email="new@x.com", roll_number="21CS0999")]
    chains = [
        query(data=[{"id": "u-1", "role": "candidate", "college_id": "col-1"}]),
        query(data={"id": "p-1"}),
        query(data=None, error=QueryError("update boom")),
        query(data=[]),
        query(data=[]),
        query(data={"id": "u-2"}),
        query(data=None),
        query(data=None, error=QueryError("insert boom")),
    ]
    repo = _repo_mock()
    with patch(INGESTION_DB, sequence_db(*chains)), \
            patch(INGESTION_REPO, repo), \
            patch("app.pipeline.ingestion.hash_password", return_value="hashed-pw"):
        created, updated, conflict_count, conflicts = await ingest_students(
            rows, "col-1", "tpo-1", "b-1")

    assert (created, updated, conflict_count) == (0, 0, 2)
    assert conflicts[0]["reason"] == "Profile update failed"
    assert conflicts[1]["reason"] == "Profile creation failed"
    staged = repo.stage_conflict.await_args_list
    assert [c.kwargs["conflict_type"] for c in staged] == [
        "PROFILE_UPDATE_FAILED", "CREATION_FAILED",
    ]
    assert "update boom" in staged[0].kwargs["conflict_detail"]
    assert "insert boom" in staged[1].kwargs["conflict_detail"]
    assert repo.complete_batch.await_args.kwargs["status"] == "PARTIAL"


@pytest.mark.asyncio
async def test_ingest_students_wraps_unexpected_row_errors():
    row = _student_row()
    del row["branch"]  # row-level bug inside the try block
    chains = [
        query(data=[]),
        query(data=[]),
        query(data={"id": "u-1"}),
        query(data=None),
    ]
    repo = _repo_mock()
    with patch(INGESTION_DB, sequence_db(*chains)), \
            patch(INGESTION_REPO, repo), \
            patch("app.pipeline.ingestion.hash_password", return_value="hashed-pw"):
        created, updated, conflict_count, conflicts = await ingest_students(
            [row], "col-1", "tpo-1", "b-1")

    assert (created, updated, conflict_count) == (0, 0, 1)
    assert conflicts[0]["reason"] == "'branch'"
    staged = repo.stage_conflict.await_args
    assert staged.kwargs["conflict_type"] == "CREATION_FAILED"
    assert staged.kwargs["conflict_detail"] == "Unexpected error: 'branch'"


@pytest.mark.asyncio
async def test_ingest_students_emits_progress_for_long_batches():
    # Rows fail with an unexpected error, which does NOT `continue` out of the
    # loop, so the every-10 / final-row progress block is exercised. (Conflict
    # rows `continue` past that block - a quirk noted in the report.)
    rows = [_student_row(email=f"s{i}@x.com") for i in range(11)]
    for row in rows:
        del row["branch"]
    chains = []
    for index in range(11):
        chains += [
            query(data=[]),
            query(data=[]),
            query(data={"id": f"u-{index}"}),
            query(data=None),
        ]
    mock_db = sequence_db(*chains)
    repo = _repo_mock()
    with patch(INGESTION_DB, mock_db), \
            patch(INGESTION_REPO, repo), \
            patch("app.pipeline.ingestion.hash_password", return_value="hashed-pw"), \
            patch("app.pipeline.ingestion._emit_progress") as emits:
        created, updated, conflict_count, _ = await ingest_students(
            rows, "col-1", "tpo-1", "b-1", room="user:7")

    assert (created, updated, conflict_count) == (0, 0, 11)
    assert mock_db.from_.call_count == 44
    assert emits.call_args_list[0] == call("user:7", "ingesting", 0, 11)
    assert emits.call_args_list[1] == call("user:7", "ingesting", 10, 11, {
        "created": 0, "updated": 0, "conflicts": 10,
    })
    assert emits.call_args_list[2] == call("user:7", "ingesting", 11, 11, {
        "created": 0, "updated": 0, "conflicts": 11,
    })
    final = emits.call_args_list[3]
    assert final.args[:4] == ("user:7", "completed", 11, 11)
    assert final.args[4]["created"] == 0
    assert final.args[4]["conflicts"] == 11
    assert isinstance(final.args[4]["elapsed_seconds"], float)
    completion = repo.complete_batch.await_args.kwargs
    assert completion["status"] == "PARTIAL"
    assert completion["total_rows"] == 11


@pytest.mark.asyncio
async def test_ingest_students_empty_batch_completes_with_zeros():
    repo = _repo_mock()
    with patch(INGESTION_DB, sequence_db()), \
            patch(INGESTION_REPO, repo), \
            patch("app.pipeline.ingestion._emit_progress") as emits:
        result = await ingest_students([], "col-1", "tpo-1", "b-1", room="user:7")

    assert result == (0, 0, 0, [])
    repo.complete_batch.assert_awaited_once_with(
        batch_id="b-1", total_created=0, total_updated=0, total_conflicts=0,
        total_rows=0, total_parsed=0, status="COMPLETED",
    )
    emits.assert_any_call("user:7", "ingesting", 0, 0)
    assert emits.call_args_list[-1].args[:4] == ("user:7", "completed", 0, 0)


# ---------------------------------------------------------------------------
# app.repositories.bulk_import_repo — batch operations
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_batch_rejects_known_file_hash():
    chain = query(data={"id": "batch-old", "upload_status": "COMPLETED"})
    mock_db = db_routing({"bulk_import_batches": chain})
    file_bytes = b"name,roll\nAsha,21CS0101\n"

    with patch(REPO_DB, mock_db):
        with pytest.raises(ValueError) as exc:
            await bulk_import_repo.create_batch("col-1", "tpo-1", "students.csv", file_bytes)

    digest = hashlib.sha256(file_bytes).hexdigest()
    assert "batch-old" in str(exc.value)
    mock_db.from_.assert_called_once_with("bulk_import_batches")
    chain.eq.assert_called_once_with("file_hash_sha256", digest)
    chain.in_.assert_called_once_with("upload_status", ["COMPLETED", "PARTIAL", "PROCESSING"])
    chain.insert.assert_not_called()


@pytest.mark.asyncio
async def test_create_batch_inserts_row_and_returns_id_and_hash():
    existing = query(data=None)
    inserted = query(data={"id": "batch-1"})
    file_bytes = b"payload-bytes"

    with patch(REPO_DB, sequence_db(existing, inserted)):
        batch_id, file_hash = await bulk_import_repo.create_batch(
            "col-1", "tpo-1", "roster.csv", file_bytes)

    assert batch_id == "batch-1"
    assert file_hash == hashlib.sha256(file_bytes).hexdigest()
    payload = inserted.insert.call_args[0][0]
    assert payload["college_id"] == "col-1"
    assert payload["uploaded_by"] == "tpo-1"
    assert payload["original_filename"] == "roster.csv"
    assert payload["file_hash_sha256"] == file_hash
    assert payload["file_size_bytes"] == len(file_bytes)
    assert payload["upload_status"] == "PROCESSING"
    assert payload["current_stage"] == "uploading"
    started = datetime.datetime.fromisoformat(payload["processing_started_at"])
    assert started.tzinfo is not None  # _now_iso() is timezone-aware
    inserted.select.assert_called_once_with()
    assert inserted.single.called


@pytest.mark.asyncio
async def test_create_batch_raises_on_insert_failure():
    with patch(REPO_DB, sequence_db(query(data=None), query(error=QueryError("duplicate key")))):
        with pytest.raises(RuntimeError) as exc:
            await bulk_import_repo.create_batch("col-1", "tpo-1", "r.csv", b"x")
    assert "duplicate key" in str(exc.value)

    # Neither error nor row -> the generic "unknown" message.
    with patch(REPO_DB, sequence_db(query(data=None), query(data=None))):
        with pytest.raises(RuntimeError) as exc:
            await bulk_import_repo.create_batch("col-1", "tpo-1", "r.csv", b"x")
    assert "unknown" in str(exc.value)


@pytest.mark.asyncio
async def test_update_batch_stage_merges_extra_fields():
    chain = query(data=[])
    with patch(REPO_DB, db_routing({"bulk_import_batches": chain})):
        await bulk_import_repo.update_batch_stage("b-1", "parsing", {"total_rows_raw": 12})
        await bulk_import_repo.update_batch_stage("b-1", "ingesting")

    assert chain.update.call_args_list[0][0][0] == {"current_stage": "parsing", "total_rows_raw": 12}
    assert chain.update.call_args_list[1][0][0] == {"current_stage": "ingesting"}
    assert chain.eq.call_args_list[-1] == call("id", "b-1")


@pytest.mark.asyncio
async def test_complete_batch_completed_and_failed_variants():
    chain = query(data=[])
    with patch(REPO_DB, db_routing({"bulk_import_batches": chain})):
        await bulk_import_repo.complete_batch(
            batch_id="b-1", total_created=3, total_updated=1, total_conflicts=2,
            total_rows=9, total_parsed=8,
        )
        await bulk_import_repo.complete_batch(
            batch_id="b-2", total_created=0, total_updated=0, total_conflicts=9,
            total_rows=9, total_parsed=9, status="FAILED", error_message="boom",
        )

    done = chain.update.call_args_list[0][0][0]
    assert done["upload_status"] == "COMPLETED"
    assert done["current_stage"] == "completed"
    assert (done["total_created"], done["total_updated"], done["total_conflicts"]) == (3, 1, 2)
    assert (done["total_rows_raw"], done["total_records_parsed"]) == (9, 8)
    assert "error_message" not in done
    assert datetime.datetime.fromisoformat(done["processing_completed_at"]).tzinfo is not None

    failed = chain.update.call_args_list[1][0][0]
    assert failed["upload_status"] == "FAILED"
    assert failed["current_stage"] == "failed"
    assert failed["error_message"] == "boom"


@pytest.mark.asyncio
async def test_fail_batch_and_get_batch_paths():
    chain = query(data=[])
    with patch(REPO_DB, db_routing({"bulk_import_batches": chain})):
        await bulk_import_repo.fail_batch("b-9", "parser exploded")
    payload = chain.update.call_args[0][0]
    assert payload["upload_status"] == "FAILED"
    assert payload["current_stage"] == "failed"
    assert payload["error_message"] == "parser exploded"
    chain.eq.assert_called_once_with("id", "b-9")

    chain = query(data={"id": "b-1"})
    with patch(REPO_DB, db_routing({"bulk_import_batches": chain})):
        assert await bulk_import_repo.get_batch("b-1") == {"id": "b-1"}
    chain.maybeSingle.assert_called_once()

    with patch(REPO_DB, db_routing({"bulk_import_batches": query(data=None)})):
        assert await bulk_import_repo.get_batch("missing") is None


@pytest.mark.asyncio
async def test_list_batches_paginates_and_counts():
    items = query(data=[{"id": "b-1"}])
    count = query(data=None, count=21)
    with patch(REPO_DB, sequence_db(items, count)):
        result = await bulk_import_repo.list_batches("col-1", page=3, limit=10)

    assert result == {"items": [{"id": "b-1"}], "total": 21, "page": 3, "limit": 10}
    items.eq.assert_called_once_with("college_id", "col-1")
    items.order.assert_called_once_with("created_at", False)
    items.range.assert_called_once_with(20, 29)
    count.select.assert_called_once_with("id", count="exact", head=True)

    items = query(data=None)
    count = query(data=None, count=None)
    with patch(REPO_DB, sequence_db(items, count)):
        result = await bulk_import_repo.list_batches("col-1")
    assert result["items"] == []
    assert result["total"] == 0
    assert result["page"] == 1


# ---------------------------------------------------------------------------
# app.repositories.bulk_import_repo — conflicts
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stage_conflict_payload_and_failure_path():
    record = {"roll_number": "21CS01", "email": "a@x.com", "name": "Asha"}
    chain = query(data={"id": "conf-1"})
    with patch(REPO_DB, db_routing({"bulk_import_conflicts": chain})):
        conflict_id = await bulk_import_repo.stage_conflict(
            "b-1", "col-1", 5, record,
            conflict_type="EXISTING_NON_CANDIDATE", conflict_detail="already registered",
        )

    assert conflict_id == "conf-1"
    payload = chain.insert.call_args[0][0]
    assert payload["batch_id"] == "b-1"
    assert payload["college_id"] == "col-1"
    assert payload["row_number"] == 5
    assert payload["raw_data"] is record
    assert payload["conflict_type"] == "EXISTING_NON_CANDIDATE"
    assert payload["resolution_status"] == "PENDING"
    chain.select.assert_called_once_with()
    assert chain.single.called

    failing = query(data=None, error=QueryError("insert failed"))
    with patch(REPO_DB, db_routing({"bulk_import_conflicts": failing})):
        with patch(REPO_LOGGER) as log:
            assert await bulk_import_repo.stage_conflict(
                "b-1", "col-1", 6, record,
                conflict_type="CREATION_FAILED", conflict_detail="x",
            ) is None
    log.error.assert_called_once()


@pytest.mark.asyncio
async def test_list_conflicts_filters_and_counts():
    items = query(data=[{"id": "conf-1"}])
    count = query(data=None, count=4)
    with patch(REPO_DB, sequence_db(items, count)):
        result = await bulk_import_repo.list_conflicts(
            "b-1", resolution_status="PENDING", page=2, limit=2)

    assert result == {"items": [{"id": "conf-1"}], "total": 4, "page": 2, "limit": 2}
    assert items.eq.call_args_list == [call("batch_id", "b-1"), call("resolution_status", "PENDING")]
    items.order.assert_called_once_with("row_number", True)
    items.range.assert_called_once_with(2, 3)
    assert count.eq.call_args_list == [call("batch_id", "b-1"), call("resolution_status", "PENDING")]

    items = query(data=None)
    count = query(data=None, count=None)
    with patch(REPO_DB, sequence_db(items, count)):
        result = await bulk_import_repo.list_conflicts("b-1")
    assert result["items"] == []
    assert result["total"] == 0
    items.eq.assert_called_once_with("batch_id", "b-1")


@pytest.mark.asyncio
async def test_resolve_conflict_validation_errors():
    with patch(REPO_DB, db_routing({"bulk_import_conflicts": query(data=None)})):
        with pytest.raises(ValueError, match="not found"):
            await bulk_import_repo.resolve_conflict("c-1", "ACCEPT", "tpo-1", "col-1", "tpo-1")

    resolved = query(data={"resolution_status": "ACCEPTED", "college_id": "col-1"})
    with patch(REPO_DB, db_routing({"bulk_import_conflicts": resolved})):
        with pytest.raises(ValueError, match="already resolved"):
            await bulk_import_repo.resolve_conflict("c-1", "ACCEPT", "tpo-1", "col-1", "tpo-1")

    foreign = query(data={"resolution_status": "PENDING", "college_id": "col-2"})
    with patch(REPO_DB, db_routing({"bulk_import_conflicts": foreign})):
        with pytest.raises(ValueError, match="does not belong"):
            await bulk_import_repo.resolve_conflict("c-1", "ACCEPT", "tpo-1", "col-1", "tpo-1")

    pending = query(data={"resolution_status": "PENDING", "college_id": "col-1", "raw_data": {}})
    with patch(REPO_DB, db_routing({"bulk_import_conflicts": pending})):
        with pytest.raises(ValueError, match="must be"):
            await bulk_import_repo.resolve_conflict("c-1", "MAYBE", "tpo-1", "col-1", "tpo-1")


@pytest.mark.asyncio
async def test_resolve_conflict_reject_updates_row():
    conflict = query(data={"resolution_status": "PENDING", "college_id": "col-1", "raw_data": {}})
    update = query(data=[])
    with patch(REPO_DB, sequence_db(conflict, update)):
        result = await bulk_import_repo.resolve_conflict(
            "c-1", "REJECT", "tpo-1", "col-1", "tpo-1")

    assert result == {"status": "REJECTED"}
    payload = update.update.call_args[0][0]
    assert payload["resolution_status"] == "REJECTED"
    assert payload["resolved_by"] == "tpo-1"
    assert datetime.datetime.fromisoformat(payload["resolved_at"]).tzinfo is not None
    update.eq.assert_called_once_with("id", "c-1")


@pytest.mark.asyncio
async def test_resolve_conflict_accept_creates_user_profile_and_marks_conflict():
    record = {"roll_number": "21CS0101", "email": "a@x.com", "name": "Asha"}
    conflict = query(data={
        "id": "c-1", "resolution_status": "PENDING", "college_id": "col-1", "raw_data": record,
    })
    email_lookup = query(data=[])
    user_insert = query(data={"id": "u-new"})
    profile_insert = query(data={"id": "p-new"})
    user_update = query(data=[])
    conflict_update = query(data=[])
    mock_db = sequence_db(conflict, email_lookup, user_insert, profile_insert, user_update, conflict_update)

    with patch(REPO_DB, mock_db):
        with patch("app.utils.hash_password", return_value="hashed-pw"):
            result = await bulk_import_repo.resolve_conflict(
                "c-1", "ACCEPT", "tpo-1", "col-1", "tpo-1")

    assert result == {"status": "ACCEPTED", "user_id": "u-new"}
    assert [c.args[0] for c in mock_db.from_.call_args_list] == [
        "bulk_import_conflicts", "users", "users", "candidate_profiles", "users",
        "bulk_import_conflicts",
    ]
    user_payload = user_insert.insert.call_args[0][0]
    assert user_payload["password_hash"] == "hashed-pw"
    assert user_payload["role"] == "candidate"
    assert user_payload["must_change_password"] is True
    profile_payload = profile_insert.insert.call_args[0][0]
    assert profile_payload["branch"] == "Unknown"  # raw_data fallback
    assert profile_payload["cgpa"] == 0.0
    assert profile_payload["profile_complete"] is True
    final_update = conflict_update.update.call_args[0][0]
    assert final_update["resolution_status"] == "ACCEPTED"
    assert final_update["created_user_id"] == "u-new"
    assert final_update["created_profile_id"] == "p-new"


@pytest.mark.asyncio
async def test_resolve_conflict_accept_reuses_existing_user():
    conflict = query(data={
        "resolution_status": "PENDING", "college_id": "col-1",
        "raw_data": {
            "roll_number": "21CS9", "email": "e@x.com", "name": "E",
            "branch": "ECE", "cgpa": 9.0, "graduation_year": 2025,
        },
    })
    email_lookup = query(data=[{"id": "u-existing"}])
    profile_insert = query(data={"id": "p-2"})
    user_update = query(data=[])
    conflict_update = query(data=[])
    mock_db = sequence_db(conflict, email_lookup, profile_insert, user_update, conflict_update)

    with patch(REPO_DB, mock_db):
        with patch("app.utils.hash_password", return_value="hashed-pw"):
            result = await bulk_import_repo.resolve_conflict(
                "c-1", "ACCEPT", "tpo-1", "col-1", "tpo-1")

    assert result == {"status": "ACCEPTED", "user_id": "u-existing"}
    assert [c.args[0] for c in mock_db.from_.call_args_list] == [
        "bulk_import_conflicts", "users", "candidate_profiles", "users",
        "bulk_import_conflicts",
    ]
    assert email_lookup.insert.call_count == 0
    profile_payload = profile_insert.insert.call_args[0][0]
    assert profile_payload["user_id"] == "u-existing"
    assert profile_payload["branch"] == "ECE"
    assert profile_payload["cgpa"] == 9.0


@pytest.mark.asyncio
async def test_resolve_conflict_accept_write_failures_raise():
    base = {
        "resolution_status": "PENDING", "college_id": "col-1",
        "raw_data": {"roll_number": "21CS01", "email": "a@x.com", "name": "Asha"},
    }

    user_insert_fails = sequence_db(
        query(data=dict(base)),
        query(data=[]),
        query(data=None, error=QueryError("dup key")),
    )
    with patch(REPO_DB, user_insert_fails):
        with patch("app.utils.hash_password", return_value="hashed-pw"):
            with pytest.raises(RuntimeError, match="Failed to create user"):
                await bulk_import_repo.resolve_conflict("c-1", "ACCEPT", "tpo-1", "col-1", "tpo-1")

    profile_insert_fails = sequence_db(
        query(data=dict(base)),
        query(data=[{"id": "u-1"}]),
        query(data=None, error=QueryError("bad profile")),
    )
    with patch(REPO_DB, profile_insert_fails):
        with patch("app.utils.hash_password", return_value="hashed-pw"):
            with pytest.raises(RuntimeError, match="Failed to create profile"):
                await bulk_import_repo.resolve_conflict("c-1", "ACCEPT", "tpo-1", "col-1", "tpo-1")


# ---------------------------------------------------------------------------
# app.repositories.bulk_import_repo — rollback
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_rollback_batch_validation_errors():
    with patch(REPO_DB, db_routing({"bulk_import_batches": query(data=None)})):
        with pytest.raises(ValueError, match="not found"):
            await bulk_import_repo.rollback_batch("missing", "tpo-1")

    rolled = query(data={"upload_status": "ROLLED_BACK"})
    with patch(REPO_DB, db_routing({"bulk_import_batches": rolled})):
        with pytest.raises(ValueError, match="already rolled back"):
            await bulk_import_repo.rollback_batch("b-1", "tpo-1")


@pytest.mark.asyncio
async def test_rollback_batch_deletes_creations_and_skips_pending():
    started = "2026-01-01T10:00:00+00:00"
    batch = query(data={
        "id": "b-1", "college_id": "col-1", "uploaded_by": "tpo-1",
        "upload_status": "COMPLETED", "processing_started_at": started,
    })
    accepted = query(data=[
        {"id": "c-1", "created_profile_id": "p-0", "created_user_id": None},
        {"id": "c-2", "created_profile_id": None, "created_user_id": "u-2"},
    ])
    delete_profile_0 = query(data=[])
    lookup_user_2 = query(data={"last_login": None})
    delete_user_2 = query(data=[])
    profile_select = query(data=[{"id": "p-1", "user_id": "u-1"}])
    lookup_user_1 = query(data={"id": "u-1", "last_login": None, "created_by": "tpo-1"})
    delete_profile_1 = query(data=[])
    delete_user_1 = query(data=[])
    pending = query(data=[{"id": "cp-1"}])
    skip_conflict = query(data=[])
    batch_update = query(data=[])
    mock_db = sequence_db(
        batch, accepted, delete_profile_0, lookup_user_2, delete_user_2,
        profile_select, lookup_user_1, delete_profile_1, delete_user_1,
        pending, skip_conflict, batch_update,
    )

    with patch(REPO_DB, mock_db):
        result = await bulk_import_repo.rollback_batch("b-1", "tpo-1")

    assert result == {"users_deleted": 2, "profiles_deleted": 2, "conflicts_skipped": 1}
    assert mock_db.from_.call_count == 12
    profile_select.gte.assert_called_once_with("created_at", started)
    skip_payload = skip_conflict.update.call_args[0][0]
    assert skip_payload["resolution_status"] == "SKIPPED"
    assert skip_payload["resolved_by"] == "tpo-1"
    batch_payload = batch_update.update.call_args[0][0]
    assert batch_payload["upload_status"] == "ROLLED_BACK"
    assert batch_payload["current_stage"] == "rolled_back"


@pytest.mark.asyncio
async def test_rollback_batch_without_processing_start_returns_zeros():
    batch = query(data={
        "id": "b-2", "college_id": "col-1", "uploaded_by": "tpo-1",
        "upload_status": "PARTIAL",
    })
    mock_db = sequence_db(batch, query(data=[]), query(data=[]), query(data=[]))
    with patch(REPO_DB, mock_db):
        result = await bulk_import_repo.rollback_batch("b-2", "tpo-1")

    assert result == {"users_deleted": 0, "profiles_deleted": 0, "conflicts_skipped": 0}
    assert mock_db.from_.call_count == 4
