import os
import sys
import hashlib
import psycopg2
from dotenv import load_dotenv

# Setup import path for backend config and logging
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(base_dir)

from app.config import DATABASE_URL
from app.logger import logger

def compute_checksum(content: str) -> str:
    h = hashlib.sha256()
    h.update(content.encode("utf-8"))
    return h.hexdigest()[:16]

def ensure_migrations_table(cur) -> None:
    cur.execute("""
        CREATE TABLE IF NOT EXISTS migrations (
            id SERIAL PRIMARY KEY,
            filename TEXT UNIQUE NOT NULL,
            checksum TEXT NOT NULL,
            applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    """)

def apply_migrations() -> None:
    if not DATABASE_URL:
        logger.error("Missing PostgreSQL configuration. Set DATABASE_URL in .env file.")
        sys.exit(1)

    logger.info("Connecting to PostgreSQL...")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        ensure_migrations_table(cur)
        conn.commit()

        files_to_apply = [
            "01_users_colleges.sql",
            "02_questions.sql",
            "03_exams.sql",
            "04_jobs_pipeline.sql",
            "05_attempts_submissions.sql",
            "06_proctoring.sql",
            "07_interviews_feedback.sql",
            "08_platform_system.sql",
            "09_seed_data.sql",
            "10_indexes.sql",
            "11_audit_logs.sql",
            "12_soft_deletes.sql",
            "13_refresh_tokens.sql",
            "14_data_retention.sql",
            "15_slug_index.sql",
            "16_add_unique_exam_questions.sql",
        ]

        database_dir = os.path.join(os.path.dirname(base_dir), "database")

        for file in files_to_apply:
            file_path = os.path.join(database_dir, file)
            if not os.path.exists(file_path):
                logger.warning(f"Migration file not found: {file_path}")
                continue

            with open(file_path, "r", encoding="utf-8") as f:
                sql = f.read()

            checksum = compute_checksum(sql)

            cur.execute("SELECT checksum FROM migrations WHERE filename = %s", (file,))
            existing = cur.fetchone()

            if existing:
                if existing[0] == checksum:
                    logger.info(f"Skipping already applied migration: {file}")
                    continue
                else:
                    logger.warning(f"Migration {file} has changed! Re-applying (checksum mismatch).")
                    cur.execute("DELETE FROM migrations WHERE filename = %s", (file,))

            logger.info(f"Applying database file: {file}...")
            cur.execute(sql)
            cur.execute(
                "INSERT INTO migrations (filename, checksum) VALUES (%s, %s)",
                (file, checksum)
            )
            conn.commit()
            logger.info(f"Successfully applied: {file}")

        cur.execute("SELECT COUNT(*) as count FROM questions")
        total_questions = cur.fetchone()[0]
        logger.info(f"Verification: Total questions currently in database: {total_questions}")

        cur.close()
        conn.close()
        logger.info("Database migrations applied successfully!")

    except Exception as err:
        logger.error(f"Migration/Seeding failed: {err}")
        sys.exit(1)

if __name__ == "__main__":
    apply_migrations()
