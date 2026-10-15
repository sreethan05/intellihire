"""Seed test users for E2E tests."""
import uuid
import bcrypt
import psycopg
from psycopg.rows import dict_row

DB_URL = "postgresql://postgres:postgres@localhost:5432/intellihire"

def hash_pw(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

TEST_USERS = [
    {
        "id": "6eacac4f-ffc4-4859-a657-196ba2cd939b",
        "name": "Super Admin",
        "email": "admin@intellihire.com",
        "password_hash": hash_pw("admin123"),
        "role": "admin",
    },
    {
        "id": "b2c3d4e5-f6a7-4b5c-8d9e-0f1a2b3c4d5e",
        "name": "Lead Recruiter",
        "email": "recruiter@intellihire.com",
        "password_hash": hash_pw("admin123"),
        "role": "recruiter",
    },
    {
        "id": "a1b2c3d4-e5f6-4a5b-8c7d-9e8f7a6b5c4d",
        "name": "College TPO",
        "email": "tpo@intellihire.com",
        "password_hash": hash_pw("admin123"),
        "role": "tpo",
    },
    {
        "id": "c3d4e5f6-a7b8-4c5d-8e9f-0a1b2c3d4e5f",
        "name": "Alex Candidate",
        "email": "candidate@intellihire.com",
        "password_hash": hash_pw("admin123"),
        "role": "candidate",
        "roll_number": "CS2026001",
    },
    {
        "id": "d4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a",
        "name": "Test Recruiter",
        "email": "recruiter@example.com",
        "password_hash": hash_pw("recruiter123"),
        "role": "recruiter",
    },
    {
        "id": "e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b",
        "name": "Test TPO",
        "email": "tpo@example.com",
        "password_hash": hash_pw("tpo123"),
        "role": "tpo",
    },
    {
        "id": "f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c",
        "name": "Test Candidate",
        "email": "candidate@example.com",
        "password_hash": hash_pw("candidate123"),
        "role": "candidate",
        "roll_number": "CAND001",
    },
]

def seed():
    conn = psycopg.connect(DB_URL, row_factory=dict_row)
    cur = conn.cursor()

    # Ensure a default college exists
    cur.execute("SELECT id FROM colleges LIMIT 1")
    college = cur.fetchone()
    if not college:
        college_id = "c011e6e0-0000-4000-a000-000000000001"
        cur.execute(
            """INSERT INTO colleges (id, name, code, location)
               VALUES (%s, %s, %s, %s)
               ON CONFLICT (id) DO NOTHING""",
            (college_id, "Test College", "TC001", "Tech Campus"),
        )
        print(f"  [CREATED] Test College (TC001)")
    else:
        college_id = str(college["id"])

    for u in TEST_USERS:
        college_fk = college_id if u["role"] in ("tpo", "candidate") else None
        roll = u.get("roll_number")

        cur.execute(
            """INSERT INTO users (id, name, email, password_hash, role, college_id, roll_number, profile_complete, must_change_password)
               VALUES (%s, %s, %s, %s, %s, %s, %s, true, false)
               ON CONFLICT (email) DO UPDATE SET
                   password_hash = EXCLUDED.password_hash,
                   name = EXCLUDED.name,
                   role = EXCLUDED.role,
                   college_id = EXCLUDED.college_id,
                   roll_number = EXCLUDED.roll_number,
                   profile_complete = true,
                   must_change_password = false
               RETURNING id""",
            (u["id"], u["name"], u["email"], u["password_hash"], u["role"], college_fk, roll),
        )
        user_row = cur.fetchone()
        user_id = user_row["id"] if user_row else u["id"]
        print(f"  [UPSERTED] {u['name']} ({u['email']}) role={u['role']}")

        if u["role"] == "candidate":
            cur.execute(
                """INSERT INTO candidate_profiles (
                       user_id, college_id, roll_number, branch, cgpa, graduation_year, documents_verified, profile_complete
                   )
                   VALUES (%s, %s, %s, %s, %s, %s, true, true)
                   ON CONFLICT (user_id) DO UPDATE SET
                       college_id = EXCLUDED.college_id,
                       roll_number = EXCLUDED.roll_number,
                       branch = EXCLUDED.branch,
                       cgpa = EXCLUDED.cgpa,
                       graduation_year = EXCLUDED.graduation_year,
                       documents_verified = true,
                       profile_complete = true""",
                (user_id, college_id, roll or "CAND001", "Computer Science", 9.2, 2026),
            )
            print(f"  [PROFILE] candidate_profile linked for {u['email']}")

    conn.commit()
    conn.close()
    print("\nDone! E2E test users and candidate profiles are ready.")

if __name__ == "__main__":
    seed()
