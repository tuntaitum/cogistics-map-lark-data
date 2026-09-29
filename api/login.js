export const config = { runtime: 'edge' };

import { SESSION_COOKIE, createToken, constantTimeEqual } from '../lib/auth.js';

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  const expected = process.env.MAP_PASSWORD || '';
  const secret = process.env.SESSION_SECRET || '';
  if (!expected || !secret) {
    return json({ error: 'Server is missing MAP_PASSWORD or SESSION_SECRET env vars.' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const password = typeof body?.password === 'string' ? body.password : '';
  if (!constantTimeEqual(password, expected)) {
    return json({ error: 'Incorrect password' }, 401);
  }

  const token = await createToken(secret);
  const cookie = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${12 * 60 * 60}`,
  ].join('; ');

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': cookie,
    },
  });
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
