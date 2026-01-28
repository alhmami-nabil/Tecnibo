// static/js/gate-check.js

const GATE_ORIGIN = 'https://backend.tecnibo.com/api';
const GATE_API_PATH = '/cloudflare/access';
const GATE_COOKIE = 'cf_upload_gate';
const LOGIN_PATH = '/cdn-cgi/access/login'; // Cloudflare Access login path

// ✅ Where to go AFTER success
const SUCCESS_URL = 'https://backend.tecnibo.com/tools/fiches';

async function ensureGateAccess() {
    const currentUrl = window.location.href;
    
    // Skip check if we're already on the login page or success page
    if (currentUrl.includes(LOGIN_PATH) || currentUrl.startsWith(SUCCESS_URL)) {
        return true;
    }
    
    try {
        const res = await fetch(`${GATE_ORIGIN}${GATE_API_PATH}`, {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
            headers: {
                'Accept': 'application/json',
            }
        });

        const data = await res.json();

        // ✅ Valid access
        if (res.ok && data?.ok === true) {
            // Only redirect if we're not already on the success page
            if (!currentUrl.startsWith(SUCCESS_URL)) {
                window.location.href = SUCCESS_URL;
            }
            return true;
        }
        
        // ❌ Not authenticated - redirect to Cloudflare Access
        // Cloudflare will handle the auth and redirect back to currentUrl
        const loginUrl = new URL(window.location.origin + LOGIN_PATH);
        loginUrl.searchParams.set('kid', 'your-access-application-id'); // Add if needed
        loginUrl.searchParams.set('redirect_url', currentUrl);
        window.location.href = loginUrl.toString();
        
    } catch (e) {
        console.error("Gate check error:", e);
        // On error, redirect to login
        const loginUrl = new URL(window.location.origin + LOGIN_PATH);
        loginUrl.searchParams.set('redirect_url', currentUrl);
        window.location.href = loginUrl.toString();
    }
    return false;
}