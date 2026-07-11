import os
import sys
import psycopg2

# Setup import path
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(base_dir)

from app.config import DATABASE_URL

def main():
    print("Checking database connection...")
    if not DATABASE_URL:
        print("DATABASE_URL is not set!")
        sys.exit(1)
        
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        cur.execute("SELECT version();")
        version = cur.fetchone()[0]
        print(f"Connection successful! PostgreSQL version: {version}")
        
        # Check tables list
        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """)
        tables = cur.fetchall()
        print(f"Found {len(tables)} tables in database:")
        for t in tables:
            print(f"  - {t[0]}")
            
        cur.close()
        conn.close()
        print("Database check completed successfully!")
    except Exception as e:
        print(f"Database connection failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
