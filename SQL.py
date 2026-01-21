import sqlite3

conn = sqlite3.connect('FicheTechnique.db')
c = conn.cursor()

# Update type for Dutch language
c.execute("""
UPDATE fiche_technique
SET type = CASE
    WHEN langue = 'nl' AND type = 'Cloison' THEN 'Systeemwand'
    WHEN langue = 'nl' AND type = 'Porte'   THEN 'Deur'
    ELSE type
END
""")

conn.commit()
conn.close()

print("Update completed successfully!")
