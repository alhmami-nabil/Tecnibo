// static/js/gate-check.js

const GATE_ORIGIN = 'https://backend.tecnibo.com/api';
const GATE_API_PATH = '/cloudflare/access';
const REDIRECT_URL = 'https://backend.tecnibo.com/';

// Make function global so it can be called from other scripts
window.ensureGateAccess = async function(nextUrl = window.location.href) {
  console.log('🟢 Checking gate access...');

  try {
    const res = await fetch(`${GATE_ORIGIN}${GATE_API_PATH}`, {
      method: 'GET',
      credentials: 'include', // send HttpOnly cookies
      cache: 'no-store',
    });

    const data = await res.json().catch(() => null);
    console.log('Gate API response:', data);

    if (res.ok && data?.ok) {
      console.log('✅ Gate access granted');
      return true; // access allowed
    }
  } catch (err) {
    console.error('❌ Error checking gate access:', err);
  }

  // If access not granted, redirect
  const redirectUrl = new URL(REDIRECT_URL);
  redirectUrl.searchParams.set('next', nextUrl);
  console.warn('⚠️ Redirecting to gate:', redirectUrl.toString());
  window.location.href = redirectUrl.toString();
  return false;
};

// Optional helper to log all accessible cookies (excluding HttpOnly)
window.logAllCookies = function() {
  console.log('🌐 Accessible cookies:', document.cookie);
};
