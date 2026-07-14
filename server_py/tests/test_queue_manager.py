import pytest
from unittest.mock import MagicMock, patch
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
