// static/js/gate-check.js

const GATE_API_PATH = '/api/cloudflare/access';  // Endpoint de validation
const GATE_COOKIE = 'cf_upload_gate';           // Nom du cookie
const REDIRECT_URL = 'https://backend.tecnibo.com/tools/fiches';  // URL du formulaire de token

// Fonction pour vérifier la présence du cookie
function hasGateCookie() {
    return document.cookie.includes(`${GATE_COOKIE}=`);
}

// Fonction pour valider le cookie via l'API
async function validateWithAPI() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 secondes de timeout

        const response = await fetch(GATE_API_PATH, {
            method: 'GET',
            credentials: 'include', // Pour envoyer les cookies
            signal: controller.signal,
            headers: {
                'Accept': 'application/json'
            }
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();
            return data.ok === true; // L'API retourne { ok: true } si valide
        }
        return false;
    } catch (error) {
        console.warn('Validation API error:', error);
        // En cas d'erreur (réseau ou timeout), on retourne false pour rediriger
        return false;
    }
}

// Fonction principale
async function ensureGateAccess() {
    // 1. Vérifier si le cookie est présent
    if (!hasGateCookie()) {
        console.log('Gate cookie not found, redirecting to token page');
        redirectToTokenPage();
        return false;
    }

    // 2. Valider le cookie via l'API
    const isValid = await validateWithAPI();
    if (!isValid) {
        console.log('Gate cookie validation failed, redirecting to token page');
        redirectToTokenPage();
        return false;
    }

    console.log('Gate access validated');
    return true;
}

// Redirection vers la page de token
function redirectToTokenPage() {
    // Sauvegarder l'URL actuelle pour une éventuelle redirection après login
    const currentUrl = window.location.href;
    if (currentUrl !== REDIRECT_URL) {
        sessionStorage.setItem('redirectAfterLogin', currentUrl);
    }
    window.location.href = REDIRECT_URL;
}

// Initialisation
async function initGateCheck() {
    // Cacher l'overlay après un certain temps (par exemple 2 secondes) pour éviter qu'il reste bloqué
    const maxDelay = 2000;
    const timeoutId = setTimeout(() => {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }, maxDelay);

    // Exécuter la vérification
    try {
        const accessGranted = await ensureGateAccess();
        if (accessGranted) {
            // Cacher l'overlay immédiatement
            clearTimeout(timeoutId);
            const overlay = document.getElementById('loadingOverlay');
            if (overlay) {
                overlay.style.display = 'none';
            }
        } else {
            // La redirection a déjà été faite par ensureGateAccess
            clearTimeout(timeoutId);
        }
    } catch (error) {
        console.error('Gate check initialization error:', error);
        clearTimeout(timeoutId);
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
        // En cas d'erreur, on pourrait rediriger ou laisser l'utilisateur sur la page avec un message
        // Ici, on redirige par précaution
        redirectToTokenPage();
    }
}

// Démarrer la vérification quand le DOM est chargé
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGateCheck);
} else {
    initGateCheck();
}