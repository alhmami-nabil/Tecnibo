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

// ============================================
// INITIALIZATION - RUNS ONCE
// ============================================

window.addEventListener('DOMContentLoaded', function() {
    console.log('🟢 DOMContentLoaded - Initializing...');

    // ===== EDITOR BUTTON =====
    const btnEdit = document.getElementById('btnEditImage');
    if (btnEdit) {
        btnEdit.addEventListener('click', function(e) {
            e.preventDefault();
            const fileInput = document.getElementById('imageUpload');
            const file = fileInput.files[0];

            if (!file) {
                alert('Veuillez d\'abord sélectionner une image');
                return;
            }

            const loadingOverlay = document.getElementById('loadingOverlay');
            if (loadingOverlay) loadingOverlay.classList.add('active');

            const formData = new FormData();
            formData.append("vue_eclatee_image", file);

            fetch('/create_exploded_view', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (loadingOverlay) loadingOverlay.classList.remove('active');

                if (data.success && data.redirect) {
                    editorFilename = data.redirect.split('/').pop().split('?')[0];
                    openEditorModal(file);
                } else {
                    alert('Erreur: ' + (data.error || 'Unknown error'));
                }
            })
            .catch(error => {
                if (loadingOverlay) loadingOverlay.classList.remove('active');
                console.error('Error:', error);
                alert('Erreur lors du téléchargement: ' + error.message);
            });
        });
    }

    // ===== REFERENCE DROPDOWN =====
    const updateRefSelect = document.getElementById("updateRef");
    if (updateRefSelect) {
        updateRefSelect.addEventListener("change", function() {
            const ref = this.value;
            console.log('📝 Reference selected:', ref);

            if (!ref) {
                clearForm();
                return;
            }

            const previousRefInput = document.getElementById("previous_ref");
            if (previousRefInput) previousRefInput.value = ref;

            const loadingOverlay = document.getElementById('loadingOverlay');
            if (loadingOverlay) loadingOverlay.classList.add('active');

            // Reset deletion marks
            document.querySelectorAll('input[name^="delete_"]').forEach(input => {
                input.value = "false";
            });

            document.querySelectorAll('.preview').forEach(preview => {
                preview.classList.remove('deleted');
                preview.style.border = '';
            });

            fetch(`/get_fiche/${ref}`)
                .then(r => r.json())
                .then(data => {
                    if (loadingOverlay) loadingOverlay.classList.remove('active');

                    if (data.error) {
                        console.error("Error loading fiche:", data.error);
                        alert('Erreur: ' + data.error);
                        return;
                    }

                    const fr = data.fr || {};
                    const nl = data.nl || {};

                    console.log('✅ Loaded FR data:', fr);
                    console.log('✅ Loaded NL data:', nl);

                    /* ------------------------
                       FILL FR FIELDS
                    ------------------------ */
                    for (const [k, v] of Object.entries(fr)) {
                        if (k === 'id' || k === 'langue' || k === 'type') continue;

                        const input = document.querySelector(`[name="${k}"]`);
                        if (input && input.type !== "file") {
                            input.value = v || "";
                        }
                    }

                    /* ------------------------
                       FILL NL HIDDEN FIELDS
                    ------------------------ */
                    for (const [k, v] of Object.entries(nl)) {
                        if (k === 'id' || k === 'langue' || k === 'type') continue;

                        const inputNL = document.getElementById(k + "_nl");
                        if (inputNL) {
                            inputNL.value = v || "";
                            console.log(`Set ${k}_nl = ${v}`);
                        }
                    }

                    /* ------------------------
                       IMAGES (FR ONLY)
                    ------------------------ */
                    if (fr.photo_produit) {
                        const img = document.getElementById('photoPreview');
                        if (img) {
                            img.src = '/static/' + fr.photo_produit;
                            img.classList.remove('d-none');
                        }
                    } else {
                        const img = document.getElementById('photoPreview');
                        if (img) {
                            img.src = '';
                            img.classList.add('d-none');
                        }
                    }

                    if (fr.vue_eclatee_image) {
                        const img = document.getElementById('explodedPreview');
                        if (img) {
                            img.src = '/static/' + fr.vue_eclatee_image;
                            img.classList.remove('d-none');
                        }
                    } else {
                        const img = document.getElementById('explodedPreview');
                        if (img) {
                            img.src = '';
                            img.classList.add('d-none');
                        }
                    }

                    /* ------------------------
                       TECHNICAL DRAWINGS
                    ------------------------ */
                    for (let i = 1; i <= 6; i++) {
                        const dessin = fr['dessin_technique_' + i];
                        const img = document.getElementById('dessinPreview' + i);

                        if (dessin && img) {
                            img.src = '/static/' + dessin;
                            img.classList.remove('d-none');
                        } else if (img) {
                            img.src = '';
                            img.classList.add('d-none');
                        }
                    }
                })
                .catch(err => {
                    console.error("Fetch error:", err);
                    if (loadingOverlay) loadingOverlay.classList.remove('active');
                    alert('Erreur de chargement: ' + err.message);
                });
        });
    }

    // ===== AUTO-SELECT FROM URL =====
    const urlParams = new URLSearchParams(window.location.search);
    const refFromUrl = urlParams.get('ref');

    if (refFromUrl && updateRefSelect) {
        console.log('🔗 Auto-selecting reference from URL:', refFromUrl);
        updateRefSelect.value = refFromUrl;
        updateRefSelect.dispatchEvent(new Event('change'));
    }

    // ===== TYPE SWITCHING =====
    const typeCloison = document.getElementById('typeCloison');
    const typePorte = document.getElementById('typePorte');
    const base = window.location.pathname.startsWith('/tools/fiches')
  ? '/tools/fiches'
  : '';

    if (typeCloison) {
        typeCloison.addEventListener('change', function() {
            if (this.checked) {
                window.location.href = `${base}/?type=Cloison`;
            }
        });
    }

    if (typePorte) {
        typePorte.addEventListener('change', function() {
            if (this.checked) {
                window.location.href = `${base}/?type=Porte`;
            }
        });
    }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function clearForm() {
    console.log('🧹 Clearing form...');

    // Clear all text inputs and textareas except updateRef
    document.querySelectorAll('input[type="text"], input[type="hidden"][name$="_nl"], textarea').forEach(input => {
        if (input.id !== 'updateRef' && input.name !== 'type') {
            input.value = '';
        }
    });

    // Clear all previews
    document.querySelectorAll('.preview').forEach(img => {
        img.src = '';
        img.classList.add('d-none');
        img.classList.remove('deleted');
        img.style.border = '';
    });

    // Reset deletion flags
    document.querySelectorAll('input[name^="delete_"]').forEach(input => {
        input.value = 'false';
    });

    // Clear file inputs
    document.querySelectorAll('input[type="file"]').forEach(input => {
        input.value = '';
    });

    const previousRef = document.getElementById('previous_ref');
    if (previousRef) previousRef.value = '';
}

// ============================================
// IMAGE FUNCTIONS
// ============================================

function markImageForDeletion(fieldName, previewId) {
    const confirmed = confirm('Êtes-vous sûr de vouloir supprimer cette image ?');
    if (!confirmed) return;

    const deleteInput = document.getElementById(`delete_${fieldName}`);
    if (deleteInput) {
        deleteInput.value = "true";
        console.log(`Marked ${fieldName} for deletion`);
    }

    const preview = document.getElementById(previewId);
    if (preview) {
        preview.classList.add('deleted');
        preview.style.border = '3px solid red';
        preview.style.opacity = '0.5';
    }

    const fileInput = document.querySelector(`input[name="${fieldName}"]`);
    if (fileInput && fileInput.type === 'file') {
        fileInput.value = '';
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
            preview.style.border = '';
            preview.style.opacity = '1';

            const deleteInput = document.getElementById(`delete_${input.name}`);
            if (deleteInput) deleteInput.value = "false";
        };
        reader.readAsDataURL(input.files[0]);
    } else {
        preview.src = '';
        preview.classList.add('d-none');
    }
}

function handleImageUpload(input) {
    const file = input.files[0];
    const errorDiv = document.getElementById('imgError');
    const preview = document.getElementById('explodedPreview');

    if (!file) {
        if (errorDiv) errorDiv.style.display = "none";
        return;
    }

    const img = new Image();
    const reader = new FileReader();

    reader.onload = function(e) {
        img.src = e.target.result;
        img.onload = function() {
            if (img.width !== 700 || img.height !== 900) {
                if (errorDiv) errorDiv.style.display = "block";
                input.value = "";
                if (preview) {
                    preview.src = "";
                    preview.classList.add('d-none');
                }
            } else {
                if (errorDiv) errorDiv.style.display = "none";
                if (preview) {
                    preview.src = e.target.result;
                    preview.classList.remove('d-none', 'deleted');
                    preview.style.border = '';
                    preview.style.opacity = '1';
                }

                const deleteInput = document.getElementById('delete_vue_eclatee_image');
                if (deleteInput) deleteInput.value = "false";
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
        const preview = document.getElementById(previewId);
        const errorMsg = document.getElementById(errorId);

        let requiredWidth, requiredHeight;

        if (index <= 5) {
            requiredWidth = 400;
            requiredHeight = 300;
        } else {
            requiredWidth = 300;
            requiredHeight = 940;
        }

        if (img.width !== requiredWidth || img.height !== requiredHeight) {
            if (errorMsg) {
                errorMsg.classList.remove('d-none');
                errorMsg.style.display = "block";
            }
            if (preview) {
                preview.classList.add("d-none");
                preview.src = "";
            }
            input.value = "";
            return;
        }

        if (errorMsg) {
            errorMsg.classList.add('d-none');
            errorMsg.style.display = "none";
        }

        if (preview) {
            preview.src = img.src;
            preview.classList.remove("d-none", "deleted");
            preview.style.border = '';
            preview.style.opacity = '1';
        }

        const deleteInput = document.getElementById(`delete_${input.name}`);
        if (deleteInput) deleteInput.value = "false";
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
    if (!editorCanvas) {
        console.error('Editor canvas not found');
        return;
    }

    editorCtx = editorCanvas.getContext('2d');

    editorAnnotations = [];
    nextAnnotationId = 1;

    const reader = new FileReader();
    reader.onload = function(e) {
        editorImage = new Image();
        editorImage.onload = function() {
            drawEditor();
        };
        editorImage.src = e.target.result;
    };
    reader.readAsDataURL(file);

    // Remove any existing listeners
    editorCanvas.onclick = null;
    editorCanvas.oncontextmenu = null;
    editorCanvas.onmousedown = null;
    editorCanvas.onmousemove = null;
    editorCanvas.onmouseup = null;

    // Add new listeners
    editorCanvas.onclick = handleEditorClick;
    editorCanvas.oncontextmenu = handleEditorRightClick;
    editorCanvas.onmousedown = handleMouseDown;
    editorCanvas.onmousemove = handleMouseMove;
    editorCanvas.onmouseup = handleMouseUp;
}

function closeEditor() {
    const modal = document.getElementById('editorModal');
    if (modal) modal.style.display = 'none';

    if (editorCanvas) {
        editorCanvas.onclick = null;
        editorCanvas.oncontextmenu = null;
        editorCanvas.onmousedown = null;
        editorCanvas.onmousemove = null;
        editorCanvas.onmouseup = null;
    }

    // Reset state
    isDragging = false;
    draggedAnnotation = null;
}

function drawEditor() {
    if (!editorImage || !editorCtx) return;

    editorCtx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
    editorCtx.drawImage(editorImage, 0, 0, 700, 900);

    editorAnnotations.forEach(ann => {
        const lineStart = ann.side === 'left' ? 50 : 650;

        // Draw line
        editorCtx.strokeStyle = 'black';
        editorCtx.lineWidth = 2;
        editorCtx.beginPath();
        editorCtx.moveTo(lineStart, ann.y);
        editorCtx.lineTo(ann.x, ann.y);
        editorCtx.stroke();

        // Draw small circle at annotation point
        editorCtx.fillStyle = 'black';
        editorCtx.beginPath();
        editorCtx.arc(ann.x, ann.y, 3, 0, Math.PI * 2);
        editorCtx.fill();

        // Draw big circle with number
        editorCtx.fillStyle = 'black';
        editorCtx.beginPath();
        editorCtx.arc(lineStart, ann.y, 20, 0, Math.PI * 2);
        editorCtx.fill();

        // Draw number
        editorCtx.fillStyle = 'white';
        editorCtx.font = 'bold 20px Arial';
        editorCtx.textAlign = 'center';
        editorCtx.textBaseline = 'middle';
        editorCtx.fillText(ann.id, lineStart, ann.y);
    });
}

function handleMouseDown(e) {
    const rect = editorCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicking on a small circle (annotation point)
    draggedAnnotation = editorAnnotations.find(ann => {
        const dist = Math.sqrt(Math.pow(x - ann.x, 2) + Math.pow(y - ann.y, 2));
        return dist <= 5;
    });

    if (draggedAnnotation) {
        isDragging = true;
        editorCanvas.style.cursor = 'move';
        e.preventDefault();
        e.stopPropagation();
    }
}

function handleMouseMove(e) {
    if (!isDragging || !draggedAnnotation) {
        // Show pointer when hovering over annotation points
        const rect = editorCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const isOverAnnotation = editorAnnotations.some(ann => {
            const dist = Math.sqrt(Math.pow(x - ann.x, 2) + Math.pow(y - ann.y, 2));
            return dist <= 5;
        });

        editorCanvas.style.cursor = isOverAnnotation ? 'pointer' : 'default';
        return;
    }

    const rect = editorCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    draggedAnnotation.x = Math.max(0, Math.min(700, x));
    draggedAnnotation.y = Math.max(0, Math.min(900, y));

    drawEditor();
    e.preventDefault();
}

function handleMouseUp() {
    if (isDragging) {
        isDragging = false;
        draggedAnnotation = null;
        editorCanvas.style.cursor = 'default';
    }
}

function handleEditorClick(e) {
    if (isDragging) return;

    const rect = editorCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicking on existing annotation point
    const clickedOnAnnotation = editorAnnotations.some(ann => {
        const dist = Math.sqrt(Math.pow(x - ann.x, 2) + Math.pow(y - ann.y, 2));
        return dist <= 5;
    });

    if (clickedOnAnnotation) return;

    // Add new annotation
    const side = x < 350 ? 'left' : 'right';
    const num = prompt('Entrez le numéro d\'annotation:', nextAnnotationId);
    if (num === null || num.trim() === '') return;

    const id = parseInt(num);
    if (isNaN(id) || id < 1) {
        alert('Numéro invalide');
        return;
    }

    // Check if ID already exists
    const existingAnnotation = editorAnnotations.find(ann => ann.id === id);
    if (existingAnnotation) {
        alert(`Le numéro ${id} existe déjà. Veuillez choisir un autre numéro.`);
        return;
    }

    editorAnnotations.push({ id, x, y, side });
    nextAnnotationId = Math.max(nextAnnotationId, id + 1);

    drawEditor();

    const statusEl = document.getElementById('editorStatus');
    if (statusEl) {
        statusEl.textContent = `${editorAnnotations.length} annotation(s)`;
    }
}

function handleEditorRightClick(e) {
    e.preventDefault();

    const rect = editorCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Find annotation to delete (clicking on big circle)
    const toDelete = editorAnnotations.findIndex(ann => {
        const lineStart = ann.side === 'left' ? 50 : 650;
        const dist = Math.sqrt(Math.pow(x - lineStart, 2) + Math.pow(y - ann.y, 2));
        return dist <= 20;
    });

    if (toDelete !== -1) {
        const deletedId = editorAnnotations[toDelete].id;
        editorAnnotations.splice(toDelete, 1);
        drawEditor();

        const statusEl = document.getElementById('editorStatus');
        if (statusEl) {
            statusEl.textContent = `${editorAnnotations.length} annotation(s) - Supprimé: ${deletedId}`;
        }
    }

    return false;
}

function clearAllAnnotations() {
    if (confirm('Supprimer toutes les annotations ?')) {
        editorAnnotations = [];
        nextAnnotationId = 1;
        drawEditor();

        const statusEl = document.getElementById('editorStatus');
        if (statusEl) {
            statusEl.textContent = '0 annotation(s)';
        }
    }
}

function saveEditorAnnotations() {
    if (editorAnnotations.length === 0) {
        alert('Aucune annotation à enregistrer');
        return;
    }

    const statusEl = document.getElementById('editorStatus');
    if (statusEl) {
        statusEl.textContent = '💾 Enregistrement...';
        statusEl.style.color = '#2196F3';
    }

    fetch('/save_annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            filename: editorFilename,
            annotations: editorAnnotations
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (statusEl) {
                statusEl.textContent = '✔️ Enregistré!';
                statusEl.style.color = '#4CAF50';
            }

            const preview = document.getElementById('explodedPreview');
            if (preview) {
                preview.src = '/static/' + data.image_path + '?t=' + Date.now();
                preview.classList.remove('d-none');
            }

            setTimeout(() => closeEditor(), 800);
        } else {
            alert('Erreur: ' + (data.error || 'Unknown error'));
            if (statusEl) {
                statusEl.textContent = '❌ Erreur';
                statusEl.style.color = '#f44336';
            }
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Erreur lors de l\'enregistrement: ' + error.message);
        if (statusEl) {
            statusEl.textContent = '❌ Erreur';
            statusEl.style.color = '#f44336';
        }
    })
    .finally(() => {
        setTimeout(() => {
            if (statusEl) {
                statusEl.textContent = '';
                statusEl.style.color = '#2196F3';
            }
        }, 2000);
    });
}

// ============================================
// NAVIGATION
// ============================================

function GOficheTechnique() {
    const cpid = document.getElementById("updateRef").value;
    if (!cpid) {
        alert('Sélectionnez une CPID');
        return;
    }
    window.location.href = `/index?cpid=${cpid}`;
}

function confirmDelete() {
    const ref = document.getElementById("updateRef").value;
    if (!ref) {
        alert('Sélectionnez une CPID à supprimer');
        return;
    }

    if (confirm(`Êtes-vous sûr de vouloir supprimer la fiche "${ref}" (versions FR et NL) ?`)) {
        const form = document.createElement("form");
        form.method = "POST";
        form.action = "/delete_fiche";

        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "deleteRef";
        input.value = ref;

        const typeInput = document.createElement("input");
        typeInput.type = "hidden";
        typeInput.name = "type";
        const checkedType = document.querySelector('input[name="type"]:checked');
        typeInput.value = checkedType ? checkedType.value : 'Cloison';

        form.appendChild(input);
        form.appendChild(typeInput);
        document.body.appendChild(form);
        form.submit();
    }
}