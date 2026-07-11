import os
from .logger import logger

SENTRY_DSN = os.getenv("SENTRY_DSN")

def init_sentry() -> bool:
    if not SENTRY_DSN:
        logger.info("Sentry not configured. Set SENTRY_DSN in .env to enable error tracking.")
        return False
        
    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=SENTRY_DSN,
            environment=os.getenv("NODE_ENV", "development"),
            traces_sample_rate=0.1 if os.getenv("NODE_ENV") == "production" else 1.0
        )
        logger.info("Sentry initialized successfully")
        return True
    except ImportError:
        logger.warning("sentry-sdk package not installed. Skipping sentry initialization.")
        return False
