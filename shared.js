const ITERATIONS = 200000;

const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromB64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

// PBKDF2-SHA256. Pass a stored salt to verify; omit it to create a new hash.
export async function hashPassword(password, saltB64) {
  const salt = saltB64 ? fromB64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, 256
  );
  return { salt: toB64(salt), hash: toB64(new Uint8Array(bits)) };
}

// Compares every character so the time taken doesn't hint at how much matched.
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password, stored) {
  if (!stored) return false;
  const { hash } = await hashPassword(password, stored.salt);
  return safeEqual(hash, stored.hash);
}

// "https://www.YouTube.com/watch?v=1" -> "youtube.com"
export function normalizeDomain(input) {
  let s = String(input || '').trim().toLowerCase();
  if (!s) return '';
  if (!/^[a-z]+:\/\//.test(s)) s = 'http://' + s;
  try {
    const host = new URL(s).hostname.replace(/^www\./, '');
    // Needs a dot (or be localhost) and only hostname characters.
    if (!/^[a-z0-9.-]+$/.test(host) || (!host.includes('.') && host !== 'localhost')) return '';
    return host;
  } catch {
    return '';
  }
}

// Returns the locked domain that covers this URL (subdomains included), or null.
export function matchSite(url, sites) {
  let host;
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    host = u.hostname.toLowerCase();
  } catch {
    return null;
  }
  return sites.find((d) => host === d || host.endsWith('.' + d)) || null;
}
