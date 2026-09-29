// Shared session-cookie helpers.
// Uses Web Crypto (crypto.subtle) so this file works unmodified in both
// Vercel's Routing Middleware and Edge Functions — no Node-only APIs.

export const SESSION_COOKIE = 'cogistics_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Build a signed session token: "<expiryTimestamp>.<hmacSignature>"
 */
export async function createToken(secret, ttlMs = SESSION_TTL_MS) {
  const payload = String(Date.now() + ttlMs);
  const sig = await signPayload(payload, secret);
  return `${payload}.${sig}`;
}

/**
 * Verify a session token is well-formed, correctly signed, and not expired.
 */
export async function verifyToken(token, secret) {
  if (!token || !secret) return false;
  const dot = token.lastIndexOf('.');
  if (dot === -1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await signPayload(payload, secret);
  if (!constantTimeEqual(sig, expected)) return false;
  const expiry = Number(payload);
  return Number.isFinite(expiry) && Date.now() < expiry;
}

export async function signPayload(payload, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return toBase64Url(sigBuf);
}

// Not perfectly constant-time (JS strings make that hard to guarantee), but
// avoids the most obvious short-circuit-on-first-mismatch timing leak.
export function constantTimeEqual(a, b) {
  const len = Math.max(a.length, b.length);
  let mismatch = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

export function getCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';').map((s) => s.trim());
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

function toBase64Url(buf) {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
