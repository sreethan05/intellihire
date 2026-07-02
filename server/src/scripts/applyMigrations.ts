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

    // 0. Read postgres-schema.sql
    const baseSchemaPath = resolve(__dirname, "../../../database/postgres-schema.sql");
    console.log(`Reading base schema from: ${baseSchemaPath}`);
    const baseSchemaSql = await fs.readFile(baseSchemaPath, "utf-8");

    console.log("Applying base schema...");
    await pool.query(baseSchemaSql);
    console.log("Base schema applied successfully.");
    
    // 1. Read schema-question-bank.sql
    const schemaPath = resolve(__dirname, "../../../database/schema-question-bank.sql");
    console.log(`Reading schema updates from: ${schemaPath}`);
    const schemaSql = await fs.readFile(schemaPath, "utf-8");
    
    console.log("Applying schema updates...");
    await pool.query(schemaSql);
    console.log("Schema updates applied successfully.");

    // 1.5. Read schema-analytics.sql
    const analyticsSchemaPath = resolve(__dirname, "../../../database/schema-analytics.sql");
    console.log(`Reading analytics schema updates from: ${analyticsSchemaPath}`);
    if (await fs.stat(analyticsSchemaPath).then(() => true).catch(() => false)) {
      const analyticsSql = await fs.readFile(analyticsSchemaPath, "utf-8");
      console.log("Applying analytics schema updates...");
      await pool.query(analyticsSql);
      console.log("Analytics schema updates applied successfully.");
    }

    // 1.7. Read schema-unified-features.sql
    const unifiedSchemaPath = resolve(__dirname, "../../../database/schema-unified-features.sql");
    console.log(`Reading unified features schema updates from: ${unifiedSchemaPath}`);
    if (await fs.stat(unifiedSchemaPath).then(() => true).catch(() => false)) {
      const unifiedSql = await fs.readFile(unifiedSchemaPath, "utf-8");
      console.log("Applying unified features schema updates...");
      await pool.query(unifiedSql);
      console.log("Unified features schema updates applied successfully.");
    }

    // 2. Read seed-question-bank.sql
    const seedPath = resolve(__dirname, "../../../database/seed-question-bank.sql");
    console.log(`Reading base seed data from: ${seedPath}`);
    const seedSql = await fs.readFile(seedPath, "utf-8");
    
    console.log("Applying seed data...");
    await pool.query(seedSql);
    console.log("Base seed data applied successfully.");

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
