import os
import glob
from psycopg import connect
from .config import DATABASE_URL
from .logger import logger

def run_migrations():
    """
    Scans the database/ directory for .sql files,
    sorts and executes them in order, tracking applied
    migrations in a schema_migrations table.
    """
    logger.info("Initializing database migrations...")
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    db_dir = os.path.join(base_dir, "database")
    
    if not os.path.exists(db_dir):
        logger.warning(f"Migrations directory not found at: {db_dir}")
        return

    sql_files = sorted(glob.glob(os.path.join(db_dir, "*.sql")))
    if not sql_files:
        logger.info("No migration SQL files found.")
        return

    try:
        with connect(DATABASE_URL) as conn:
            with conn.cursor() as cur:
                # Create migrations tracking table if not exists
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS schema_migrations (
                        migration_name VARCHAR(255) PRIMARY KEY,
                        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                """)
                conn.commit()

                # Get already applied migrations
                cur.execute("SELECT migration_name FROM schema_migrations;")
                applied = {row[0] for row in cur.fetchall()}

                for filepath in sql_files:
                    filename = os.path.basename(filepath)
                    if filename in applied:
                        logger.debug(f"Migration {filename} already applied.")
                        continue

                    logger.info(f"Applying migration: {filename}")
                    with open(filepath, "r", encoding="utf-8") as f:
                        sql_content = f.read()

                    # Execute migration within a subtransaction
                    try:
                        with conn.transaction():
                            if sql_content.strip():
                                cur.execute(sql_content)
                            cur.execute(
                                "INSERT INTO schema_migrations (migration_name) VALUES (%s);",
                                (filename,)
                            )
                        logger.info(f"Successfully applied migration: {filename}")
                    except Exception as e:
                        logger.error(f"Failed to apply migration {filename}: {e}")
                        raise e
            conn.commit()
        logger.info("All database migrations verified and up to date.")
    except Exception as e:
        logger.error(f"Migration runner encountered database connection failure: {e}")
        raise e
