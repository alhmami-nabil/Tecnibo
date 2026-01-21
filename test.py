import sqlite3
import os

CATEGORIES_DB = "categories.db"
DOORS_DB = "doors.db"


def create_categories_table():
    if '/' in CATEGORIES_DB:
        os.makedirs(os.path.dirname(CATEGORIES_DB), exist_ok=True)
    with sqlite3.connect(CATEGORIES_DB) as conn:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.execute("DROP TABLE IF EXISTS categories")
        cursor.execute("""
            CREATE TABLE categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                description TEXT,
                [Image Category] TEXT
            )
        """)
        conn.commit()
        print("✅ Created 'categories' table in categories.db")


def create_doors_table():
    if '/' in DOORS_DB:
        os.makedirs(os.path.dirname(DOORS_DB), exist_ok=True)
    with sqlite3.connect(DOORS_DB) as conn:
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.execute("DROP TABLE IF EXISTS doors")
        cursor.execute("""
            CREATE TABLE doors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                [Image Door] TEXT,
                CPID TEXT,
                Imposte TEXT,
                [Type de cadre] TEXT,
                [Type de corps] TEXT,
                [Acoustique imposte Rw (dB)] TEXT,
                [Acoustique porte Rw (dB)] TEXT,
                [Performance feu] TEXT,
                Hauteur TEXT,
                Largeur TEXT,
                Poignée TEXT,
                Serrure TEXT,
                [Ferme porte] TEXT,
                [Ouvre porte] TEXT,
                [Couleur finition] TEXT,
                [Couleur charnière] TEXT,
                [Charnière invisible] TEXT,
                category_id INTEGER,
                FOREIGN KEY (category_id) REFERENCES categories(id)
            )
        """)
        conn.commit()
        print("✅ Created 'doors' table in doors.db")


if __name__ == "__main__":
    create_categories_table()
    create_doors_table()
    print("🎉 Both databases and tables are ready.")
