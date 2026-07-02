import dotenv from "dotenv";
import fs from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { isPostgresConfigured, pool } from "../lib/postgres.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

async function applyMigrations() {
  if (!isPostgresConfigured()) {
    console.error("Missing PostgreSQL configuration. Set DATABASE_URL in .env file.");
    process.exit(1);
  }

  try {
    console.log("Connecting to PostgreSQL...");

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
    ];

    for (const file of filesToApply) {
      const filePath = resolve(__dirname, `../../../database/${file}`);
      console.log(`Reading and applying: ${filePath}`);
      const sql = await fs.readFile(filePath, "utf-8");
      
      console.log(`Applying database file: ${file}...`);
      await pool.query(sql);
      console.log(`Successfully applied: ${file}`);
    }

    // Verify
    const countRes = await pool.query("SELECT COUNT(*)::int as count FROM questions");
    console.log(`Verification: Total questions currently in database: ${countRes.rows[0].count}`);

  } catch (err: unknown) {
    console.error("Migration/Seeding failed:", err);
    if (process.env.CI) {
      console.log(`::error::Migration/Seeding failed: ${err instanceof Error ? err.message + '\nStack: ' + err.stack : String(err)}`);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applyMigrations();
