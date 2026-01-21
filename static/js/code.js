function validateMainImage(event, previewId, requiredWidth, requiredHeight) {
    const fileInput = event.target;
    const file = fileInput.files[0];
    const preview = document.getElementById(previewId);
    const error = document.getElementById(previewId.replace('_preview', '_error'));

    if (file) {
        const img = new Image();
        img.onload = function () {
            console.log("Loaded dimensions:", img.width, img.height); // DEBUG

            if (img.width === requiredWidth && img.height === requiredHeight) {
                preview.src = URL.createObjectURL(file);
                preview.style.display = "block";
                error.style.display = "none";
            } else {
                fileInput.value = '';
                preview.style.display = "none";
                error.style.display = "block";
            }
        };
        img.src = URL.createObjectURL(file);
    }
}
function validateMultipleImages(event, previewId, errorId, requiredWidth, requiredHeight) {
    const previewContainer = document.getElementById(previewId);
    const errorMsg = document.getElementById(errorId);
    previewContainer.innerHTML = '';
    errorMsg.style.display = 'none';

    const files = event.target.files;
    if (files.length === 0) return;

    let valid = true;
    let loadedCount = 0;

    // Check all images asynchronously:
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const img = new Image();
        img.onload = function () {
            loadedCount++;
            if (!(img.width === requiredWidth && img.height === requiredHeight)) {
                valid = false;
            }

            if (loadedCount === files.length) {
                if (valid) {
                    // Show all previews:
                    for (let j = 0; j < files.length; j++) {
                        const previewImg = document.createElement('img');
                        previewImg.src = URL.createObjectURL(files[j]);
                        previewImg.onload = () => URL.revokeObjectURL(previewImg.src);
                        previewContainer.appendChild(previewImg);
                    }
                    errorMsg.style.display = 'none';
                } else {
                    event.target.value = ''; // reset input
                    previewContainer.innerHTML = '';
                    errorMsg.style.display = 'block';
                }
            }
        };
        img.src = URL.createObjectURL(file);
    }
}



function updatePorte(id) {
    window.location.href = "/update/" + id;
}


