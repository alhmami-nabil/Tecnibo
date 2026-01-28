// static/gate-check.js

const GATE_ORIGIN = 'https://backend.tecnibo.com/api';
const GATE_API_PATH = '/cloudflare/access';
const GATE_COOKIE = 'cf_upload_gate';

// 🔁 Where to send user if NOT authenticated
const REDIRECT_URL = 'https://backend.tecnibo.com/';

// ✅ Where to go AFTER success
const SUCCESS_URL = 'https://backend.tecnibo.com/tools/fiches';

function hasGateCookie() {
    return document.cookie
        .split(';')
        .some(c => c.trim().startsWith(`${GATE_COOKIE}=`));
}

async function ensureGateAccess(nextUrl = window.location.href) {
    // ❌ No cookie → go to gate page
    if (!hasGateCookie()) {
        const url = new URL(REDIRECT_URL);
        url.searchParams.set('next', nextUrl);
        window.location.href = url.toString();
        return false;
    }

    try {
        const res = await fetch(`${GATE_ORIGIN}${GATE_API_PATH}`, {
            method: 'GET',
            credentials: 'include',   // IMPORTANT for HttpOnly cookie
            cache: 'no-store',
        });

        const data = await res.json().catch(() => null);

        // ✅ Valid access
        if (res.ok && data?.ok === true) {
            // redirect to fiches
            if (!window.location.href.startsWith(SUCCESS_URL)) {
                window.location.href = SUCCESS_URL;
            }
            return true;
        }

    } catch (e) {
        console.error("Gate check error:", e);
    }

    // ❌ Invalid / expired / rejected
    const url = new URL(REDIRECT_URL);
    url.searchParams.set('next', nextUrl);
    window.location.href = url.toString();
    return false;
}
