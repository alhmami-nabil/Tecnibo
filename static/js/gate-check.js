// static/js/gate-check.js
const GATE_ORIGIN = 'https://backend.tecnibo.com/api';
const GATE_API_PATH = '/cloudflare/access';
const GATE_COOKIE = 'cf_upload_gate';
const REDIRECT_URL = 'https://backend.tecnibo.com/tools/fiches';

function hasGateCookie() {
  const cookiesValue = document.cookie.split(';').some(c => c.trim().startsWith(`${GATE_COOKIE}=`));
  console.log('Has gate cookie:', cookiesValue);
  return cookiesValue;
}

async function ensureGateAccess() {
  if (!hasGateCookie()) {
    console.log('No gate cookie found, redirecting...');
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
    console.log('API response:', data);
    
    if (res.ok && data?.ok) {
      console.log('✅ Access validated');
      return true;
    }
    
    console.log('API validation failed');
  } catch (err) {
    console.error('Gate check error:', err);
  }

  // If validation fails, redirect to login page
  console.log('Redirecting to login...');
  window.location.href = REDIRECT_URL;
  return false;
}