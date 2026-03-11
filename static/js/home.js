// ============================================
// GLOBAL VARIABLES FOR EDITOR
// ============================================
let editorCanvas, editorCtx;
let editorImage = null;
let editorAnnotations = [];        // annotations in memory
let editorFilename = '';           // SVG filename on server (only set for existing SVGs)
let nextAnnotationId = 1;
let isDragging = false;
let draggedAnnotation = null;

// true = user has edited annotations, SVG must be written before form submit
let editorDirty = false;

// For NEW image uploads: hold the raw File object in memory.
// Nothing is sent to the server until the form is submitted.
let pendingImageFile = null;       // File object waiting to be uploaded
let pendingImageDataUrl = null;    // dataURL for the canvas preview

let currentVueEclateeImage = null;

const getBasePath = () => {
    return (typeof window !== 'undefined' && window.location.pathname.startsWith('/tools/fiches'))
        ? '/tools/fiches' : '';
};

// ============================================
// DOMContentLoaded
// ============================================
window.addEventListener('DOMContentLoaded', function () {
    const base = getBasePath();

    // ── Éditer button ──
    const btnEdit = document.getElementById('btnEditImage');
    if (btnEdit) {
        btnEdit.addEventListener('click', function (e) {
            e.preventDefault();
            const fileInput = document.getElementById('imageUpload');

            if (fileInput && fileInput.files && fileInput.files[0]) {
                // New file selected: open editor locally — NO server call yet
                _openNewImageInEditor(fileInput.files[0]);
                return;
            }
            if (currentVueEclateeImage) {
                // Existing SVG on server: load image + annotations into editor
                _openEditorFromSVG(currentVueEclateeImage, base);
                return;
            }
            alert("Veuillez d'abord sélectionner ou charger une image 700×900 px");
        });
    }

    // ── Intercept form submit — flush SVG to server first if needed ──
    document.addEventListener('click', function (e) {
        const btn = e.target.closest('button[type="submit"], input[type="submit"]');
        if (!btn) return;
        const form = btn.form || document.getElementById('mainForm');
        if (!form) return;

        // Only intercept when there is something to save
        if (!editorDirty) return;
        if (!editorFilename && !pendingImageFile) return;

        e.preventDefault();
        e.stopImmediatePropagation();

        const formAction = btn.getAttribute('formaction') || form.action;
        // Detect whether this is an add or update action so _flushAnnotationsToServer
        // reads the CPID from the correct field (#cpid for add, #updateRef for update)
        const submitAction = (typeof formAction === 'string' && formAction.includes('add_fiche'))
            ? 'add' : 'update';
        _flushAnnotationsToServer(base, submitAction, function () {
            if (formAction) form.action = formAction;
            form.submit();
        });
    }, true);

    // ── CPID dropdown change ──
    const updateRefSelect = document.getElementById("updateRef");
    if (updateRefSelect) {
        updateRefSelect.addEventListener("change", function () {
            const ref = this.value;
            if (!ref) { clearForm(); return; }
            const previousRefInput = document.getElementById("previous_ref");
            if (previousRefInput) previousRefInput.value = ref;
            const loadingOverlay = document.getElementById('loadingOverlay');
            if (loadingOverlay) loadingOverlay.classList.add('active');
            document.querySelectorAll('input[name^="delete_"]').forEach(i => i.value = "false");
            document.querySelectorAll('.preview').forEach(p => {
                p.classList.remove('deleted'); p.style.border = ''; p.style.opacity = '1';
            });
            _resetEditorState();

            fetch(`${base}/get_fiche/${ref}`)
                .then(r => r.json())
                .then(data => {
                    if (loadingOverlay) loadingOverlay.classList.remove('active');
                    if (data.error) { alert('Erreur: ' + data.error); return; }
                    const fr = data.fr || {}, en = data.en || {}, nl = data.nl || {};
                    for (const [k, v] of Object.entries(fr)) {
                        if (k === 'id' || k === 'langue' || k === 'type') continue;
                        const input = document.querySelector(`[name="${k}"]`);
                        if (input && input.type !== "file") input.value = v || "";
                    }
                    for (const [k, v] of Object.entries(en)) {
                        if (k === 'id' || k === 'langue' || k === 'type') continue;
                        const el = document.getElementById(k + "_en");
                        if (el) el.value = v || "";
                    }
                    for (const [k, v] of Object.entries(nl)) {
                        if (k === 'id' || k === 'langue' || k === 'type') continue;
                        const el = document.getElementById(k + "_nl");
                        if (el) el.value = v || "";
                    }
                    _setImagePreview('photoPreview', fr.photo_produit);
                    _setImagePreview('explodedPreview', fr.vue_eclatee_image);
                    _setImagePreview('dessinPreviewVariant', fr.variant_image);
                    currentVueEclateeImage = fr.vue_eclatee_image || null;
                    if (currentVueEclateeImage) {
                        const parts = currentVueEclateeImage.split('/');
                        editorFilename = parts[parts.length - 1];
                    }
                    const btn = document.getElementById('btnEditImage');
                    if (btn) {
                        btn.disabled = !currentVueEclateeImage;
                        btn.title = currentVueEclateeImage ? 'Éditer les annotations' : 'Aucune image à éditer';
                    }
                    for (let i = 1; i <= 6; i++) {
                        _setImagePreview('dessinPreview' + i, fr['dessin_technique_' + i]);
                    }
                })
                .catch(err => {
                    if (loadingOverlay) loadingOverlay.classList.remove('active');
                    alert('Erreur de chargement: ' + err.message);
                });
        });
    }

    const urlParams = new URLSearchParams(window.location.search);
    const cpidFromUrl = urlParams.get('cpid');
    if (cpidFromUrl && updateRefSelect) {
        updateRefSelect.value = cpidFromUrl;
        const selectedValueEl = document.getElementById('selectedValue');
        if (selectedValueEl) selectedValueEl.textContent = cpidFromUrl;
        document.querySelectorAll('.dropdown-item-custom').forEach(item => {
            item.classList.toggle('selected', item.dataset.value === cpidFromUrl);
        });
        updateRefSelect.dispatchEvent(new Event('change'));
    }

    const typeCloison = document.getElementById('typeCloison');
    const typePorte   = document.getElementById('typePorte');
    if (typeCloison) typeCloison.addEventListener('change', function () {
        if (this.checked) window.location.href = `${base}/?type=Cloison`;
    });
    if (typePorte) typePorte.addEventListener('change', function () {
        if (this.checked) window.location.href = `${base}/?type=Porte`;
    });
});

// ============================================
// Reset all editor state
// ============================================
function _resetEditorState() {
    editorAnnotations    = [];
    editorFilename       = '';
    editorDirty          = false;
    nextAnnotationId     = 1;
    pendingImageFile     = null;
    pendingImageDataUrl  = null;
    currentVueEclateeImage = null;
    const alreadySavedInput = document.getElementById('vue_eclatee_already_saved');
    if (alreadySavedInput) alreadySavedInput.value = '';
    const btn = document.getElementById('btnEditImage');
    if (btn) { btn.disabled = true; btn.title = 'Aucune image à éditer'; }
}

// ============================================
// Image preview helper
// ============================================
function _setImagePreview(previewId, imagePath) {
    const img = document.getElementById(previewId);
    if (!img) return;
    if (imagePath) {
        img.src = '/static/' + imagePath + '?t=' + Date.now();
        img.classList.remove('d-none', 'deleted');
        img.style.border = ''; img.style.opacity = '1';
    } else {
        img.src = ''; img.classList.add('d-none');
        img.classList.remove('deleted');
        img.style.border = ''; img.style.opacity = '1';
    }
}

// ============================================
// Get current CPID
// action: 'add'    → read from #cpid text input (new record)
//         'update' → read from #updateRef dropdown (existing record)
//         null     → auto-detect: prefer #cpid if non-empty, else #updateRef
// ============================================
function _getCurrentCpid(action) {
    const cpidInput = document.getElementById('cpid');
    const updateRef = document.getElementById('updateRef');

    if (action === 'add') {
        // Adding a new record — the target CPID is always in the text input
        return cpidInput && cpidInput.value.trim() ? cpidInput.value.trim() : '';
    }
    if (action === 'update') {
        // Updating an existing record — CPID comes from the dropdown
        return updateRef && updateRef.value.trim() ? updateRef.value.trim() : '';
    }
    // Auto: if the user typed a new CPID in the text field, use it;
    // otherwise fall back to the dropdown selection.
    if (cpidInput && cpidInput.value.trim()) return cpidInput.value.trim();
    if (updateRef && updateRef.value.trim()) return updateRef.value.trim();
    return '';
}

// ============================================
// Open a NEW local image file directly in the editor.
// Reads the file as a dataURL — zero server calls.
// The file is stored in pendingImageFile for later upload.
// ============================================
function _openNewImageInEditor(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
        pendingImageFile    = file;
        pendingImageDataUrl = e.target.result;
        editorAnnotations   = [];
        editorDirty         = false;
        nextAnnotationId    = 1;
        // Open editor with the local dataURL — no SVG on server yet
        openEditorModal(pendingImageDataUrl, [], null);
    };
    reader.onerror = function () {
        alert("Impossible de lire le fichier image.");
    };
    reader.readAsDataURL(file);
}

// ============================================
// Open existing SVG from server in the editor.
// Loads image + existing annotations into memory — no server write.
//
// We do NOT compare CPIDs here because the user may not have typed the
// new CPID yet. The comparison happens in _flushAnnotationsToServer at
// submit time, when the final CPID is known for certain.
//
// We always extract and store:
//   - editorFilename   : original SVG basename (e.g. "A123456.svg")
//   - pendingImageDataUrl : the raw base64 image from inside the SVG
// That way _flushAnnotationsToServer can decide:
//   - same CPID  → update editorFilename in place (save_annotations)
//   - diff CPID  → create new SVG under new CPID (create_exploded_view_with_annotations)
// ============================================
function _openEditorFromSVG(svgPath, base) {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.classList.add('active');
    const parts = svgPath.split('/');
    editorFilename = parts[parts.length - 1]; // e.g. "A123456.svg" — original CPID's file

    // Always clear pendingImageFile — we will re-evaluate at flush time
    pendingImageFile    = null;
    pendingImageDataUrl = null;

    // Step 1: load existing annotations
    fetch(`${base}/get_svg_annotations/${svgPath}`)
        .then(r => r.json())
        .then(annData => {
            const existingAnnotations = annData.annotations || [];
            editorAnnotations = existingAnnotations.slice();
            nextAnnotationId  = editorAnnotations.length
                ? Math.max(...editorAnnotations.map(a => a.id)) + 1 : 1;
            editorDirty = false;

            // Step 2: fetch SVG content to extract the embedded source image
            return fetch(`/static/uploads/${editorFilename}?t=${Date.now()}`)
                .then(r => r.text())
                .then(svgText => {
                    if (loadingOverlay) loadingOverlay.classList.remove('active');

                    const parser = new DOMParser();
                    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
                    const imgEl  = svgDoc.getElementById('source-image');
                    let imgHref  = null;
                    if (imgEl) {
                        imgHref = imgEl.getAttribute('href') ||
                                  imgEl.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
                    }

                    // Store the raw image dataURL so _flushAnnotationsToServer can
                    // build a new SVG for a different CPID if needed at submit time.
                    if (imgHref && imgHref.startsWith('data:')) {
                        pendingImageDataUrl = imgHref;
                    }

                    // Open the editor — image is the extracted dataURL or the raw SVG
                    const imageSrc = imgHref || (() => {
                        const blob = new Blob([svgText], { type: 'image/svg+xml' });
                        return URL.createObjectURL(blob);
                    })();
                    openEditorModal(imageSrc, existingAnnotations, null);
                });
        })
        .catch(err => {
            if (loadingOverlay) loadingOverlay.classList.remove('active');
            alert('Erreur lors du chargement du SVG: ' + err.message);
        });
}

// ============================================
// Flush annotations to server just before form submit.
//
// Called with the final CPID already set in the form — this is the only
// place where we compare CPIDs to decide which server path to take.
//
// Three cases:
//
//   A) pendingImageFile set (brand-new file, never uploaded)
//      → POST /create_exploded_view_with_annotations
//        Server creates a new SVG named after the target CPID.
//
//   B) editorFilename set AND target CPID matches the SVG's CPID
//      (e.g. editing A123456 and saving as A123456)
//      → POST /save_annotations  — update the existing SVG in place.
//
//   C) editorFilename set BUT target CPID is DIFFERENT
//      (e.g. loaded A123456, changed CPID to A654321)
//      → extract image from pendingImageDataUrl, build a File blob,
//        POST /create_exploded_view_with_annotations with the new CPID.
//        The original A123456.svg is left untouched.
// ============================================
function _flushAnnotationsToServer(base, submitAction, callback) {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.classList.add('active');

    // Use submitAction to read CPID from the correct field:
    // 'add' → #cpid text input   |   'update' → #updateRef dropdown
    const cpid = _getCurrentCpid(submitAction);

    // Helper: derive expected SVG filename from a CPID string
    // (mirrors werkzeug's secure_filename: keep alphanum, dot, dash, underscore)
    function _cpidToSvgFilename(c) {
        return c.replace(/[^a-zA-Z0-9._-]/g, '_') + '.svg';
    }

    // ── Case A: brand-new image file (user picked a file, never uploaded) ──
    if (pendingImageFile) {
        const formData = new FormData();
        formData.append("vue_eclatee_image", pendingImageFile);
        formData.append("annotations", JSON.stringify(editorAnnotations));
        if (cpid) formData.append("cpid", cpid);

        fetch(`${base}/create_exploded_view_with_annotations`, { method: 'POST', body: formData })
            .then(r => r.json())
            .then(data => {
                if (loadingOverlay) loadingOverlay.classList.remove('active');
                if (data.success && data.filename) {
                    editorFilename      = data.filename;
                    editorDirty         = false;
                    pendingImageFile    = null;
                    pendingImageDataUrl = null;
                    const inp = document.getElementById('vue_eclatee_already_saved');
                    if (inp) inp.value = editorFilename;
                    callback();
                } else {
                    alert('Erreur lors de la création du SVG: ' + (data.error || 'Unknown'));
                }
            })
            .catch(err => {
                if (loadingOverlay) loadingOverlay.classList.remove('active');
                alert('Erreur: ' + err.message);
            });
        return;
    }

    if (!editorFilename) {
        // Nothing to flush
        if (loadingOverlay) loadingOverlay.classList.remove('active');
        callback();
        return;
    }

    // Determine whether target CPID matches the SVG we loaded
    const targetSvgFilename = cpid ? _cpidToSvgFilename(cpid) : editorFilename;
    const isSameCpid = (editorFilename === targetSvgFilename);

    if (isSameCpid) {
        // ── Case B: same CPID — update existing SVG annotations in place ──
        fetch(`${base}/save_annotations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: editorFilename, annotations: editorAnnotations })
        })
            .then(r => r.json())
            .then(data => {
                if (loadingOverlay) loadingOverlay.classList.remove('active');
                if (data.success) {
                    editorDirty = false;
                    const inp = document.getElementById('vue_eclatee_already_saved');
                    if (inp) inp.value = editorFilename;
                    callback();
                } else {
                    alert('Erreur: ' + (data.error || 'Unknown'));
                }
            })
            .catch(err => {
                if (loadingOverlay) loadingOverlay.classList.remove('active');
                alert('Erreur: ' + err.message);
            });

    } else {
        // ── Case C: different CPID — build a File blob from the stored dataURL
        //    and create a brand-new SVG named after the target CPID.
        //    The original SVG (editorFilename) is never modified.
        if (!pendingImageDataUrl || !pendingImageDataUrl.startsWith('data:')) {
            if (loadingOverlay) loadingOverlay.classList.remove('active');
            alert('Impossible de créer le SVG: image source introuvable en mémoire.');
            return;
        }

        const [header, b64] = pendingImageDataUrl.split(',');
        const mime   = header.split(':')[1].split(';')[0];
        const binary = atob(b64);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const imageFile = new File(
            [new Blob([bytes], { type: mime })],
            'image.' + (mime.split('/')[1] || 'png'),
            { type: mime }
        );

        const formData = new FormData();
        formData.append("vue_eclatee_image", imageFile);
        formData.append("annotations", JSON.stringify(editorAnnotations));
        if (cpid) formData.append("cpid", cpid);

        fetch(`${base}/create_exploded_view_with_annotations`, { method: 'POST', body: formData })
            .then(r => r.json())
            .then(data => {
                if (loadingOverlay) loadingOverlay.classList.remove('active');
                if (data.success && data.filename) {
                    editorFilename      = data.filename;
                    editorDirty         = false;
                    pendingImageFile    = null;
                    pendingImageDataUrl = null;
                    const inp = document.getElementById('vue_eclatee_already_saved');
                    if (inp) inp.value = editorFilename;
                    callback();
                } else {
                    alert('Erreur lors de la création du SVG: ' + (data.error || 'Unknown'));
                }
            })
            .catch(err => {
                if (loadingOverlay) loadingOverlay.classList.remove('active');
                alert('Erreur: ' + err.message);
            });
    }
}

// ============================================
// Form helpers
// ============================================
function clearForm() {
    document.querySelectorAll('input[type="text"], input[type="hidden"][name$="_nl"], input[type="hidden"][name$="_en"], textarea').forEach(input => {
        if (input.id !== 'updateRef' && input.name !== 'type') input.value = '';
    });
    document.querySelectorAll('.preview').forEach(img => {
        img.src = ''; img.classList.add('d-none'); img.classList.remove('deleted');
        img.style.border = ''; img.style.opacity = '1';
    });
    document.querySelectorAll('input[name^="delete_"]').forEach(i => i.value = 'false');
    document.querySelectorAll('input[type="file"]').forEach(i => i.value = '');
    const prev = document.getElementById('previous_ref');
    if (prev) prev.value = '';
    _resetEditorState();
}

function markImageForDeletion(fieldName, previewId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette image ?')) return;
    const del = document.getElementById(`delete_${fieldName}`);
    if (del) del.value = "true";
    const preview = document.getElementById(previewId);
    if (preview) {
        preview.classList.add('deleted');
        preview.style.border = '3px solid red';
        preview.style.opacity = '0.5';
    }
    const fileInput = document.querySelector(`input[name="${fieldName}"]`);
    if (fileInput && fileInput.type === 'file') fileInput.value = '';
    if (fieldName === 'vue_eclatee_image') {
        _resetEditorState();
    }
}

function previewImage(input, previewId) {
    const preview = document.getElementById(previewId);
    if (!preview) return;
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = e => {
            preview.src = e.target.result;
            preview.classList.remove('d-none', 'deleted');
            preview.style.border = ''; preview.style.opacity = '1';
            const del = document.getElementById(`delete_${input.name}`);
            if (del) del.value = "false";
        };
        reader.readAsDataURL(input.files[0]);
    } else {
        preview.src = ''; preview.classList.add('d-none');
    }
}

function handleImageUpload(input) {
    const file     = input.files[0];
    const errorDiv = document.getElementById('imgError');
    const preview  = document.getElementById('explodedPreview');
    const btn      = document.getElementById('btnEditImage');
    if (!file) { if (errorDiv) errorDiv.style.display = "none"; return; }
    const img    = new Image();
    const reader = new FileReader();
    reader.onload = function (e) {
        img.src = e.target.result;
        img.onload = function () {
            if (img.width !== 700 || img.height !== 900) {
                if (errorDiv) errorDiv.style.display = "block";
                input.value = "";
                if (preview) { preview.src = ""; preview.classList.add('d-none'); }
                if (btn) { btn.disabled = true; btn.title = 'Image invalide (700×900 px requis)'; }
                _resetEditorState();
            } else {
                if (errorDiv) errorDiv.style.display = "none";
                if (preview) {
                    preview.src = e.target.result;
                    preview.classList.remove('d-none', 'deleted');
                    preview.style.border = ''; preview.style.opacity = '1';
                }
                if (btn) { btn.disabled = false; btn.title = 'Éditer cette image'; }
                const del = document.getElementById('delete_vue_eclatee_image');
                if (del) del.value = "false";
                // Reset editor — new file, will open locally when Éditer is clicked
                editorAnnotations   = [];
                editorDirty         = false;
                pendingImageFile    = null;
                pendingImageDataUrl = null;
                currentVueEclateeImage = null;
                editorFilename = '';
                const alreadySaved = document.getElementById('vue_eclatee_already_saved');
                if (alreadySaved) alreadySaved.value = '';
            }
        };
    };
    reader.readAsDataURL(file);
}

function checkExactSize(input, previewId, errorId, index) {
    const file = input.files[0];
    if (!file) return;
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = function () {
        const preview  = document.getElementById(previewId);
        const errorMsg = document.getElementById(errorId);
        let rw, rh;
        if (index === 'variantes')          { rw = 300;  rh = 300; }
        else if (index === 'photo_produit') { rw = 1000; rh = 700; }
        else if (index <= 5)                { rw = 400;  rh = 300; }
        else                                { rw = 300;  rh = 940; }

        if (img.width !== rw || img.height !== rh) {
            if (errorMsg) { errorMsg.classList.remove('d-none'); errorMsg.style.display = "block"; }
            if (preview)  { preview.classList.add("d-none"); preview.src = ""; }
            input.value = ""; return;
        }
        if (errorMsg) { errorMsg.classList.add('d-none'); errorMsg.style.display = "none"; }
        if (preview)  {
            preview.src = img.src;
            preview.classList.remove("d-none", "deleted");
            preview.style.border = ''; preview.style.opacity = '1';
        }
        const del = document.getElementById(`delete_${input.name}`);
        if (del) del.value = "false";
    };
}

// ============================================
// EDITOR MODAL
// ============================================
function openEditorModal(imageSrc, existingAnnotations, onCleanup) {
    const modal = document.getElementById('editorModal');
    if (!modal) return;
    editorCanvas = document.getElementById('editorCanvas');
    if (!editorCanvas) return;
    editorCtx = editorCanvas.getContext('2d');

    editorAnnotations = existingAnnotations ? existingAnnotations.slice() : [];
    nextAnnotationId  = editorAnnotations.length
        ? Math.max(...editorAnnotations.map(a => a.id)) + 1 : 1;

    editorImage = new Image();
    editorImage.onload = function () {
        modal.style.display = 'flex';
        drawEditor();
        if (onCleanup) onCleanup();
        const s = document.getElementById('editorStatus');
        if (s) s.textContent = `${editorAnnotations.length} annotation(s)`;
    };
    editorImage.onerror = function () {
        if (onCleanup) onCleanup();
        alert("⚠️ Image introuvable. Veuillez re-uploader l'image.");
    };
    editorImage.src = imageSrc;

    editorCanvas.onclick       = handleEditorClick;
    editorCanvas.oncontextmenu = handleEditorRightClick;
    editorCanvas.onmousedown   = handleMouseDown;
    editorCanvas.onmousemove   = handleMouseMove;
    editorCanvas.onmouseup     = handleMouseUp;
}

function closeEditor() {
    const modal = document.getElementById('editorModal');
    if (modal) modal.style.display = 'none';
    if (editorCanvas) {
        editorCanvas.onclick = editorCanvas.oncontextmenu =
        editorCanvas.onmousedown = editorCanvas.onmousemove = editorCanvas.onmouseup = null;
    }
    isDragging = false; draggedAnnotation = null;
}

function drawEditor() {
    if (!editorImage || !editorCtx) return;
    editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
    editorCtx.drawImage(editorImage, 0, 0, 700, 900);
    editorAnnotations.forEach(ann => {
        const lineStart = ann.side === 'left' ? 50 : 650;
        editorCtx.strokeStyle = 'black'; editorCtx.lineWidth = 2;
        editorCtx.beginPath(); editorCtx.moveTo(lineStart, ann.y); editorCtx.lineTo(ann.x, ann.y); editorCtx.stroke();
        editorCtx.fillStyle = 'black';
        editorCtx.beginPath(); editorCtx.arc(ann.x, ann.y, 3, 0, Math.PI * 2); editorCtx.fill();
        editorCtx.beginPath(); editorCtx.arc(lineStart, ann.y, 20, 0, Math.PI * 2); editorCtx.fill();
        editorCtx.fillStyle = 'white'; editorCtx.font = 'bold 14px Arial';
        editorCtx.textAlign = 'center'; editorCtx.textBaseline = 'middle';
        editorCtx.fillText(ann.id, lineStart, ann.y);
    });
}

function handleMouseDown(e) {
    const rect = editorCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    draggedAnnotation = editorAnnotations.find(ann =>
        Math.sqrt(Math.pow(x - ann.x, 2) + Math.pow(y - ann.y, 2)) <= 5);
    if (draggedAnnotation) {
        isDragging = true; editorCanvas.style.cursor = 'move';
        e.preventDefault(); e.stopPropagation();
    }
}

function handleMouseMove(e) {
    const rect = editorCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (!isDragging || !draggedAnnotation) {
        editorCanvas.style.cursor = editorAnnotations.some(ann =>
            Math.sqrt(Math.pow(x - ann.x, 2) + Math.pow(y - ann.y, 2)) <= 5)
            ? 'pointer' : 'default';
        return;
    }
    draggedAnnotation.x = Math.max(0, Math.min(700, x));
    draggedAnnotation.y = Math.max(0, Math.min(900, y));
    drawEditor(); e.preventDefault();
}

function handleMouseUp() {
    if (isDragging) { isDragging = false; draggedAnnotation = null; editorCanvas.style.cursor = 'default'; }
}

function handleEditorClick(e) {
    if (isDragging) return;
    const rect = editorCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (editorAnnotations.some(ann =>
        Math.sqrt(Math.pow(x - ann.x, 2) + Math.pow(y - ann.y, 2)) <= 5)) return;
    const side = x < 350 ? 'left' : 'right';
    const num  = prompt("Entrez le numéro d'annotation:", nextAnnotationId);
    if (num === null || num.trim() === '') return;
    const id = parseInt(num);
    if (isNaN(id) || id < 1) { alert('Numéro invalide'); return; }
    editorAnnotations.push({ id, x, y, side });
    nextAnnotationId = Math.max(nextAnnotationId, id + 1);
    editorDirty = true;
    drawEditor();
    const s = document.getElementById('editorStatus');
    if (s) s.textContent = `${editorAnnotations.length} annotation(s)`;
}

function handleEditorRightClick(e) {
    e.preventDefault();
    const rect = editorCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const idx = editorAnnotations.findIndex(ann => {
        const ls = ann.side === 'left' ? 50 : 650;
        return Math.sqrt(Math.pow(x - ls, 2) + Math.pow(y - ann.y, 2)) <= 20;
    });
    if (idx !== -1) {
        editorAnnotations.splice(idx, 1);
        editorDirty = true;
        drawEditor();
        const s = document.getElementById('editorStatus');
        if (s) s.textContent = `${editorAnnotations.length} annotation(s)`;
    }
    return false;
}

function clearAllAnnotations() {
    if (confirm('Supprimer toutes les annotations ?')) {
        editorAnnotations = []; nextAnnotationId = 1; editorDirty = true;
        drawEditor();
        const s = document.getElementById('editorStatus');
        if (s) s.textContent = '0 annotation(s)';
    }
}

// ============================================
// "Enregistrer" in editor popup:
// Saves annotations IN MEMORY only. Updates preview from canvas.
// Actual SVG write happens only when the main form is submitted.
// ============================================
function saveEditorAnnotations() {
    // Update the preview thumbnail from canvas so user sees result immediately
    if (editorCanvas) {
        const preview = document.getElementById('explodedPreview');
        if (preview) {
            preview.src = editorCanvas.toDataURL('image/png');
            preview.classList.remove('d-none', 'deleted');
            preview.style.border = '2px solid #4CAF50';
            preview.style.opacity = '1';
            setTimeout(() => { if (preview) preview.style.border = ''; }, 2000);
        }
    }
    editorDirty = true;
    const s = document.getElementById('editorStatus');
    if (s) {
        s.textContent = '✔️ Prêt — cliquez "Mettre à jour" pour enregistrer définitivement';
        s.style.color = '#4CAF50';
    }
    setTimeout(() => closeEditor(), 900);
}

// ============================================
// Navigation / Delete
// ============================================
function GOficheTechnique() {
    const cpid = document.getElementById("updateRef").value;
    const base = getBasePath();
    if (!cpid) { alert('Sélectionnez une CPID'); return; }
    window.location.href = `${base}/index?cpid=${cpid}`;
}

function confirmDelete() {
    const ref = document.getElementById("updateRef").value;
    if (!ref) { alert('Sélectionnez une CPID à supprimer'); return; }
    if (confirm(`Êtes-vous sûr de vouloir supprimer la fiche "${ref}" (versions FR, EN et NL) ?`)) {
        const base = getBasePath();
        const form = document.createElement("form");
        form.method = "POST"; form.action = `${base}/delete_fiche`;
        const i1 = document.createElement("input"); i1.type="hidden"; i1.name="deleteRef"; i1.value=ref;
        const i2 = document.createElement("input"); i2.type="hidden"; i2.name="type";
        const ct = document.querySelector('input[name="type"]:checked');
        i2.value = ct ? ct.value : 'Cloison';
        form.appendChild(i1); form.appendChild(i2);
        document.body.appendChild(form); form.submit();
    }
}

// ============================================
// Translation modal + Searchable Dropdown
// ============================================
document.addEventListener('DOMContentLoaded', function () {
    const modalOverlay = document.getElementById('modalOverlay');
    const closeBtn     = document.getElementById('closeBtn');
    const ignoreBtn    = document.getElementById('ignoreBtn');
    const saveBtn      = document.getElementById('saveBtn');
    const modalTitle   = document.getElementById('modalTitle');
    const inputFR      = document.getElementById('trans_fr');
    const inputEN      = document.getElementById('trans_en');
    const inputNL      = document.getElementById('trans_nl');
    let currentField=null, currentInput=null, currentInputEN=null, currentInputNL=null;

    document.querySelectorAll('.o_field_translate').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            currentField   = this.dataset.field;
            currentInput   = document.querySelector(`[name="${currentField}"]`) || document.getElementById(currentField);
            currentInputEN = document.getElementById(currentField + '_en');
            currentInputNL = document.getElementById(currentField + '_nl');
            if (!currentInput) return;
            modalTitle.textContent = `Modifier : ${currentField}`;
            inputFR.value = currentInput.value || '';
            inputEN.value = currentInputEN ? (currentInputEN.value || '') : '';
            inputNL.value = currentInputNL ? (currentInputNL.value || '') : '';
            modalOverlay.classList.add('active');
        });
    });

    saveBtn.addEventListener('click', function () {
        if (currentInput)   currentInput.value   = inputFR.value;
        if (currentInputEN) currentInputEN.value  = inputEN.value;
        if (currentInputNL) currentInputNL.value  = inputNL.value;
        closeModal();
    });
    ignoreBtn.addEventListener('click', closeModal);
    closeBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && modalOverlay.classList.contains('active')) closeModal();
    });
    function closeModal() {
        modalOverlay.classList.remove('active');
        currentField=currentInput=currentInputEN=currentInputNL=null;
        inputFR.value=inputEN.value=inputNL.value='';
    }

    // ── Searchable Dropdown ──
    const dropdownHeader = document.getElementById('dropdownHeader');
    const dropdownMenu   = document.getElementById('dropdownMenu');
    const dropdownList   = document.getElementById('dropdownList');
    const selectedValue  = document.getElementById('selectedValue');
    const searchInput    = document.getElementById('searchInput');
    const hiddenSelect   = document.getElementById('updateRef');

    if (dropdownHeader) {
        dropdownHeader.addEventListener('click', () => {
            dropdownHeader.classList.toggle('active');
            dropdownMenu.classList.toggle('active');
            if (dropdownMenu.classList.contains('active')) searchInput.focus();
        });
        dropdownHeader.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dropdownHeader.click(); }
        });
    }
    if (dropdownList) {
        dropdownList.addEventListener('click', (e) => {
            const item = e.target.closest('.dropdown-item-custom');
            if (item) {
                document.querySelectorAll('.dropdown-item-custom').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                selectedValue.textContent = item.querySelector('span').textContent;
                hiddenSelect.value = item.dataset.value;
                if (item.dataset.value) { hiddenSelect.dispatchEvent(new Event('change')); }
                else { clearForm(); }
                dropdownHeader.classList.remove('active');
                dropdownMenu.classList.remove('active');
                searchInput.value = '';
                document.querySelectorAll('.dropdown-item-custom').forEach(i => i.style.display = 'flex');
            }
        });
    }
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('.dropdown-item-custom').forEach(item => {
                item.style.display = item.querySelector('span').textContent.toLowerCase().includes(term) ? 'flex' : 'none';
            });
        });
    }
    document.addEventListener('click', (e) => {
        if (dropdownHeader && !e.target.closest('.custom-dropdown')) {
            dropdownHeader.classList.remove('active');
            if (dropdownMenu) dropdownMenu.classList.remove('active');
        }
    });
    if (dropdownMenu) {
        dropdownMenu.addEventListener('click', (e) => {
            if (e.target !== searchInput && !e.target.closest('.dropdown-item-custom')) e.stopPropagation();
        });
    }
});