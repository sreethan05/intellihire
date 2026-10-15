import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.queue_manager import gradingQueue

def test_grading_queue_push_redis():
    mock_redis = MagicMock()
    
    with patch.object(gradingQueue, "redis_client", mock_redis):
        gradingQueue.push("attempt_123")
        mock_redis.rpush.assert_called_once()
        args, kwargs = mock_redis.rpush.call_args
        assert args[0] == "grading-queue"
        assert "attempt_123" in args[1]

def test_grading_queue_push_local():
    with patch.object(gradingQueue, "redis_client", None):
        with patch.object(gradingQueue, "local_queue", []) as mock_local:
            with patch.object(gradingQueue, "save_local_queue", new_callable=MagicMock) as mock_save:
                with patch.object(gradingQueue, "process_local_queue", new_callable=MagicMock) as mock_process:
                    with patch("app.queue_manager.asyncio.create_task") as mock_task:
                        gradingQueue.push("attempt_456")
                        assert "attempt_456" in mock_local
                        mock_save.assert_called_once()

def test_grading_queue_push_interview_evaluation_redis():
    mock_redis = MagicMock()
    
    with patch.object(gradingQueue, "redis_client", mock_redis):
        gradingQueue.push_interview_evaluation("iv_123")
        mock_redis.rpush.assert_called_once()
        args, kwargs = mock_redis.rpush.call_args
        # Correct queue name is "interview-queue"
        assert args[0] == "interview-queue"
        assert "iv_123" in args[1]


@pytest.mark.asyncio
async def test_process_local_queue_retry_and_dlq():
    # If grade_attempt raises, item is re-queued with incremented retry count until max_retries
    with patch.object(gradingQueue, "grade_attempt", side_effect=Exception("Temporary Judge0 error")):
        with patch.object(gradingQueue, "save_local_queue", new_callable=AsyncMock):
            gradingQueue.local_queue = ["attempt_err_1"]
            gradingQueue.local_retries = {}
            gradingQueue.max_retries = 2

            await gradingQueue.process_local_queue()

            # Since max_retries is 2, it exhausts retries and clears local_queue
            assert gradingQueue.local_queue == []
            assert gradingQueue.local_retries == {}


@pytest.mark.asyncio
async def test_process_local_queue_succeeds_on_retry():
    call_count = 0

    async def mock_grade(attempt_id):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise Exception("Transient network blip")
        return None

    with patch.object(gradingQueue, "grade_attempt", side_effect=mock_grade):
        with patch.object(gradingQueue, "save_local_queue", new_callable=AsyncMock):
            gradingQueue.local_queue = ["attempt_flaky"]
            gradingQueue.local_retries = {}
            gradingQueue.max_retries = 3

            await gradingQueue.process_local_queue()

            assert call_count == 2
            assert gradingQueue.local_queue == []
            assert "attempt_flaky" not in gradingQueue.local_retries


@pytest.mark.asyncio
async def test_redis_grading_worker_dlq_routing():
    mock_redis = MagicMock()
    job_payload = json.dumps({"attemptId": "attempt_max_fail", "retries": 3})
    mock_redis.lpop.side_effect = [job_payload, asyncio.CancelledError()]

    with patch.object(gradingQueue, "redis_client", mock_redis):
        with patch.object(gradingQueue, "grade_attempt", side_effect=Exception("Fatal failure")):
            gradingQueue.max_retries = 3
            try:
                await gradingQueue.redis_grading_worker()
            except asyncio.CancelledError:
                pass

            # Verify DLQ push
            mock_redis.rpush.assert_called_once()
            args, _ = mock_redis.rpush.call_args
            assert args[0] == "grading-dlq"
            assert "attempt_max_fail" in args[1]

