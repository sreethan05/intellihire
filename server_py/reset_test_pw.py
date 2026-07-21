"""Reset E2E test user passwords to known values."""
import bcrypt
import psycopg

DB_URL = "postgresql://postgres:postgres@localhost:5432/intellihire"

def hash_pw(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

USERS = {
    "admin@intellihire.com": "admin123",
    "recruiter@example.com": "recruiter123",
    "tpo@example.com": "tpo123",
    "candidate@example.com": "candidate123",
}

conn = psycopg.connect(DB_URL)
cur = conn.cursor()

for email, password in USERS.items():
    new_hash = hash_pw(password)
    cur.execute("UPDATE users SET password_hash = %s WHERE email = %s", (new_hash, email))
    if cur.rowcount > 0:
        print(f"  [RESET] {email} password updated")
    else:
        print(f"  [MISS] {email} not found in DB")

conn.commit()
conn.close()
print("\nPasswords reset. E2E tests should now authenticate correctly.")
