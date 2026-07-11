import os
import sys
import bcrypt
import asyncio

# Setup import path for backend modules
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(base_dir)

from app.db import db

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

async def main():
    print("Seeding E2E users in Python database...")

    # 1. Get or create a college
    colleges_res = await db.from_("colleges").select("id")
    if colleges_res.error:
        print("Error fetching colleges:", colleges_res.error.message)
        sys.exit(1)

    colleges = colleges_res.data or []
    college_id = colleges[0]["id"] if colleges else None

    if not college_id:
        print("No colleges found. Creating a test college...")
        new_col_res = await db.from_("colleges").insert({
            "name": "Test MGIT",
            "code": "MGIT",
            "location": "Hyderabad"
        }).select("id").single()

        if new_col_res.error or not new_col_res.data:
            print("Error creating college:", new_col_res.error.message if new_col_res.error else "No data returned")
            sys.exit(1)
        college_id = new_col_res.data["id"]
        print("Created college with ID:", college_id)
    else:
        print("Using existing college with ID:", college_id)

    # 2. Seed Admin
    admin_email = "admin@intellihire.com"
    admin_hash = hash_password("admin123")
    admin_res = await db.from_("users").insert({
        "name": "Super Admin",
        "email": admin_email,
        "password_hash": admin_hash,
        "role": "admin"
    }).onConflict("email")
    if admin_res.error:
        print("Error seeding admin:", admin_res.error.message)
    else:
        print("Upserted admin successfully.")

    # 3. Seed Recruiter
    recruiter_email = "recruiter@example.com"
    rec_hash = hash_password("recruiter123")
    rec_res = await db.from_("users").insert({
        "name": "Test Recruiter",
        "email": recruiter_email,
        "password_hash": rec_hash,
        "role": "recruiter"
    }).onConflict("email")
    if rec_res.error:
        print("Error seeding recruiter:", rec_res.error.message)
    else:
        print("Upserted recruiter successfully.")

    # 3.5. Seed TPO
    tpo_email = "tpo@example.com"
    tpo_hash = hash_password("tpo123")
    tpo_res = await db.from_("users").insert({
        "name": "Test TPO",
        "email": tpo_email,
        "password_hash": tpo_hash,
        "role": "tpo",
        "college_id": college_id
    }).onConflict("email")
    if tpo_res.error:
        print("Error seeding TPO:", tpo_res.error.message)
    else:
        print("Upserted TPO successfully.")

    # 4. Seed Candidate
    candidate_email = "candidate@example.com"
    candidate_hash = hash_password("candidate123")
    roll_number = "CAND001"

    cand_res = await db.from_("users").insert({
        "name": "Test Candidate",
        "email": candidate_email,
        "password_hash": candidate_hash,
        "role": "candidate",
        "roll_number": roll_number,
        "college_id": college_id,
        "profile_complete": True
    }).onConflict("email").select("id").single()

    if cand_res.error or not cand_res.data:
        print("Error upserting candidate user:", cand_res.error.message if cand_res.error else "No data returned")
    else:
        print("Upserted candidate user successfully.")
        candidate_id = cand_res.data["id"]

        # Seed candidate profile
        profile_res = await db.from_("candidate_profiles").insert({
            "user_id": candidate_id,
            "college_id": college_id,
            "roll_number": roll_number,
            "branch": "CSE",
            "cgpa": 9.5,
            "graduation_year": 2026
        }).onConflict("user_id")

        if profile_res.error:
            print("Error upserting candidate profile:", profile_res.error.message)
        else:
            print("Upserted candidate profile successfully.")

    print("Python seeding complete!")

if __name__ == "__main__":
    asyncio.run(main())
