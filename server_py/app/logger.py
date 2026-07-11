import os
import sys
import logging

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
is_dev = os.getenv("NODE_ENV", "development") != "production"

# Configure logging format
log_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
if is_dev:
    log_format = "%(asctime)s - [%(levelname)s] - %(message)s"

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format=log_format,
    handlers=[logging.StreamHandler(sys.stdout)]
)

logger = logging.getLogger("intellihire-server")

def log_request(
    method: str,
    url: str,
    status_code: int,
    duration_ms: float,
    user_id: str = None
):
    log_data = f"method={method} url={url} status_code={status_code} duration_ms={duration_ms:.2f}ms"
    if user_id:
        log_data += f" user_id={user_id}"

    if status_code >= 500:
        logger.error(f"Server error response: {log_data}")
    elif status_code >= 400:
        logger.warning(f"Client error response: {log_data}")
    else:
        logger.info(f"Request completed: {log_data}")
