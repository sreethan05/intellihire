import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "./lib/postgres.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env") });

async function main() {
  const { data: users, error } = await db.from("users").select("id, name, email, role");
  if (error) {
    console.error("Error fetching users:", error);
  } else {
    console.log("Seeded Users in DB:", users);
  }
}

main();
