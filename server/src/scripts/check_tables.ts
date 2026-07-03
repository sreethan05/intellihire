import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { pool } from "../lib/postgres.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

async function verifyAllTables() {
  console.log("--- STARTING DATABASE SCHEMAS VERIFICATION ---");
  try {
    // 1. Get current database & user details
    const connInfo = await pool.query("SELECT current_database() as db, current_user as usr, version() as ver");
    console.log(`Connected to Database: "${connInfo.rows[0].db}" as User: "${connInfo.rows[0].usr}"`);
    console.log(`PostgreSQL Version: ${connInfo.rows[0].ver.split(",")[0]}`);
    console.log("----------------------------------------------");

    // 2. Fetch list of tables in public schema
    const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    console.log(`Found ${tablesRes.rows.length} base tables in 'public' schema:`);

    for (const row of tablesRes.rows) {
      const tableName = row.table_name;
      
      // Get column count
      const colRes = await pool.query(`
        SELECT count(*)::int as count 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
      `, [tableName]);

      // Get row count estimate
      const countRes = await pool.query(`SELECT count(*)::int as count FROM "${tableName}"`);

      // Get indexes for table
      const idxRes = await pool.query(`
        SELECT indexname, indexdef 
        FROM pg_indexes 
        WHERE schemaname = 'public' AND tablename = $1
      `, [tableName]);

      console.log(`\n🔹 Table: "${tableName}"`);
      console.log(`   - Columns: ${colRes.rows[0].count}`);
      console.log(`   - Rows:    ${countRes.rows[0].count}`);
      console.log(`   - Indexes: ${idxRes.rows.length}`);
      for (const idx of idxRes.rows) {
        console.log(`     * ${idx.indexname}: ${idx.indexdef}`);
      }
    }

    console.log("\n----------------------------------------------");
    console.log("✅ DATABASE SCHEMA AUDIT COMPLETE");

  } catch (err: any) {
    console.error("❌ Schema verification failed:", err.message);
  } finally {
    await pool.end();
  }
}

verifyAllTables();
