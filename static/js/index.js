// PDF Download with error handling
const downloadBtn = document.getElementById("downloadBtn");
if (downloadBtn) {
downloadBtn.addEventListener("click", function() {
window.print();
});
}

// Return to home with error handling (prefix-aware)
const retourBtn = document.getElementById("retourBtn");
if (retourBtn) {
const base = (typeof window !== 'undefined' && window.location.pathname.startsWith('/tools/fiches'))
? '/tools/fiches'
: '';
retourBtn.addEventListener("click", function() {
window.location.href = `${base}/`;
});
}

// All DOMContentLoaded operations
document.addEventListener("DOMContentLoaded", function () {

document.querySelectorAll('.title').forEach(el => {

// 2️⃣ Dynamic font sizing
const textLength = el.textContent.trim().length;

const fontSizes = {
12: 85 ,13: 80, 14: 81, 15: 75, 16: 66, 17: 64,
18: 60, 19: 58, 20: 54, 21: 52, 22: 50,
23: 47, 24: 47, 25: 43
};

const fontSize = fontSizes[textLength] || (textLength < 12 ? 85 : 43);
el.style.fontSize = fontSize + "px";
});

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

// Select all elements that have the class "dashDesc"
document.querySelectorAll('.dashDesc').forEach(el => {
const text = el.textContent.trim();

const formatted = text.replace(
/(?<!\d)\.(?!\d)\s*/g,
".<br>"
);

el.innerHTML = formatted;
});

// 3. Adjust header margins
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