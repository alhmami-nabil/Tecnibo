// static/js/gate-check.js
const GATE_ORIGIN = 'https://backend.tecnibo.com/api';
const GATE_API_PATH = '/cloudflare/access';
const GATE_COOKIE = 'cf_upload_gate';
const REDIRECT_URL = 'https://backend.tecnibo.com/';
const TOOLS_URL = 'https://backend.tecnibo.com/tools/fiches';

/**
 * Check if the gate cookie exists
 * @returns {boolean}
 */
function hasGateCookie() {
    return document.cookie.split(';').some(c => c.trim().startsWith(`${GATE_COOKIE}=`));
}

/**
 * Ensure the user has valid gate access
 * @param {string} nextUrl - URL to redirect to after validation
 * @returns {Promise<boolean>}
 */
async function ensureGateAccess(nextUrl = window.location.href) {
    // First check: does the cookie exist?
    if (!hasGateCookie()) {
        console.log('Gate cookie not found, redirecting...');
        window.location.href = REDIRECT_URL;
        return false;
    }

    // Second check: validate with API
    try {
        const res = await fetch(`${GATE_ORIGIN}${GATE_API_PATH}`, {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
        });

        const data = await res.json().catch(() => null);

        // If validation successful, allow access
        if (res.ok && data?.ok) {
            console.log('Gate access validated successfully');
            return true;
        }
    } catch (error) {
        console.error('Gate validation error:', error);
    }

    // Validation failed - redirect with next parameter
    const url = new URL(REDIRECT_URL);
    url.searchParams.set('next', nextUrl);
    console.log('Gate validation failed, redirecting...');
    window.location.href = url.toString();
    return false;
}

/**
 * Check gate and redirect to tools if valid
 */
async function checkGateAndRedirect() {
    if (hasGateCookie()) {
        console.log('Gate cookie found, validating...');
        const isValid = await ensureGateAccess(TOOLS_URL);
        if (isValid) {
            console.log('Redirecting to tools...');
            window.location.href = TOOLS_URL;
        }
    } else {
        console.log('No gate cookie found, staying on current page');
    }
}

/**
 * Simple check: if cookie exists, go to tools, otherwise stay
 */
function simpleGateCheck() {
    if (hasGateCookie()) {
        console.log('Gate cookie found, redirecting to tools...');
        window.location.href = TOOLS_URL;
    } else {
        console.log('No gate cookie found');
    }
}