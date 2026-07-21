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
        "id": str(uuid.uuid4()),
        "name": "Admin",
        "email": "admin@intellihire.com",
        "password_hash": hash_pw("admin123"),
        "role": "admin",
    },
    {
        "id": str(uuid.uuid4()),
        "name": "Test Recruiter",
        "email": "recruiter@example.com",
        "password_hash": hash_pw("recruiter123"),
        "role": "recruiter",
    },
    {
        "id": str(uuid.uuid4()),
        "name": "Test TPO",
        "email": "tpo@example.com",
        "password_hash": hash_pw("tpo123"),
        "role": "tpo",
    },
    {
        "id": str(uuid.uuid4()),
        "name": "Test Candidate",
        "email": "candidate@example.com",
        "password_hash": hash_pw("candidate123"),
        "role": "candidate",
    },
]

def seed():
    conn = psycopg.connect(DB_URL, row_factory=dict_row)
    cur = conn.cursor()

    for u in TEST_USERS:
        # Check if user already exists
        cur.execute("SELECT id FROM users WHERE email = %s", (u["email"],))
        existing = cur.fetchone()
        if existing:
            print(f"  [SKIP] {u['email']} already exists")
            continue

        cur.execute(
            """INSERT INTO users (id, name, email, password_hash, role)
               VALUES (%s, %s, %s, %s, %s)""",
            (u["id"], u["name"], u["email"], u["password_hash"], u["role"]),
        )
        print(f"  [CREATED] {u['name']} ({u['email']}) role={u['role']}")

    # Create a college for TPO if needed
    cur.execute("SELECT id FROM colleges LIMIT 1")
    college = cur.fetchone()
    if not college:
        college_id = str(uuid.uuid4())
        cur.execute(
            """INSERT INTO colleges (id, name, code, location)
               VALUES (%s, %s, %s, %s)""",
            (college_id, "Test College", "TC001", "Test City"),
        )
        print(f"  [CREATED] Test College (TC001)")
        # Link TPO to college
        cur.execute("SELECT id FROM users WHERE email = 'tpo@example.com'")
        tpo = cur.fetchone()
        if tpo:
            cur.execute(
                "UPDATE users SET college_id = %s WHERE id = %s",
                (college_id, tpo["id"]),
            )
            print(f"  [LINKED] TPO -> Test College")

    conn.commit()
    conn.close()
    print("\nDone! E2E test users are ready.")

if __name__ == "__main__":
    seed()
