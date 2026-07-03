import { pool } from "./postgres.js";
import { logger } from "./logger.js";

/**
 * Invokes the database data retention stored procedure to clean up logs/audit tables.
 */
export async function runDataRetentionCleanup() {
  logger.info("Starting data retention cleanup job...");
  try {
    const start = Date.now();
    await pool.query("SELECT cleanup_old_logs();");
    const duration = Date.now() - start;
    logger.info({ durationMs: duration }, "Data retention cleanup completed successfully");
  } catch (err: any) {
    logger.error({ err: err.message }, "Data retention cleanup failed");
  }
}
