import pytest
import asyncio
from unittest.mock import patch, MagicMock
from app.data_retention import run_data_retention_cleanup, run_data_retention_worker

@pytest.mark.asyncio
async def test_run_data_retention_cleanup_success():
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value.__enter__.return_value = mock_cursor
    
    with patch("app.data_retention.get_connection") as mock_get_conn:
        mock_get_conn.return_value.__enter__.return_value = mock_conn
        
        await run_data_retention_cleanup()
        
        mock_cursor.execute.assert_called_once_with("SELECT cleanup_old_logs();")
        mock_conn.commit.assert_called_once()

@pytest.mark.asyncio
async def test_run_data_retention_cleanup_failure():
    mock_conn = MagicMock()
    mock_conn.cursor.side_effect = Exception("DB Connection Error")
    
    with patch("app.data_retention.get_connection") as mock_get_conn:
        mock_get_conn.return_value.__enter__.return_value = mock_conn
        
        # Should catch exception internally and not raise
        await run_data_retention_cleanup()
        mock_conn.commit.assert_not_called()
        mock_conn.rollback.assert_not_called()
        
        # Test rollback on exception in execute
        mock_conn_rollback = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.execute.side_effect = Exception("Execution Error")
        mock_conn_rollback.cursor.return_value.__enter__.return_value = mock_cursor
        mock_get_conn.return_value.__enter__.return_value = mock_conn_rollback
        
        await run_data_retention_cleanup()
        mock_conn_rollback.commit.assert_not_called()


@pytest.mark.asyncio
async def test_retention_worker_runs_cleanup_and_stops():
    stop_event = asyncio.Event()
    runs = 0

    async def cleanup():
        nonlocal runs
        runs += 1
        stop_event.set()

    await run_data_retention_worker(stop_event, 0.01, cleanup)

    assert runs == 1


@pytest.mark.asyncio
async def test_retention_worker_rejects_non_positive_intervals():
    cleanup = MagicMock()

    await run_data_retention_worker(asyncio.Event(), 0, cleanup)

    cleanup.assert_not_called()
