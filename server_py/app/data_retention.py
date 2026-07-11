import time
from .db import get_connection
from .logger import logger

async def run_data_retention_cleanup() -> None:
    logger.info("Starting data retention cleanup job...")
    try:
        start_time = time.time()
        
        # Run clean up function/stored procedure inside database connection
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT cleanup_old_logs();")
            conn.commit()
            
        duration_ms = (time.time() - start_time) * 1000
        logger.info(f"Data retention cleanup completed successfully: duration={duration_ms:.2f}ms")
    except Exception as err:
        logger.error(f"Data retention cleanup failed: {err}")
