const GATE_ORIGIN = 'https://backend.tecnibo.com/api';
const GATE_API_PATH = '/cloudflare/access';
const GATE_COOKIE = 'cf_upload_gate';
const REDIRECT_URL = 'https://backend.tecnibo.com/';

// Function to get a cookie by name
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

// If you want global access
window.ensureGateAccess = async function(nextUrl = window.location.href) {
    console.log('Checking gate access...');

    // Log the cookie value
    const cookieValue = getCookie(GATE_COOKIE);
    console.log(`Value of ${GATE_COOKIE}:`, cookieValue);

    try {
        const res = await fetch(`${GATE_ORIGIN}${GATE_API_PATH}`, {
            method: 'GET',
            credentials: 'include', // send cookies even if HttpOnly
            cache: 'no-store'
        });
        const data = await res.json().catch(() => null);

        console.log('Gate API response:', data);

        if (res.ok && data?.ok) return true;
    } catch (e) {
        console.error(e);
    }

    const url = new URL(REDIRECT_URL);
    url.searchParams.set('next', nextUrl);
    window.location.href = url.toString();
    return false;
};
