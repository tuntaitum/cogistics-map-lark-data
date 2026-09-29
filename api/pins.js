export const config = { runtime: 'edge' };

import { SESSION_COOKIE, verifyToken, getCookie } from '../lib/auth.js';

// This endpoint no longer talks to Lark directly. Your Railway bot already
// holds the Lark credentials and knows how to read the Base, so this just
// proxies to it — Lark secrets now live in exactly one place.

export default async function handler(request) {
  // Belt-and-braces: middleware.js already checks this, but this endpoint
  // shouldn't trust that blindly in case middleware config ever changes.
  const cookieHeader = request.headers.get('cookie') || '';
  const token = getCookie(cookieHeader, SESSION_COOKIE);
  const authenticated = await verifyToken(token, process.env.SESSION_SECRET);
  if (!authenticated) {
    return json({ error: 'unauthorized' }, 401);
  }

  const botBaseUrl = process.env.BOT_BASE_URL; // e.g. https://your-bot.up.railway.app
  const mapApiKey = process.env.MAP_API_KEY; // same value as MAP_API_KEY on the bot
  if (!botBaseUrl || !mapApiKey) {
    return json({ error: 'Server is missing BOT_BASE_URL / MAP_API_KEY env vars.' }, 500);
  }

  try {
    let target;
    try {
      target = new URL('/pins', botBaseUrl.trim());
    } catch {
      return json(
        { error: `BOT_BASE_URL is not a valid URL: "${botBaseUrl}". It should look like https://your-bot.up.railway.app (must include the https:// scheme, no stray spaces).` },
        500
      );
    }

    const res = await fetch(target, {
      headers: { authorization: `Bearer ${mapApiKey.trim()}` },
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return json({ error: `Bot returned ${res.status}${detail ? `: ${detail}` : ''}` }, 502);
    }

    const data = await res.json();
    return json(data, 200, { 'cache-control': 'private, max-age=15' });
  } catch (err) {
    return json({ error: String(err?.message || err) }, 502);
  }
}

function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}