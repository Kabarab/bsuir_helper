import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "..", "bsuir_nexus.db")

def migrate():
    print(f"Connecting to {db_path}...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        print("Adding overdue_notified column to tasks table...")
        cursor.execute("ALTER TABLE tasks ADD COLUMN overdue_notified BOOLEAN DEFAULT 0")
        conn.commit()
        print("✅ Column added successfully!")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e).lower():
            print("ℹ️ Column already exists.")
        else:
            print(f"❌ Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
