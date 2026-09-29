import { next } from '@vercel/functions';
import { SESSION_COOKIE, verifyToken, getCookie } from './lib/auth.js';

// Runs before every request. Default runtime is Edge (fast, no cold DB
// connections needed since we're only checking a signed cookie).
export default async function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Always let the login page and the login endpoint through unauthenticated.
  if (path === '/login.html' || path === '/api/login') {
    return next();
  }

  const cookieHeader = request.headers.get('cookie') || '';
  const token = getCookie(cookieHeader, SESSION_COOKIE);
  const authenticated = await verifyToken(token, process.env.SESSION_SECRET);

  if (authenticated) {
    return next();
  }

  // API calls get a clean 401 the front-end can react to.
  if (path.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Everything else (the map page, assets, etc.) gets sent to the login page.
  return Response.redirect(new URL('/login.html', request.url), 302);
}
