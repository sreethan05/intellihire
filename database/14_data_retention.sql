-- 14. Data Retention Policy
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS void AS $$
BEGIN
  -- Delete audit logs older than 365 days
  DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '365 days';

  -- Delete proctoring snapshots older than 365 days
  DELETE FROM proctoring_snapshots WHERE captured_at < NOW() - INTERVAL '365 days';

  -- Delete notifications older than 365 days
  DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '365 days';

  -- Delete activity feed entries older than 365 days
  DELETE FROM activity_feed WHERE created_at < NOW() - INTERVAL '365 days';
END;
$$ LANGUAGE plpgsql;
