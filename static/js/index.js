// ============================================
// BASE PATH HELPER
// ============================================
const getBasePath = () => {
    return (typeof window !== 'undefined' && window.location.pathname.startsWith('/tools/fiches'))
        ? '/tools/fiches'
        : '';
};

// ============================================
// PDF DOWNLOAD
// ============================================
const downloadBtn = document.getElementById("downloadBtn");
if (downloadBtn) {
    downloadBtn.addEventListener("click", function() {
        window.print();
    });
}

// ============================================
// RETURN TO HOME BUTTON - FIXED VERSION
// ============================================
const retourBtn = document.getElementById("retourBtn");
if (retourBtn) {
    retourBtn.addEventListener("click", function() {
        const base = getBasePath();
        const type = this.getAttribute('data-type') || 'Cloison';
        const cpid = this.getAttribute('data-cpid') || '';

        console.log('🔙 Return button clicked');
        console.log('Type:', type);
        console.log('CPID:', cpid);
        console.log('Base path:', base);

        let url = `${base}/`;
        const params = [];

        if (type) {
            params.push(`type=${encodeURIComponent(type)}`);
        }
        if (cpid) {
            params.push(`cpid=${encodeURIComponent(cpid)}`);
        }

        if (params.length > 0) {
            url += '?' + params.join('&');
        }

        console.log('➡️ Redirecting to:', url);
        window.location.href = url;
    });
}

// ============================================
// DOM CONTENT LOADED - TEXT FORMATTING
// ============================================
document.addEventListener("DOMContentLoaded", function () {

    // ============================================
    // TITLE FONT SIZE ADJUSTMENT
    // ============================================
    document.querySelectorAll('.title').forEach(el => {
        // Remove spaces before counting characters
        const textLength = el.textContent.replace(/\s+/g, '').length;

        const fontSizes = {
            12: 80, 13: 74, 14: 70, 15: 63, 16: 60, 17: 55,
            18: 52, 19: 49, 20: 47, 21: 45, 22: 43,
            23: 41, 24: 39, 25: 37
        };

        const fontSize = fontSizes[textLength] || (textLength < 12 ? 80 : 37);
        el.style.fontSize = fontSize + "px";
    });

    // ============================================
    // DASH TEXT FORMATTING
    // ============================================
    // Select all elements that have the class "dash"
    const elements = document.querySelectorAll('.dash');

    elements.forEach(el => {
        let text = el.innerHTML.trim();

        // 1️⃣ Handle ". -" together → ONE line break
        text = text.replace(
            /\.\s*-\s*/g,
            "<br><br>- "
        );

        // 2️⃣ Sentence-ending dot (not decimals)
        text = text.replace(
            /(?<!\d)\.(?!\d)\s*/g,
            ".<br><br>"
        );

        // 3️⃣ Dash ONLY if it's a list dash (space before it)
        // Keeps words like "anti-panique" intact
        text = text.replace(
            /(?:^|\s)-\s+/g,
            "<br><br>- "
        );

        el.innerHTML = text;
    });

    // ============================================
    // DESCRIPTION FORMATTING
    // ============================================
    // Select all elements that have the class "dashDesc"
    document.querySelectorAll('.dashDesc').forEach(el => {
        const text = el.textContent.trim();

        const formatted = text.replace(
            /(?<!\d)\.(?!\d)\s*/g,
            ".<br>"
        );

        el.innerHTML = formatted;
    });

    // ============================================
    // HEADER MARGIN ADJUSTMENT
    // ============================================
    const headers = document.querySelectorAll(".header-right, .header-right2");
    headers.forEach(header => {
        const reference = header.querySelector(".CPID");
        const ficheProduit = header.querySelector(".FICHE");

        if (reference && ficheProduit) {
            const textLength = reference.textContent.trim().length;
            ficheProduit.style.marginRight = textLength > 12 ? "100px" : "121px";
        }
    });
});