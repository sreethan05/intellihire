import dotenv from "dotenv";
import fs from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { isPostgresConfigured, pool } from "../lib/postgres.js";
import { logger } from "../lib/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
}

async function computeChecksum(content: string): Promise<string> {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

async function applyMigrations() {
  if (!isPostgresConfigured()) {
    logger.error("Missing PostgreSQL configuration. Set DATABASE_URL in .env file.");
    process.exit(1);
  }

  try {
    await ensureMigrationsTable();
    logger.info("Connecting to PostgreSQL...");

    const filesToApply = [
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
    ];

    for (const file of filesToApply) {
      const filePath = resolve(__dirname, `../../../database/${file}`);
      const sql = await fs.readFile(filePath, "utf-8");
      const checksum = await computeChecksum(sql);

      const existing = await pool.query(
        "SELECT checksum FROM migrations WHERE filename = $1",
        [file]
      );

      if (existing.rows.length > 0) {
        if (existing.rows[0].checksum === checksum) {
          logger.info(`Skipping already applied migration: ${file}`);
          continue;
        } else {
          logger.warn(`Migration ${file} has changed! Re-applying (checksum mismatch).`);
          // Remove old record to allow re-application
          await pool.query("DELETE FROM migrations WHERE filename = $1", [file]);
        }
      }

      logger.info(`Applying database file: ${file}...`);
      await pool.query(sql);
      await pool.query(
        "INSERT INTO migrations (filename, checksum) VALUES ($1, $2)",
        [file, checksum]
      );
      logger.info(`Successfully applied: ${file}`);
    }

    const countRes = await pool.query("SELECT COUNT(*)::int as count FROM questions");
    logger.info(`Verification: Total questions currently in database: ${countRes.rows[0].count}`);

  } catch (err: unknown) {
    logger.error({ err }, "Migration/Seeding failed");
    if (process.env.CI) {
      console.log(`::error::Migration/Seeding failed: ${err instanceof Error ? err.message + '\nStack: ' + err.stack : String(err)}`);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applyMigrations();
