import os
import sys
import asyncio

# Setup import path
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(base_dir)

from app.db import db

async def main():
    print("Fetching all seeded users from database...")
    res = await db.from_("users").select("id, name, email, role")
    if res.error:
        print("Error fetching users:", res.error.message)
    else:
        users = res.data or []
        print(f"Found {len(users)} user(s):")
        for u in users:
            print(f"  - ID: {u['id']} | Name: {u['name']} | Email: {u['email']} | Role: {u['role']}")

if __name__ == "__main__":
    asyncio.run(main())
