from flask import Flask, render_template, request, redirect, session, url_for, jsonify, flash
import sqlite3
import os
import shutil
import base64
import json
from functools import wraps
from werkzeug.utils import secure_filename
from PIL import Image

app = Flask(__name__)
app.secret_key = "supersecretkey"

DB_NAME = "FicheTechnique.db"
UPLOAD_FOLDER = "static/uploads"
ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'pdf'}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Base path configuration
BASE_PATH = '/tools/fiches'  # Change this to '' if not using subpath

# Fields that should NOT be copied (text fields that need translation)
TRANSLATABLE_FIELDS = {
    'variant', 'description',
    'hauteur', 'largeur', 'epaisseur', 'epaisseur_battent', 'tolerance_hauteur',
    'verre', 'battant', 'panneau', 'poids_porte_cloison', 'resistance_feu',
    'nbn_s_01_400', 'nbn_en_iso_717_1'
}
for i in range(1, 23):
    TRANSLATABLE_FIELDS.add(f'vue_eclatee_{i}')
for i in range(1, 7):
    TRANSLATABLE_FIELDS.add(f'dessin_technique_nom_{i}')


# -------------------- HELPER: Get Base Path --------------------
def get_base_url():
    return BASE_PATH if BASE_PATH else ''


# -------------------- DATABASE INIT --------------------
def init_db():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute("""
    CREATE TABLE IF NOT EXISTS fiche_technique (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cpid TEXT NOT NULL,
        reference TEXT NOT NULL,
        reference_menu TEXT NOT NULL,
        variant TEXT,
        langue TEXT DEFAULT 'fr',
	    type TEXT,
        description TEXT,
        photo_produit TEXT,
        hauteur TEXT,
        largeur TEXT,
        epaisseur TEXT,
	    epaisseur_battent TEXT,
        tolerance_hauteur TEXT,
        verre TEXT,
	    battant TEXT,
	    panneau TEXT,
        poids_porte_cloison  TEXT,
        resistance_feu TEXT,
        nbn_s_01_400 TEXT,
        nbn_en_iso_717_1 TEXT,
        vue_eclatee_image TEXT,
        vue_eclatee_1 TEXT,
        vue_eclatee_2 TEXT,
        vue_eclatee_3 TEXT,
        vue_eclatee_4 TEXT,
        vue_eclatee_5 TEXT,
        vue_eclatee_6 TEXT,
        vue_eclatee_7 TEXT,
        vue_eclatee_8 TEXT,
        vue_eclatee_9 TEXT,
        vue_eclatee_10 TEXT,
        vue_eclatee_11 TEXT,
        vue_eclatee_12 TEXT,
        vue_eclatee_13 TEXT,
        vue_eclatee_14 TEXT,
        vue_eclatee_15 TEXT,
        vue_eclatee_16 TEXT,
        vue_eclatee_17 TEXT,
        vue_eclatee_18 TEXT,
        vue_eclatee_19 TEXT,
        vue_eclatee_20 TEXT,
        vue_eclatee_21 TEXT,
        vue_eclatee_22 TEXT,
        vue_eclatee_count INTEGER DEFAULT 0,
        dessin_technique_1 TEXT,
        dessin_technique_2 TEXT,
        dessin_technique_3 TEXT,
        dessin_technique_4 TEXT,
        dessin_technique_5 TEXT,
        dessin_technique_6 TEXT,
        dessin_technique_nom_1 TEXT,
        dessin_technique_nom_2 TEXT,
        dessin_technique_nom_3 TEXT,
        dessin_technique_nom_4 TEXT,
        dessin_technique_nom_5 TEXT,
        dessin_technique_nom_6 TEXT
    )
    """)
    conn.commit()
    conn.close()


init_db()


# -------------------- HELPER --------------------
def get_db_connection():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn


def calculate_vue_eclatee_count(data):
    count = 0
    for i in range(1, 23):
        field_name = f"vue_eclatee_{i}"
        value = data.get(field_name)
        if value and value.strip():
            count += 1
    return count


def save_file(file):
    """Save uploaded file and return path relative to static folder"""
    if file and file.filename:
        filename = secure_filename(file.filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(file_path)
        return f"uploads/{filename}"
    return None


def save_vue_eclatee_as_svg(file):
    """
    Save the uploaded image and create an SVG wrapper around it.
    The SVG embeds the image as base64, with no annotation layer yet.
    Returns the path to the .svg file: uploads/myimage.svg
    Only ONE file is created — no _original copy needed.
    """
    if not file or not file.filename:
        return None

    filename = secure_filename(file.filename)
    name, ext = os.path.splitext(filename)

    # Save the raw image temporarily
    raw_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(raw_path)

    # Read and base64-encode the image
    with open(raw_path, 'rb') as f:
        img_data = base64.b64encode(f.read()).decode('utf-8')

    mime = 'image/png' if ext.lower() == '.png' else 'image/jpeg'

    # Build SVG with embedded image and empty annotations group
    svg_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="700" height="900" viewBox="0 0 700 900">
  <!-- Embedded source image — never modified -->
  <image id="source-image" x="0" y="0" width="700" height="900"
         xlink:href="data:{mime};base64,{img_data}"
         preserveAspectRatio="none"/>
  <!-- Annotations layer — updated by editor -->
  <g id="annotations"></g>
</svg>'''

    svg_filename = name + '.svg'
    svg_path = os.path.join(app.config['UPLOAD_FOLDER'], svg_filename)
    with open(svg_path, 'w', encoding='utf-8') as f:
        f.write(svg_content)

    # Remove the temporary raw image
    os.remove(raw_path)

    return f"uploads/{svg_filename}"


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def extract_translations(form_data, lang_suffix):
    translations = {}
    suffix = f"_{lang_suffix}"
    for key, value in form_data.items():
        if key.endswith(suffix):
            original_key = key[:-len(suffix)]
            translations[original_key] = value.strip() if value else None
    return translations


# -------------------- HOME --------------------
@app.route("/", methods=["GET"])
@app.route(f"{BASE_PATH}/", methods=["GET"])
def home():
    type_selected = request.args.get("type", "Cloison")
    cpid_selected = request.args.get("cpid", "").strip()
    base = get_base_url()

    conn = get_db_connection()
    rows = conn.execute(
        "SELECT DISTINCT cpid FROM fiche_technique WHERE type=? AND langue='fr'",
        (type_selected,)
    ).fetchall()
    cpids = [row['cpid'].strip() for row in rows]

    if cpid_selected and cpid_selected not in cpids:
        cpids.append(cpid_selected)

    conn.close()
    cpids = sorted(cpids, key=str.lower)

    if type_selected == "Cloison":
        return render_template("homeCloison.html",
                               cpids=cpids,
                               type_selected=type_selected,
                               base=base,
                               cpid_selected=cpid_selected)
    else:
        return render_template("homePorte.html",
                               cpids=cpids,
                               type_selected=type_selected,
                               base=base,
                               cpid_selected=cpid_selected)


# -------------------- ADD FICHE --------------------
@app.route("/add_fiche", methods=["POST"])
@app.route(f"{BASE_PATH}/add_fiche", methods=["POST"])
def add_fiche():
    cpid = request.form.get("cpid")
    ref_type = request.form.get("type", "Cloison")
    previous_ref = request.form.get("previous_ref")
    base = get_base_url()

    if not cpid:
        flash("CPID est obligatoire", "warning")
        return redirect(f"{base}/?type={ref_type}")

    conn = get_db_connection()
    conn.row_factory = sqlite3.Row

    existing = conn.execute("SELECT * FROM fiche_technique WHERE cpid=?", (cpid,)).fetchall()
    if existing:
        flash("Cette CPID existe déjà. Utilisez 'Mettre à jour' pour la modifier.", "danger")
        conn.close()
        return redirect(f"{base}/?type={ref_type}")

    previous_images = {}
    if previous_ref:
        prev = conn.execute(
            "SELECT * FROM fiche_technique WHERE cpid=? AND langue='fr'", (previous_ref,)
        ).fetchone()
        if prev:
            previous_images = dict(prev)

    data_fr = {}
    for key, value in request.form.items():
        if key not in ["previous_ref", "updateRef", "deleteRef", "vue_eclatee_already_saved"] and not key.startswith("delete_") and not key.endswith(
                "_nl") and not key.endswith("_en"):
            data_fr[key] = value.strip() if value else None

    data_fr["type"] = ref_type
    data_fr["langue"] = "fr"

    en_translations = extract_translations(request.form, "en")
    nl_translations = extract_translations(request.form, "nl")

    file_fields = [
        "photo_produit",
        "dessin_technique_1", "dessin_technique_2", "dessin_technique_3",
        "dessin_technique_4", "dessin_technique_5", "dessin_technique_6"
    ]

    for f in file_fields:
        file = request.files.get(f)
        if file and file.filename.strip():
            uploaded = save_file(file)
            data_fr[f] = uploaded
        else:
            data_fr[f] = previous_images.get(f)

    # ── Vue éclatée (SVG-based) ──
    # vue_eclatee_already_saved: set by editor after save_annotations — SVG already on disk
    vue_already_saved = request.form.get("vue_eclatee_already_saved", "").strip()
    vue_file = request.files.get("vue_eclatee_image")

    if vue_already_saved:
        # SVG already created and annotated by editor — just store the path
        data_fr["vue_eclatee_image"] = f"uploads/{vue_already_saved}"
    elif vue_file and vue_file.filename.strip():
        # New image uploaded without editor — wrap in SVG (no annotation yet)
        data_fr["vue_eclatee_image"] = save_vue_eclatee_as_svg(vue_file)
    else:
        old = previous_images.get("vue_eclatee_image")
        data_fr["vue_eclatee_image"] = old if old else None

    data_fr["vue_eclatee_count"] = calculate_vue_eclatee_count(data_fr)

    try:
        cols_fr = ", ".join(data_fr.keys())
        placeholders_fr = ", ".join(["?"] * len(data_fr))
        conn.execute(f"INSERT INTO fiche_technique ({cols_fr}) VALUES ({placeholders_fr})", list(data_fr.values()))

        data_en = data_fr.copy()
        data_en["langue"] = "en"
        for field in TRANSLATABLE_FIELDS:
            if field in data_en:
                data_en[field] = None
        for key, value in en_translations.items():
            if key in data_en and value and value.strip():
                data_en[key] = value
        cols_en = ", ".join(data_en.keys())
        placeholders_en = ", ".join(["?"] * len(data_en))
        conn.execute(f"INSERT INTO fiche_technique ({cols_en}) VALUES ({placeholders_en})", list(data_en.values()))

        data_nl = data_fr.copy()
        data_nl["langue"] = "nl"
        for field in TRANSLATABLE_FIELDS:
            if field in data_nl:
                data_nl[field] = None
        for key, value in nl_translations.items():
            if key in data_nl and value and value.strip():
                data_nl[key] = value
        cols_nl = ", ".join(data_nl.keys())
        placeholders_nl = ", ".join(["?"] * len(data_nl))
        conn.execute(f"INSERT INTO fiche_technique ({cols_nl}) VALUES ({placeholders_nl})", list(data_nl.values()))

        conn.commit()
        flash(f"CPID '{cpid}' ajoutée avec succès en FR, EN et NL !", "success")
    except Exception as e:
        conn.rollback()
        flash(f"Erreur lors de l'ajout : {e}", "danger")
    finally:
        conn.close()

    return redirect(f"{base}/?type={ref_type}&cpid={cpid}")


# -------------------- GET FICHE --------------------
@app.route("/get_fiche/<cpid>")
@app.route(f"{BASE_PATH}/get_fiche/<cpid>")
def get_fiche(cpid):
    conn = get_db_connection()

    fr = conn.execute(
        "SELECT * FROM fiche_technique WHERE cpid=? AND langue='fr'", (cpid,)
    ).fetchone()
    en = conn.execute(
        "SELECT * FROM fiche_technique WHERE cpid=? AND langue='en'", (cpid,)
    ).fetchone()
    nl = conn.execute(
        "SELECT * FROM fiche_technique WHERE cpid=? AND langue='nl'", (cpid,)
    ).fetchone()

    conn.close()

    if not fr:
        return jsonify({"error": "CPID introuvable"}), 404

    fr_dict = dict(fr)

    return jsonify({
        "fr": fr_dict,
        "en": dict(en) if en else None,
        "nl": dict(nl) if nl else None
    })


# -------------------- GET SOURCE IMAGE FROM SVG --------------------
@app.route('/get_source_image/<filename>')
@app.route(f"{BASE_PATH}/get_source_image/<filename>")
def get_source_image(filename):
    """
    Extract the raw embedded image bytes from an SVG file and serve them directly.
    If the file is not an SVG (e.g. old PNG record), return 404 so JS shows the alert.
    """
    safe_filename = secure_filename(filename)
    svg_path = os.path.join(app.config['UPLOAD_FOLDER'], safe_filename)

    # Must be an .svg file — old records stored .png/.jpg, reject cleanly
    if not safe_filename.lower().endswith('.svg'):
        return "Not an SVG file — please re-upload the image", 404

    if not os.path.exists(svg_path):
        return "SVG not found", 404

    import xml.etree.ElementTree as ET
    try:
        tree = ET.parse(svg_path)
        root = tree.getroot()

        img_el = root.find('.//{http://www.w3.org/2000/svg}image[@id="source-image"]')
        if img_el is None:
            img_el = root.find('.//image[@id="source-image"]')

        if img_el is None:
            return "Source image element not found in SVG", 404

        href = img_el.get('href') or img_el.get('{http://www.w3.org/1999/xlink}href')
        if not href or not href.startswith('data:'):
            return "No embedded data URI found", 404

        header, b64data = href.split(',', 1)
        mime = header.split(':')[1].split(';')[0]
        raw_bytes = base64.b64decode(b64data)

        from flask import Response
        return Response(raw_bytes, mimetype=mime,
                        headers={"Cache-Control": "no-cache"})

    except Exception as e:
        return f"Error extracting image: {e}", 500



@app.route("/get_svg_annotations/<path:filename>")
@app.route(f"{BASE_PATH}/get_svg_annotations/<path:filename>")
def get_svg_annotations(filename):
    """
    Parse an existing SVG file and return its annotations as JSON.
    If the file is not an SVG (old PNG/JPG record), return empty annotations cleanly.
    """
    # Old records may store .png/.jpg — not parseable as SVG, return empty gracefully
    if not filename.lower().endswith('.svg'):
        return jsonify({"error": "Not an SVG file", "annotations": []}), 200

    svg_path = os.path.join(app.root_path, 'static', filename)
    if not os.path.exists(svg_path):
        return jsonify({"error": "SVG not found", "annotations": []}), 200

    import xml.etree.ElementTree as ET
    try:
        tree = ET.parse(svg_path)
        root = tree.getroot()
        ns = {'svg': 'http://www.w3.org/2000/svg'}

        annotations = []
        ann_group = root.find('.//svg:g[@id="annotations"]', ns)
        if ann_group is not None:
            for ann_g in ann_group.findall('svg:g', ns):
                ann_id   = ann_g.get('data-id')
                ann_x    = ann_g.get('data-x')
                ann_y    = ann_g.get('data-y')
                ann_side = ann_g.get('data-side')
                if ann_id and ann_x and ann_y and ann_side:
                    annotations.append({
                        'id':   int(ann_id),
                        'x':    float(ann_x),
                        'y':    float(ann_y),
                        'side': ann_side
                    })

        return jsonify({"annotations": annotations})
    except Exception as e:
        return jsonify({"error": str(e), "annotations": []}), 200


# -------------------- SAVE SVG ANNOTATIONS --------------------
@app.route('/save_annotations', methods=['POST'])
@app.route(f"{BASE_PATH}/save_annotations", methods=['POST'])
def save_annotations():
    """
    Receive annotations JSON, open the existing SVG, replace its <g id="annotations">
    layer with fresh SVG annotation elements. The embedded <image> (base64) is untouched.
    Only ONE file exists — no _original copy needed.
    """
    data       = request.json
    svg_filename = data['filename']   # e.g. "myimage.svg"
    annotations  = data['annotations']

    svg_path = os.path.join(app.config['UPLOAD_FOLDER'], svg_filename)
    if not os.path.exists(svg_path):
        return jsonify({'success': False, 'error': 'SVG file not found'}), 404

    import xml.etree.ElementTree as ET
    ET.register_namespace('', 'http://www.w3.org/2000/svg')
    ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')

    try:
        tree = ET.parse(svg_path)
        root = tree.getroot()
        ns   = {'svg': 'http://www.w3.org/2000/svg'}

        # Remove old annotations group
        ann_group = root.find('.//svg:g[@id="annotations"]', ns)
        if ann_group is not None:
            root.remove(ann_group)

        # Build new annotations group
        new_group = ET.SubElement(root, '{http://www.w3.org/2000/svg}g')
        new_group.set('id', 'annotations')

        for ann in annotations:
            x     = float(ann['x'])
            y     = float(ann['y'])
            side  = ann['side']
            ann_id = int(ann['id'])
            line_x = 50 if side == 'left' else 650

            # Wrap each annotation in a <g> with data attributes for later parsing
            g = ET.SubElement(new_group, '{http://www.w3.org/2000/svg}g')
            g.set('data-id',   str(ann_id))
            g.set('data-x',    str(x))
            g.set('data-y',    str(y))
            g.set('data-side', side)

            # Line from circle to target point
            line = ET.SubElement(g, '{http://www.w3.org/2000/svg}line')
            line.set('x1', str(line_x))
            line.set('y1', str(y))
            line.set('x2', str(x))
            line.set('y2', str(y))
            line.set('stroke', 'black')
            line.set('stroke-width', '2')

            # Small dot at target
            dot = ET.SubElement(g, '{http://www.w3.org/2000/svg}circle')
            dot.set('cx', str(x))
            dot.set('cy', str(y))
            dot.set('r', '3')
            dot.set('fill', 'black')

            # Big circle at line start
            big = ET.SubElement(g, '{http://www.w3.org/2000/svg}circle')
            big.set('cx', str(line_x))
            big.set('cy', str(y))
            big.set('r', '20')
            big.set('fill', 'black')

            # Number text
            text = ET.SubElement(g, '{http://www.w3.org/2000/svg}text')
            text.set('x', str(line_x))
            text.set('y', str(y))
            text.set('text-anchor', 'middle')
            text.set('dominant-baseline', 'central')
            text.set('fill', 'white')
            text.set('font-size', '14')
            text.set('font-weight', 'bold')
            text.set('font-family', 'Arial, sans-serif')
            text.text = str(ann_id)

        # Write back — preserve XML declaration
        tree.write(svg_path, encoding='unicode', xml_declaration=True)

        return jsonify({'success': True, 'image_path': f"uploads/{svg_filename}"})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# -------------------- CREATE EXPLODED VIEW (SVG upload entry point) --------------------
@app.route('/create_exploded_view', methods=['POST'])
@app.route(f"{BASE_PATH}/create_exploded_view", methods=['POST'])
def create_exploded_view():
    """
    Receive an uploaded image, wrap it in an SVG with an empty annotations layer,
    and return the SVG filename so the editor can open it.
    No _original copy is created — the SVG itself is the single source of truth.
    """
    file = request.files.get("vue_eclatee_image")
    base = get_base_url()

    if not file or file.filename == '':
        return jsonify({"error": "No image file provided"}), 400

    svg_path = save_vue_eclatee_as_svg(file)
    if not svg_path:
        return jsonify({"error": "Failed to create SVG"}), 500

    svg_filename = svg_path.split('/')[-1]   # e.g. "myimage.svg"

    return jsonify({
        "success": "Image uploaded and converted to SVG! Opening editor...",
        "redirect": f"{base}/editor/{svg_filename}",
        "filename": svg_filename
    })


# -------------------- UPDATE --------------------
@app.route("/update_fiche", methods=["POST"])
@app.route(f"{BASE_PATH}/update_fiche", methods=["POST"])
def update_fiche():
    cpid = request.form.get("updateRef")
    ref_type = request.form.get("type", "Cloison")
    base = get_base_url()

    if not cpid:
        flash("Sélectionnez une référence à mettre à jour", "warning")
        return redirect(f"{base}/?type={ref_type}")

    conn = get_db_connection()
    conn.row_factory = sqlite3.Row

    existing_fr = conn.execute(
        "SELECT * FROM fiche_technique WHERE cpid=? AND langue='fr'", (cpid,)
    ).fetchone()
    existing_en = conn.execute(
        "SELECT * FROM fiche_technique WHERE cpid=? AND langue='en'", (cpid,)
    ).fetchone()
    existing_nl = conn.execute(
        "SELECT * FROM fiche_technique WHERE cpid=? AND langue='nl'", (cpid,)
    ).fetchone()

    if not existing_fr:
        flash("Référence introuvable", "danger")
        conn.close()
        return redirect(f"{base}/?type={ref_type}")

    data_fr = {}
    for k, v in request.form.items():
        if k not in ["updateRef", "deleteRef", "previous_ref", "vue_eclatee_already_saved"] and not k.startswith("delete_") and not k.endswith(
                "_nl") and not k.endswith("_en"):
            data_fr[k] = v

    data_fr["type"] = ref_type

    en_translations = extract_translations(request.form, "en")
    nl_translations = extract_translations(request.form, "nl")

    files = [
        "photo_produit",
        "dessin_technique_1", "dessin_technique_2", "dessin_technique_3",
        "dessin_technique_4", "dessin_technique_5", "dessin_technique_6"
    ]

    for f in files:
        delete_flag = request.form.get(f"delete_{f}")
        if delete_flag == "true":
            data_fr[f] = None
        else:
            uploaded = save_file(request.files.get(f))
            data_fr[f] = uploaded if uploaded else existing_fr[f]

    # ── Vue éclatée (SVG-based) ──
    delete_vue        = request.form.get("delete_vue_eclatee_image")
    vue_already_saved = request.form.get("vue_eclatee_already_saved", "").strip()
    vue_file          = request.files.get("vue_eclatee_image")

    if delete_vue == "true":
        data_fr["vue_eclatee_image"] = None
    elif vue_already_saved:
        # SVG already annotated by editor
        data_fr["vue_eclatee_image"] = f"uploads/{vue_already_saved}"
    elif vue_file and vue_file.filename.strip():
        # New image uploaded without editor — wrap in SVG
        data_fr["vue_eclatee_image"] = save_vue_eclatee_as_svg(vue_file)
    else:
        old = existing_fr["vue_eclatee_image"]
        data_fr["vue_eclatee_image"] = old if old else None

    data_fr["vue_eclatee_count"] = calculate_vue_eclatee_count(data_fr)

    try:
        set_clause_fr = ", ".join([f"{k}=?" for k in data_fr.keys()])
        conn.execute(f"UPDATE fiche_technique SET {set_clause_fr} WHERE cpid=? AND langue=?",
                     list(data_fr.values()) + [cpid, "fr"])

        data_en = data_fr.copy()
        for field in TRANSLATABLE_FIELDS:
            if field in data_en:
                data_en[field] = None
        for key, value in en_translations.items():
            if key in data_en and value and value.strip():
                data_en[key] = value

        if not existing_en:
            data_en["cpid"] = cpid
            data_en["langue"] = "en"
            cols_en = ", ".join(data_en.keys())
            placeholders_en = ", ".join(["?"] * len(data_en))
            conn.execute(f"INSERT INTO fiche_technique ({cols_en}) VALUES ({placeholders_en})", list(data_en.values()))
        else:
            set_clause_en = ", ".join([f"{k}=?" for k in data_en.keys()])
            conn.execute(f"UPDATE fiche_technique SET {set_clause_en} WHERE cpid=? AND langue=?",
                         list(data_en.values()) + [cpid, "en"])

        data_nl = data_fr.copy()
        for field in TRANSLATABLE_FIELDS:
            if field in data_nl:
                data_nl[field] = None
        for key, value in nl_translations.items():
            if key in data_nl and value and value.strip():
                data_nl[key] = value

        if not existing_nl:
            data_nl["cpid"] = cpid
            data_nl["langue"] = "nl"
            cols_nl = ", ".join(data_nl.keys())
            placeholders_nl = ", ".join(["?"] * len(data_nl))
            conn.execute(f"INSERT INTO fiche_technique ({cols_nl}) VALUES ({placeholders_nl})", list(data_nl.values()))
        else:
            set_clause_nl = ", ".join([f"{k}=?" for k in data_nl.keys()])
            conn.execute(f"UPDATE fiche_technique SET {set_clause_nl} WHERE cpid=? AND langue=?",
                         list(data_nl.values()) + [cpid, "nl"])

        conn.commit()
        flash(f"CPID '{cpid}' mise à jour avec succès en FR, EN et NL !", "success")
    except Exception as e:
        conn.rollback()
        flash(f"Erreur lors de la mise à jour : {e}", "danger")
    finally:
        conn.close()

    return redirect(f"{base}/?type={ref_type}&cpid={cpid}")


# -------------------- DELETE --------------------
@app.route("/delete_fiche", methods=["POST"])
@app.route(f"{BASE_PATH}/delete_fiche", methods=["POST"])
def delete_fiche():
    cpid = request.form.get("deleteRef")
    ref_type = request.form.get("type", "Cloison")
    base = get_base_url()

    if not cpid:
        flash("Sélectionnez une référence à supprimer", "warning")
        return redirect(f"{base}/?type={ref_type}")

    try:
        conn = get_db_connection()
        conn.execute("DELETE FROM fiche_technique WHERE cpid=?", (cpid,))
        conn.commit()
        conn.close()
        flash(f"CPID '{cpid}' supprimée avec succès (versions FR, EN et NL) !", "success")
    except Exception as e:
        flash(f"Erreur lors de la suppression: {e}", "danger")

    return redirect(f"{base}/?type={ref_type}")


@app.template_filter('remove_last_part')
def remove_last_part(value):
    if not value:
        return ""
    return "_".join(value.split("_")[:-1])


# -------------------- INDEX (public fiche view) --------------------
@app.route('/index')
@app.route(f"{BASE_PATH}/index")
def index():
    cpid = request.args.get("cpid")
    lang = request.args.get("lang", "fr")
    base = get_base_url()

    fiche = None
    if cpid:
        conn = get_db_connection()
        row = conn.execute(
            "SELECT * FROM fiche_technique WHERE cpid=? AND langue=?", (cpid, lang)
        ).fetchone()
        conn.close()
        if row:
            fiche = dict(row)

    if not fiche:
        return "Référence introuvable", 404

    product_type = fiche.get('type') or fiche.get('Type')

    if lang == "en":
        return render_template("indexHaasEN.html", fiche=fiche, lang="en", base=base, type=product_type, cpid=cpid)
    elif lang == "nl":
        return render_template("indexHaasNL.html", fiche=fiche, lang="nl", base=base, type=product_type, cpid=cpid)
    else:
        return render_template("indexHaas.html", fiche=fiche, lang="fr", base=base, type=product_type, cpid=cpid)


# -------------------- RUN --------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)