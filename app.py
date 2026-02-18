from flask import Flask, render_template, request, redirect, session, url_for, jsonify, flash
import sqlite3
import os
import shutil
from functools import wraps
from werkzeug.utils import secure_filename
from PIL import Image, ImageDraw, ImageFont

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


def save_vue_eclatee(file):
    """
    Save the vue éclatée image AND a clean _original copy.
    myimage.png  → saved normally (will be overwritten by annotations)
    myimage_original.png → stays clean forever, used by the editor
    Returns the path of the main file: uploads/myimage.png
    """
    if not file or not file.filename:
        return None

    filename = secure_filename(file.filename)
    name, ext = os.path.splitext(filename)

    main_path     = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    original_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{name}_original{ext}")

    # Save the uploaded file
    file.save(main_path)

    # Copy immediately as the original (clean, no annotations)
    shutil.copy2(main_path, original_path)

    return f"uploads/{filename}"


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

    # ── Vue éclatée ──
    # If the image was already uploaded+annotated via the editor,
    # vue_eclatee_already_saved contains the filename — do NOT re-save,
    # otherwise the annotated version would be overwritten with the raw file.
    vue_already_saved = request.form.get("vue_eclatee_already_saved", "").strip()
    vue_file = request.files.get("vue_eclatee_image")

    if vue_already_saved:
        # Image already on disk (uploaded by editor) — just store the path
        data_fr["vue_eclatee_image"] = f"uploads/{vue_already_saved}"
    elif vue_file and vue_file.filename.strip():
        # Normal upload without editor — save file + create _original copy
        data_fr["vue_eclatee_image"] = save_vue_eclatee(vue_file)
    else:
        old = previous_images.get("vue_eclatee_image")
        if old:
            clean_old = old.replace("uploads/", "")
            data_fr["vue_eclatee_image"] = f"uploads/{clean_old}"
        else:
            data_fr["vue_eclatee_image"] = None

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

    # Compute the original image path from the main path (no DB column needed)
    # e.g. uploads/myimage.png → uploads/myimage_original.png
    vue = fr_dict.get("vue_eclatee_image")
    if vue:
        name, ext = os.path.splitext(vue)
        original_candidate = f"{name}_original{ext}"
        original_disk = os.path.join(app.root_path, "static", original_candidate)
        fr_dict["vue_eclatee_image_original"] = original_candidate if os.path.exists(original_disk) else vue
    else:
        fr_dict["vue_eclatee_image_original"] = None

    return jsonify({
        "fr": fr_dict,
        "en": dict(en) if en else None,
        "nl": dict(nl) if nl else None
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

    # ── Vue éclatée ──
    delete_vue        = request.form.get("delete_vue_eclatee_image")
    vue_already_saved = request.form.get("vue_eclatee_already_saved", "").strip()
    vue_file          = request.files.get("vue_eclatee_image")

    if delete_vue == "true":
        # User explicitly deleted the image
        data_fr["vue_eclatee_image"] = None
    elif vue_already_saved:
        # Image was already uploaded+annotated via the editor — do NOT re-save
        # otherwise the annotated version would be overwritten with the raw file
        data_fr["vue_eclatee_image"] = f"uploads/{vue_already_saved}"
    elif vue_file and vue_file.filename.strip():
        # New image uploaded without editor — save file + create _original copy
        data_fr["vue_eclatee_image"] = save_vue_eclatee(vue_file)
    else:
        # No change — keep existing image
        old = existing_fr["vue_eclatee_image"]
        data_fr["vue_eclatee_image"] = f"uploads/{old.replace('uploads/', '')}" if old else None

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


# -------------------- CREATE EXPLODED VIEW --------------------
@app.route('/create_exploded_view', methods=['POST'])
@app.route(f"{BASE_PATH}/create_exploded_view", methods=['POST'])
def create_exploded_view():
    file = request.files.get("vue_eclatee_image")
    base = get_base_url()

    if not file or file.filename == '':
        return jsonify({"error": "No image file provided"}), 400

    filename = secure_filename(file.filename)
    name, ext = os.path.splitext(filename)

    main_path     = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    original_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{name}_original{ext}")

    # Save uploaded file
    file.save(main_path)

    # Always create _original copy here so it exists before any annotation
    # This means add_fiche can skip re-saving and won't overwrite the annotated version
    shutil.copy2(main_path, original_path)

    return jsonify({
        "success": "Image uploaded! Opening editor...",
        "redirect": f"{base}/editor/{filename}",
        "filename": filename
    })


@app.route('/save_annotations', methods=['POST'])
@app.route(f"{BASE_PATH}/save_annotations", methods=['POST'])
def save_annotations():
    data = request.json
    filename = data['filename']
    annotations = data['annotations']

    # Always draw annotations ON TOP OF the original clean image,
    # then save the result to the main (non-original) file.
    # This ensures _original.png is NEVER touched after first upload.
    name, ext = os.path.splitext(filename)
    original_filename = f"{name}_original{ext}"
    original_path = os.path.join(app.config['UPLOAD_FOLDER'], original_filename)
    main_path     = os.path.join(app.config['UPLOAD_FOLDER'], filename)

    # Read from _original (clean) — NEVER from main file (already annotated)
    # Load fully into memory then close file handle immediately so nothing gets overwritten
    source_path = original_path if os.path.exists(original_path) else main_path

    with Image.open(source_path) as raw:
        source_img = raw.copy()   # fully loaded in memory, file handle released

    scale = 4
    width = 700
    height = 900
    high_width  = width  * scale
    high_height = height * scale

    output_img = Image.new("RGB", (high_width, high_height), "white")
    bg = source_img.resize((high_width, high_height), Image.LANCZOS)
    output_img.paste(bg, (0, 0))
    source_img.close()

    draw = ImageDraw.Draw(output_img)

    def make_perfect_circle(size, upscale=8):
        big = size * upscale
        circle_img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
        circle_draw = ImageDraw.Draw(circle_img)
        circle_draw.ellipse((0, 0, big - 1, big - 1), fill="black")
        return circle_img.resize((size, size), Image.LANCZOS)

    big_circle_radius = 20 * scale
    big_circle = make_perfect_circle(big_circle_radius * 2)

    font_size = 20 * scale
    font = None
    font_paths = [
        "arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        os.path.join(app.root_path, "static/fonts/TECNIBO-DISPLAY.otf")
    ]
    for path in font_paths:
        try:
            font = ImageFont.truetype(path, font_size)
            break
        except OSError:
            continue
    if font is None:
        font = ImageFont.load_default()

    start_line_pos = 50
    small_circle_radius = 3

    for ann in annotations:
        line_start = (start_line_pos if ann['side'] == 'left' else width - start_line_pos) * scale
        ann_x = int(ann['x'] * scale)
        ann_y = int(ann['y'] * scale)

        draw.line([(line_start, ann_y), (ann_x, ann_y)], fill="black", width=scale)

        small_r = small_circle_radius * scale
        draw.ellipse([ann_x - small_r, ann_y - small_r, ann_x + small_r, ann_y + small_r], fill="black")

        output_img.paste(big_circle,
                         (int(line_start - big_circle_radius), int(ann_y - big_circle_radius)),
                         big_circle)

        draw.text((line_start, ann_y), str(ann['id']), fill="white", anchor="mm", font=font)

    # Save annotated result to main file ONLY — _original is never overwritten
    output_img.save(main_path, dpi=(300, 300))

    return jsonify({'success': True, 'image_path': f"uploads/{filename}"})


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