import os
import sys
import psycopg2

# Setup import path
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(base_dir)

from app.config import DATABASE_URL

def verify_all_tables() -> None:
    print("--- STARTING DATABASE SCHEMAS VERIFICATION ---")
    if not DATABASE_URL:
        print("DATABASE_URL is not set!")
        sys.exit(1)
        
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        # 1. Get database details
        cur.execute("SELECT current_database(), current_user, version();")
        db_name, db_user, db_version = cur.fetchone()
        print(f"Connected to Database: \"{db_name}\" as User: \"{db_user}\"")
        print(f"PostgreSQL Version: {db_version.split(',')[0]}")
        print("----------------------------------------------")
        
        # 2. Fetch list of tables
        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        """)
        tables = [row[0] for row in cur.fetchall()]
        print(f"Found {len(tables)} base tables in 'public' schema:")

        for table in tables:
            # Columns count
            cur.execute("""
                SELECT count(*) 
                FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = %s
            """, (table,))
            cols_count = cur.fetchone()[0]

            # Rows count
            cur.execute(f'SELECT count(*) FROM "{table}"')
            rows_count = cur.fetchone()[0]

            # Indexes
            cur.execute("""
                SELECT indexname, indexdef 
                FROM pg_indexes 
                WHERE schemaname = 'public' AND tablename = %s
            """, (table,))
            indexes = cur.fetchall()

            print(f'\n\ud83d\udd39 Table: "{table}"')
            print(f"   - Columns: {cols_count}")
            print(f"   - Rows:    {rows_count}")
            print(f"   - Indexes: {len(indexes)}")
            for idx_name, idx_def in indexes:
                print(f"     * {idx_name}: {idx_def}")

        print("\n----------------------------------------------")
        print("\u2705 DATABASE SCHEMA AUDIT COMPLETE")
        cur.close()
        conn.close()

    except Exception as err:
        print(f"\u274c Schema verification failed: {err}")

if __name__ == "__main__":
    verify_all_tables()
