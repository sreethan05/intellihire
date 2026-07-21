import psycopg
from psycopg.rows import dict_row

conn = psycopg.connect('postgresql://postgres:postgres@localhost:5432/intellihire', row_factory=dict_row)
cur = conn.cursor()

# List tables
cur.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
tables = [r['tablename'] for r in cur.fetchall()]
print(f"{len(tables)} tables:")
for t in tables:
    print(f"  - {t}")

# Check users
cur.execute("SELECT id, name, email, role FROM users LIMIT 10")
users = cur.fetchall()
print(f"\n{len(users)} users found:")
for u in users:
    print(f"  - {u['name']} ({u['email']}) role={u['role']}")

conn.close()
