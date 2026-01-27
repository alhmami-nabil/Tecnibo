// static/gate-check.js
const GATE_ORIGIN = 'https://backend.tecnibo.com/api';
const GATE_API_PATH = '/cloudflare/access';
const GATE_COOKIE = 'cf_upload_gate';
const REDIRECT_URL = 'https://backend.tecnibo.com/';

function hasGateCookie() {
return document.cookie.split(';').some(c => c.trim().startsWith(`${GATE_COOKIE}=`));
}

async function ensureGateAccess(nextUrl = window.location.href) {
if (!hasGateCookie()) {
window.location.href = REDIRECT_URL;
return false;
}
try {
const res = await fetch(`${GATE_ORIGIN}${GATE_API_PATH}`, {
method: 'GET',
credentials: 'include',
cache: 'no-store',
});
const data = await res.json().catch(() => null);
if (res.ok && data?.ok) return true;
} catch (_) {}

const url = new URL(REDIRECT_URL);
url.searchParams.set('next', nextUrl);
window.location.href = url.toString();
return false;
}