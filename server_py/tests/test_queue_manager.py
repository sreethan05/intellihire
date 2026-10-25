"""Tests for app.queue_manager (background grading pipeline).

``BackgroundGradingQueue`` is instantiated with its loop-dependent
``init_queue`` neutralised, then driven through the local-queue paths. The
``grade_attempt`` pipeline is exercised end to end with the db builder mocked
and Judge0 / plagiarism / email side effects patched out.
"""
import asyncio
import json

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.queue_manager import (
    BackgroundGradingQueue,
    send_result_published_email,
)
from tests.db_mocks import query, sequence_db


def make_queue(**attrs):
    """Build a queue instance without touching Redis or the event loop."""
    with patch.object(BackgroundGradingQueue, "init_queue", new=AsyncMock()):
        queue = BackgroundGradingQueue()
    for key, value in attrs.items():
        setattr(queue, key, value)
    return queue


# ---------------------------------------------------------------------------
# result emails
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_result_published_email_formats_status():
    sender = AsyncMock(return_value=True)
    with patch("app.utils.send_email_async", sender):
        sent = await send_result_published_email(
            "a@x.com", "Asha", "Qualifier", 75, 100, True, "http://app"
        )
    assert sent is True
    to, subject, body = sender.call_args[0]
    assert to == "a@x.com"
    assert subject == "Exam Result Published - Qualifier"
    assert "Score: 75/100" in body
    assert "Status: PASSED" in body


# ---------------------------------------------------------------------------
# push / persistence
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_redis_grading_worker_requeues_with_incremented_retry():
    queue = make_queue(redis_client=MagicMock(), max_retries=3)
    queue.grade_attempt = AsyncMock(side_effect=RuntimeError("judge0 down"))
    queue.redis_client.lpop.side_effect = [
        json.dumps({"attemptId": "a1", "retries": 0}),
        asyncio.CancelledError(),  # break the polling loop
    ]
    with pytest.raises(asyncio.CancelledError):
        await queue.redis_grading_worker()

    queue.redis_client.rpush.assert_called_once()
    queue_name, payload = queue.redis_client.rpush.call_args[0]
    assert queue_name == "grading-queue"
    assert json.loads(payload) == {"attemptId": "a1", "retries": 1}


@pytest.mark.asyncio
async def test_redis_grading_worker_routes_exhausted_jobs_to_dlq():
    queue = make_queue(redis_client=MagicMock(), max_retries=3)
    queue.grade_attempt = AsyncMock(side_effect=RuntimeError("fatal"))
    queue.redis_client.lpop.side_effect = [
        json.dumps({"attemptId": "a1", "retries": 3}),
        asyncio.CancelledError(),
    ]
    with pytest.raises(asyncio.CancelledError):
        await queue.redis_grading_worker()

    queue_name, payload = queue.redis_client.rpush.call_args[0]
    assert queue_name == "grading-dlq"
    dlq = json.loads(payload)
    assert dlq["attemptId"] == "a1"
    assert dlq["error"] == "fatal"


def test_push_prefers_redis_and_falls_back_to_local():
    queue = make_queue()
    queue.redis_client = MagicMock()
    with patch("app.queue_manager.asyncio.create_task") as create_task:
        queue.push("a1")
    queue.redis_client.rpush.assert_called_once()
    assert queue.local_queue == []
    create_task.assert_not_called()

    queue.redis_client.rpush.side_effect = RuntimeError("redis down")
    with patch("app.queue_manager.asyncio.create_task") as create_task:
        queue.push("a2")           # falls back to the local queue
        queue.is_local_processing = True  # worker already draining
        queue.push("a2")           # duplicate is ignored
        queue.push("")
    assert queue.local_queue == ["a2"]
    # one task to persist the queue, one to start the worker
    assert create_task.call_count == 2
    for call in create_task.call_args_list:
        call.args[0].close()


@pytest.mark.asyncio
async def test_local_queue_round_trips_through_disk(tmp_path):
    with patch("app.queue_manager.storage_root", str(tmp_path)):
        queue = make_queue()
    assert queue.queue_file_path == str(tmp_path / "grading_queue.json")

    await queue.save_local_queue()
    assert json.loads((tmp_path / "grading_queue.json").read_text()) == []

    (tmp_path / "grading_queue.json").write_text(json.dumps(["a1", "a2"]))
    queue.process_local_queue = AsyncMock()
    await queue.init_local_queue()
    assert queue.local_queue == ["a1", "a2"]

    # Corrupted files are ignored, not raised.
    (tmp_path / "grading_queue.json").write_text("{not json")
    queue.local_queue = []
    await queue.init_local_queue()
    assert queue.local_queue == []


@pytest.mark.asyncio
async def test_process_local_queue_retries_then_succeeds():
    queue = make_queue(local_queue=["a1"])
    queue.save_local_queue = AsyncMock()
    queue.grade_attempt = AsyncMock(side_effect=[RuntimeError("judge0 down"), None])

    await queue.process_local_queue()

    assert queue.local_queue == []          # completed item not re-queued
    assert queue.local_retries == {}        # retry counter cleared on success
    assert queue.grade_attempt.await_count == 2
    assert queue.is_local_processing is False


@pytest.mark.asyncio
async def test_process_local_queue_drops_exhausted_attempts():
    queue = make_queue(local_queue=["bad"], max_retries=1)
    queue.save_local_queue = AsyncMock()
    queue.grade_attempt = AsyncMock(side_effect=RuntimeError("always fails"))

    await queue.process_local_queue()

    assert queue.local_queue == []
    assert queue.grade_attempt.await_count == 2  # initial + one retry


@pytest.mark.asyncio
async def test_push_interview_evaluation_runs_inline_without_redis():
    queue = make_queue(redis_client=None)
    evaluator = AsyncMock()
    with patch("app.interview_service.evaluate_interview", evaluator):
        queue.push_interview_evaluation("i1")
        await asyncio.sleep(0)
    evaluator.assert_awaited_once_with("i1")

    queue.redis_client = MagicMock()
    with patch("app.interview_service.evaluate_interview", evaluator) as _:
        queue.push_interview_evaluation("i2")
        await asyncio.sleep(0)
    queue.redis_client.rpush.assert_called_once()
    assert evaluator.await_count == 1  # redis path does not evaluate inline


# ---------------------------------------------------------------------------
# grade_attempt
# ---------------------------------------------------------------------------

SUBMISSIONS = [
    {"id": "s1", "status": "tested", "score": 10, "code": "print(1)"},                      # skip graded
    {"id": "s2", "status": "pending", "score": 0, "code": "   "},                           # skip empty
    {"id": "s3", "status": "pending", "score": 0, "code": "x", "coding_questions": None},   # skip orphan
    {"id": "s4", "status": "pending", "score": 0, "code": "x",
     "coding_questions": {"id": "q2", "marks": 10, "test_cases": []}},                      # full marks
    {"id": "s5", "status": "pending", "score": 0, "code": "y",
     "coding_questions": {"id": "q3", "marks": 10, "test_cases": [
         {"input": "1", "expected_output": "1"},
         {"input": "2", "expected_output": "3"},
     ]}},                                                                                   # 1 of 2 passes
    {"id": "s6", "status": "pending", "score": 0, "code": "z",
     "coding_questions": {"id": "q4", "marks": 8, "test_cases": "{broken"}},                 # malformed -> full marks
]


def _grading_chains(passed=True):
    return [
        query(data={"id": "a1", "exam_id": "e1", "candidate_id": "u1"}),        # attempt
        query(data=SUBMISSIONS),                                                # submissions
        query(data=[{"id": "s4"}]),                                             # s4 update
        query(data=[{"id": "s5"}]),                                             # s5 update
        query(data=[{"id": "s6"}]),                                             # s6 update
        query(data=[{"marks_obtained": 50}]),                                   # answers
        query(data=[{"score": 5}]),                                             # updated submissions
        query(data={"id": "a1", "exam_id": "e1", "candidate_id": "u1"}),        # finalize
        query(data={"pass_marks": 40 if passed else 90, "title": "Qualifier", "total_marks": 100}),
        query(data={"name": "Asha", "email": "a@x.com"}),
        query(data={"job_id": "j1", "assigned_by": "rec-1"}),                   # exam assignment
        query(data=[{"id": "cs-1"}]),                                           # candidate_status upsert
        query(data=None),                                                       # existing interview?
        query(data=[{"id": "i1"}]),                                             # interview insert
        query(data=[{"id": "n1"}]),                                             # recruiter notification
    ]


@pytest.mark.asyncio
async def test_grade_attempt_scores_submissions_and_finalizes():
    chains = _grading_chains(passed=True)
    judge0 = AsyncMock(side_effect=[{"stdout": "1\n"}, {"stdout": "nope"}])
    plagiarism = AsyncMock()
    email = AsyncMock()
    shortlist_stage = AsyncMock()

    from app.queue_manager import BackgroundGradingQueue as QueueClass
    queue = make_queue()
    with patch("app.queue_manager.db", sequence_db(*chains)), \
         patch("app.compiler.run_with_judge0", judge0), \
         patch("app.plagiarism.run_plagiarism_check", plagiarism), \
         patch("app.queue_manager.send_result_published_email", email), \
         patch("app.queue_manager.record_pipeline_stage", shortlist_stage):
        await queue.grade_attempt("a1")
        await asyncio.sleep(0.05)  # run the fire-and-forget email task

    # s4 gets full marks, s5 scores 1/2, s6 keeps marks after malformed test cases.
    assert chains[2].update.call_args[0][0] == {"score": 10, "status": "tested"}
    assert chains[3].update.call_args[0][0] == {"score": 5, "status": "tested"}
    assert chains[4].update.call_args[0][0] == {"score": 8, "status": "tested"}
    assert judge0.await_count == 2

    finalized = chains[7].update.call_args[0][0]
    assert finalized["score"] == 55  # 50 MCQ + 5 coding
    assert finalized["status"] == "completed"

    shortlist = chains[11].upsert.call_args[0][0]
    assert shortlist["status"] == "shortlisted"
    assert chains[13].insert.call_args[0][0]["status"] == "pending"   # AI interview
    assert chains[14].insert.call_args[0][0]["user_id"] == "rec-1"    # recruiter ping
    shortlist_stage.assert_awaited_once()
    plagiarism.assert_awaited_once_with("a1")
    email.assert_awaited_once()
    assert email.call_args[0][3] == 55    # total score
    assert email.call_args[0][5] is True  # passed flag


@pytest.mark.asyncio
async def test_grade_attempt_below_cutoff_skips_shortlisting():
    attempt = {"id": "a1", "exam_id": "e1", "candidate_id": "u1"}
    chains = [
        query(data=attempt),
        query(data=[]),                       # no submissions
        query(data=[]),                       # answers
        query(data=[]),                       # coding scores
        query(data=attempt),                  # finalize
        query(data={"pass_marks": 90, "title": "Qualifier", "total_marks": 100}),
        query(data={"name": "Asha", "email": ""}),  # no email -> no notify task
    ]
    plagiarism = AsyncMock()
    queue = make_queue()
    with patch("app.queue_manager.db", sequence_db(*chains)), \
         patch("app.plagiarism.run_plagiarism_check", plagiarism):
        await queue.grade_attempt("a1")
    assert chains[4].update.call_args[0][0]["score"] == 0
    plagiarism.assert_awaited_once()


@pytest.mark.asyncio
async def test_grade_attempt_raises_on_missing_attempt_and_failed_finalize():
    queue = make_queue()
    with patch("app.queue_manager.db", sequence_db(query(data=None, error=MagicMock(message="not found")))):
        with pytest.raises(RuntimeError, match="not found"):
            await queue.grade_attempt("missing")

    chains = [
        query(data={"id": "a1", "exam_id": "e1", "candidate_id": "u1"}),
        query(data=[]),
        query(data=[]),
        query(data=[]),
    ]
    failed = query(data=None, error=MagicMock(message="write failed"))
    chains.append(failed)
    with patch("app.queue_manager.db", sequence_db(*chains)):
        with pytest.raises(RuntimeError, match="Failed to finalize"):
            await queue.grade_attempt("a1")
