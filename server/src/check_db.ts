import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { isPostgresConfigured, pool } from "./lib/postgres.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../.env") });

async function checkDatabase() {
  if (!isPostgresConfigured()) {
    console.error("Missing PostgreSQL configuration. Set DATABASE_URL or PGHOST/PGUSER/PGDATABASE.");
    return;
  }

  try {
    const response = await pool.query("select current_database() as database, current_user as user, version()");
    console.log("PostgreSQL connection OK:", response.rows[0]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("PostgreSQL connection failed:", message);
  } finally {
    await pool.end();
  }
}

checkDatabase();
