// ============================================
// GLOBAL VARIABLES FOR EDITOR
// ============================================
let editorCanvas, editorCtx;
let editorImage = null;
let editorAnnotations = [];
let editorFilename = '';
let nextAnnotationId = 1;
let isDragging = false;
let draggedAnnotation = null;

// Path of the currently loaded vue_eclatee_image (from DB)
let currentVueEclateeImage = null;

// ============================================
// BASE PATH HELPER
// ============================================
const getBasePath = () => {
    return (typeof window !== 'undefined' && window.location.pathname.startsWith('/tools/fiches'))
        ? '/tools/fiches'
        : '';
};

// ============================================
// HELPER: Build _original path from main path
// uploads/myimage.png  →  uploads/myimage_original.png
// ============================================
function buildOriginalPath(imagePath) {
    if (!imagePath) return null;
    const lastSlash = imagePath.lastIndexOf('/');
    const folder    = imagePath.substring(0, lastSlash + 1);       // "uploads/"
    const filename  = imagePath.substring(lastSlash + 1);          // "myimage.png"
    const dotIndex  = filename.lastIndexOf('.');
    if (dotIndex === -1) return imagePath + '_original';
    const name = filename.substring(0, dotIndex);                  // "myimage"
    const ext  = filename.substring(dotIndex);                     // ".png"
    return `${folder}${name}_original${ext}`;                      // "uploads/myimage_original.png"
}


// ============================================
// INITIALIZATION
// ============================================
window.addEventListener('DOMContentLoaded', function () {
    const base = getBasePath();

    // ===== EDITOR BUTTON =====
    const btnEdit = document.getElementById('btnEditImage');
    if (btnEdit) {
        btnEdit.addEventListener('click', function (e) {
            e.preventDefault();

            const fileInput = document.getElementById('imageUpload');

            // CASE 1: User just selected a NEW file → upload it and open editor
            if (fileInput && fileInput.files && fileInput.files[0]) {
                _uploadAndOpenEditor(fileInput.files[0], base);
                return;
            }

            // CASE 2: Existing fiche is loaded → open the _original clean image
            if (currentVueEclateeImage) {
                const originalPath = buildOriginalPath(currentVueEclateeImage);
                const originalSrc  = '/static/' + originalPath;

                // Editor will overwrite the main file (not the _original)
                const parts = currentVueEclateeImage.split('/');
                editorFilename = parts[parts.length - 1];

                _openEditorFromURL(originalSrc, base);
                return;
            }

            alert('Veuillez d\'abord sélectionner ou charger une image 700×900 px');
        });
    }

    // ===== REFERENCE DROPDOWN =====
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
                p.classList.remove('deleted');
                p.style.border = '';
                p.style.opacity = '1';
            });

            fetch(`${base}/get_fiche/${ref}`)
                .then(r => r.json())
                .then(data => {
                    if (loadingOverlay) loadingOverlay.classList.remove('active');
                    if (data.error) { alert('Erreur: ' + data.error); return; }

                    const fr = data.fr || {};
                    const en = data.en || {};
                    const nl = data.nl || {};

                    // Fill FR fields
                    for (const [k, v] of Object.entries(fr)) {
                        if (k === 'id' || k === 'langue' || k === 'type') continue;
                        const input = document.querySelector(`[name="${k}"]`);
                        if (input && input.type !== "file") input.value = v || "";
                    }
                    // Fill EN hidden fields
                    for (const [k, v] of Object.entries(en)) {
                        if (k === 'id' || k === 'langue' || k === 'type') continue;
                        const el = document.getElementById(k + "_en");
                        if (el) el.value = v || "";
                    }
                    // Fill NL hidden fields
                    for (const [k, v] of Object.entries(nl)) {
                        if (k === 'id' || k === 'langue' || k === 'type') continue;
                        const el = document.getElementById(k + "_nl");
                        if (el) el.value = v || "";
                    }

                    // Photo produit
                    _setImagePreview('photoPreview', fr.photo_produit);

                    // Vue éclatée: preview shows the SAVED/ANNOTATED image
                    _setImagePreview('explodedPreview', fr.vue_eclatee_image);

                    // Remember the main image path so editor can derive _original
                    currentVueEclateeImage = fr.vue_eclatee_image || null;

                    // Enable/disable Edit button
                    const btn = document.getElementById('btnEditImage');
                    if (btn) {
                        btn.disabled = !currentVueEclateeImage;
                        btn.title = currentVueEclateeImage
                            ? 'Éditer l\'image originale (sans annotations)'
                            : 'Aucune image à éditer';
                    }

                    // Technical drawings
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

    // ===== AUTO-SELECT FROM URL =====
    const urlParams  = new URLSearchParams(window.location.search);
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

    // ===== TYPE SWITCHING =====
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
// INTERNAL: SET IMAGE PREVIEW
// ============================================
function _setImagePreview(previewId, imagePath) {
    const img = document.getElementById(previewId);
    if (!img) return;
    if (imagePath) {
        img.src = '/static/' + imagePath + '?t=' + Date.now();
        img.classList.remove('d-none', 'deleted');
        img.style.border = '';
        img.style.opacity = '1';
    } else {
        img.src = '';
        img.classList.add('d-none');
        img.classList.remove('deleted');
        img.style.border = '';
        img.style.opacity = '1';
    }
}


// ============================================
// INTERNAL: UPLOAD NEW FILE AND OPEN EDITOR
// ============================================
function _uploadAndOpenEditor(file, base) {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.classList.add('active');

    const formData = new FormData();
    formData.append("vue_eclatee_image", file);

    fetch(`${base}/create_exploded_view`, { method: 'POST', body: formData })
        .then(r => r.json())
        .then(data => {
            if (loadingOverlay) loadingOverlay.classList.remove('active');
            if (data.success && data.redirect) {
                editorFilename = data.redirect.split('/').pop().split('?')[0];
                // Pre-set the already_saved field with the filename.
                // It will be confirmed/overwritten after saveEditorAnnotations succeeds.
                const alreadySavedInput = document.getElementById('vue_eclatee_already_saved');
                if (alreadySavedInput) alreadySavedInput.value = editorFilename;
                openEditorModal(file);
            } else {
                alert('Erreur: ' + (data.error || 'Unknown error'));
            }
        })
        .catch(error => {
            if (loadingOverlay) loadingOverlay.classList.remove('active');
            alert('Erreur lors du téléchargement: ' + error.message);
        });
}


// ============================================
// INTERNAL: OPEN EDITOR FROM _original URL
// ============================================
function _openEditorFromURL(imgSrc, base) {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.classList.add('active');

    fetch(imgSrc)
        .then(res => {
            if (!res.ok) throw new Error(`Image not found: ${imgSrc}`);
            return res.blob();
        })
        .then(blob => {
            if (loadingOverlay) loadingOverlay.classList.remove('active');

            const objectUrl = URL.createObjectURL(blob);
            const testImg   = new Image();

            testImg.onload = function () {
                if (testImg.width !== 700 || testImg.height !== 900) {
                    URL.revokeObjectURL(objectUrl);
                    alert(`L'image doit être 700×900 px (actuelle: ${testImg.width}×${testImg.height})`);
                    return;
                }
                const file = new File([blob], editorFilename, { type: blob.type || 'image/png' });
                openEditorModal(file);
                URL.revokeObjectURL(objectUrl);
            };
            testImg.onerror = function () {
                URL.revokeObjectURL(objectUrl);
                alert('Impossible de charger l\'image originale.');
            };
            testImg.src = objectUrl;
        })
        .catch(error => {
            if (loadingOverlay) loadingOverlay.classList.remove('active');
            alert('Image originale introuvable.\n\n' +
                  'Astuce: re-uploadez l\'image pour créer la copie originale.\n\n' +
                  'Détail: ' + error.message);
        });
}


// ============================================
// CLEAR FORM
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

    currentVueEclateeImage = null;
    const alreadySavedInput = document.getElementById('vue_eclatee_already_saved');
    if (alreadySavedInput) alreadySavedInput.value = '';
    const btn = document.getElementById('btnEditImage');
    if (btn) { btn.disabled = true; btn.title = 'Aucune image à éditer'; }
}


// ============================================
// IMAGE FUNCTIONS
// ============================================
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
        currentVueEclateeImage = null;
        // Also clear already_saved so a fresh upload won't be skipped
        const alreadySaved = document.getElementById('vue_eclatee_already_saved');
        if (alreadySaved) alreadySaved.value = '';
        const btn = document.getElementById('btnEditImage');
        if (btn) { btn.disabled = true; btn.title = 'Image supprimée'; }
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
                currentVueEclateeImage = null;
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
                // New file selected without editor — clear already_saved so server re-saves properly
                currentVueEclateeImage = null;
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
        const rw = index <= 5 ? 400 : 300;
        const rh = index <= 5 ? 300 : 940;
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
function openEditorModal(file) {
    const modal = document.getElementById('editorModal');
    if (!modal) return;
    modal.style.display = 'flex';

    editorCanvas = document.getElementById('editorCanvas');
    if (!editorCanvas) return;
    editorCtx = editorCanvas.getContext('2d');
    editorAnnotations = [];
    nextAnnotationId  = 1;

    const reader = new FileReader();
    reader.onload = function (e) {
        editorImage = new Image();
        editorImage.onload = function () { drawEditor(); };
        editorImage.src = e.target.result;
    };
    reader.readAsDataURL(file);

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
        editorCtx.fillStyle = 'white'; editorCtx.font = 'bold 20px Arial';
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
        isDragging = true;
        editorCanvas.style.cursor = 'move';
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
    const num  = prompt('Entrez le numéro d\'annotation:', nextAnnotationId);
    if (num === null || num.trim() === '') return;
    const id = parseInt(num);
    if (isNaN(id) || id < 1) { alert('Numéro invalide'); return; }
    editorAnnotations.push({ id, x, y, side });
    nextAnnotationId = Math.max(nextAnnotationId, id + 1);
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
        const did = editorAnnotations[idx].id;
        editorAnnotations.splice(idx, 1); drawEditor();
        const s = document.getElementById('editorStatus');
        if (s) s.textContent = `${editorAnnotations.length} annotation(s) - Supprimé: ${did}`;
    }
    return false;
}

function clearAllAnnotations() {
    if (confirm('Supprimer toutes les annotations ?')) {
        editorAnnotations = []; nextAnnotationId = 1; drawEditor();
        const s = document.getElementById('editorStatus');
        if (s) s.textContent = '0 annotation(s)';
    }
}

function saveEditorAnnotations() {
    if (editorAnnotations.length === 0) { alert('Aucune annotation à enregistrer'); return; }
    const base = getBasePath();
    const s = document.getElementById('editorStatus');
    if (s) { s.textContent = '💾 Enregistrement...'; s.style.color = '#2196F3'; }

    fetch(`${base}/save_annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: editorFilename, annotations: editorAnnotations })
    })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                if (s) { s.textContent = '✔️ Enregistré!'; s.style.color = '#4CAF50'; }
                // Refresh annotated preview
                const preview = document.getElementById('explodedPreview');
                if (preview) {
                    preview.src = '/static/' + data.image_path + '?t=' + Date.now();
                    preview.classList.remove('d-none', 'deleted');
                    preview.style.border = ''; preview.style.opacity = '1';
                }
                // Update current path so next editor open uses _original again
                currentVueEclateeImage = data.image_path;
                const btn = document.getElementById('btnEditImage');
                if (btn) { btn.disabled = false; btn.title = 'Éditer l\'image originale (sans annotations)'; }

                // Tell add_fiche that this image is already on disk — do NOT re-upload
                const alreadySavedInput = document.getElementById('vue_eclatee_already_saved');
                if (alreadySavedInput) alreadySavedInput.value = editorFilename;

                setTimeout(() => closeEditor(), 800);
            } else {
                alert('Erreur: ' + (data.error || 'Unknown error'));
                if (s) { s.textContent = '❌ Erreur'; s.style.color = '#f44336'; }
            }
        })
        .catch(error => {
            alert('Erreur lors de l\'enregistrement: ' + error.message);
            if (s) { s.textContent = '❌ Erreur'; s.style.color = '#f44336'; }
        })
        .finally(() => setTimeout(() => {
            if (s) { s.textContent = ''; s.style.color = '#2196F3'; }
        }, 2000));
}


// ============================================
// NAVIGATION
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
// TRANSLATION MODAL
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
});