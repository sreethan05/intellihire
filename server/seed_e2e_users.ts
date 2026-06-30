import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import bcryptjs from "bcryptjs";
import { db } from "./lib/postgres.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

async function main() {
  console.log("Seeding E2E users...");

  // 1. Get or create a college
  const { data: colleges, error: colError } = await db.from("colleges").select("id");
  if (colError) {
    console.error("Error fetching colleges:", colError);
    process.exit(1);
  }

  let collegeId = colleges?.[0]?.id;
  if (!collegeId) {
    console.log("No colleges found. Creating a test college...");
    const { data: newCollege, error: createColError } = await db
      .from("colleges")
      .insert({
        name: "Test MGIT",
        code: "MGIT",
        location: "Hyderabad"
      })
      .select("id")
      .single();

    if (createColError || !newCollege) {
      console.error("Error creating college:", createColError);
      process.exit(1);
    }
    collegeId = newCollege.id;
    console.log("Created college with ID:", collegeId);
  } else {
    console.log("Using existing college with ID:", collegeId);
  }

  // 2. Seed Admin
  const adminEmail = "admin@intellihire.com";
  const adminHash = await bcryptjs.hash("admin123", 10);
  const { error: adminError } = await db
    .from("users")
    .upsert({
      name: "Super Admin",
      email: adminEmail,
      password_hash: adminHash,
      role: "admin"
    }, { onConflict: "email" });

  if (adminError) {
    console.error("Error upserting admin:", adminError);
  } else {
    console.log("Upserted admin successfully.");
  }

  // 3. Seed Recruiter
  const recruiterEmail = "recruiter@example.com";
  const recruiterHash = await bcryptjs.hash("recruiter123", 10);
  const { error: recError } = await db
    .from("users")
    .upsert({
      name: "Test Recruiter",
      email: recruiterEmail,
      password_hash: recruiterHash,
      role: "recruiter"
    }, { onConflict: "email" });

  if (recError) {
    console.error("Error upserting recruiter:", recError);
  } else {
    console.log("Upserted recruiter successfully.");
  }

  // 4. Seed Candidate
  const candidateEmail = "candidate@example.com";
  const candidateHash = await bcryptjs.hash("candidate123", 10);
  const rollNumber = "CAND001";
  
  const { data: candidateUser, error: candError } = await db
    .from("users")
    .upsert({
      name: "Test Candidate",
      email: candidateEmail,
      password_hash: candidateHash,
      role: "candidate",
      roll_number: rollNumber,
      college_id: collegeId,
      profile_complete: true
    }, { onConflict: "email" })
    .select("id")
    .single();

  if (candError || !candidateUser) {
    console.error("Error upserting candidate user:", candError);
  } else {
    console.log("Upserted candidate user successfully.");

    // Seed candidate profile
    const { error: profileError } = await db
      .from("candidate_profiles")
      .upsert({
        user_id: candidateUser.id,
        college_id: collegeId,
        roll_number: rollNumber,
        branch: "CSE",
        cgpa: 9.5,
        graduation_year: 2026
      }, { onConflict: "user_id" });

    if (profileError) {
      console.error("Error upserting candidate profile:", profileError);
    } else {
      console.log("Upserted candidate profile successfully.");
    }
  }

  console.log("Seeding complete!");
}

main();
