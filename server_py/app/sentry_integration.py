import os
from .logger import logger

from .config import SENTRY_DSN, NODE_ENV

def init_sentry() -> bool:
    if not SENTRY_DSN:
        logger.info("Sentry not configured. Set SENTRY_DSN in .env to enable error tracking.")
        return False
        
    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=SENTRY_DSN,
            environment=NODE_ENV,
            traces_sample_rate=0.1 if NODE_ENV == "production" else 1.0
        )
        logger.info("Sentry initialized successfully")
        return True
    except ImportError:
        logger.warning("sentry-sdk package not installed. Skipping sentry initialization.")
        return False
