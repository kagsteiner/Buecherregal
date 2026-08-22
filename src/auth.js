import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_SECONDS = 365 * 24 * 60 * 60;
const COOKIE_NAME = 'bookshelf_session';
const MAX_FAILED_LOGINS = 5;
const LOGIN_BLOCK_MS = 15 * 60 * 1_000;

function hash(value) {
  return createHmac('sha256', 'bookshelf-password-comparison').update(value).digest();
}

function safeEqual(left, right) {
  return timingSafeEqual(hash(left), hash(right));
}

function signature(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function cookies(request) {
  return Object.fromEntries((request.headers.cookie || '').split(';').flatMap((part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return [];
    return [[part.slice(0, separator).trim(), part.slice(separator + 1).trim()]];
  }));
}

function requestPrefix(request) {
  const value = request.headers['x-forwarded-prefix'];
  return typeof value === 'string' && /^\/[a-z0-9/_-]*$/i.test(value)
    ? value.replace(/\/$/, '')
    : '';
}

function isSecureRequest(request) {
  return request.headers['x-forwarded-proto'] === 'https' || request.socket.encrypted === true;
}

function clientAddress(request) {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return request.socket.remoteAddress || 'unknown';
}

function sessionToken(secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    expiresAt: now + SESSION_SECONDS * 1_000,
    nonce: randomBytes(18).toString('base64url'),
  })).toString('base64url');
  return `${payload}.${signature(payload, secret)}`;
}

function validSession(token, secret, now = Date.now()) {
  if (!token) return false;
  const separator = token.lastIndexOf('.');
  if (separator < 1) return false;
  const payload = token.slice(0, separator);
  if (!safeEqual(token.slice(separator + 1), signature(payload, secret))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isFinite(parsed.expiresAt) && parsed.expiresAt > now &&
      parsed.expiresAt <= now + SESSION_SECONDS * 1_000;
  } catch {
    return false;
  }
}

function safeNext(value) {
  return typeof value === 'string' && /^\/buch\/[A-Za-z0-9_-]{20,64}\/?$/.test(value)
    ? value.replace(/\/$/, '')
    : '';
}

function loginPage({ error = '', action = 'auth/login', next = '' } = {}) {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Bücherregal · Anmeldung</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      * { box-sizing: border-box; }
      body { min-height: 100svh; margin: 0; display: grid; place-items: center; padding: 24px; color: #f4eadc; background: radial-gradient(circle at 50% 18%, #36291f, #17120f 58%, #0d0a08); }
      main { width: min(430px, 100%); padding: 38px; border: 1px solid #654b36; border-radius: 16px; background: rgba(30,23,19,.94); box-shadow: 0 28px 80px #0009; }
      .eyebrow { margin: 0 0 8px; color: #c8a070; font-size: .72rem; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; }
      h1 { margin: 0 0 8px; font-family: Georgia, serif; font-size: clamp(2.1rem, 9vw, 3.5rem); font-weight: 400; }
      .intro { margin: 0 0 30px; color: #b7aa9d; line-height: 1.5; }
      label { display: grid; gap: 8px; color: #d8c8b8; font-size: .8rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      input { width: 100%; padding: 14px 15px; border: 1px solid #6c5541; border-radius: 8px; outline: none; color: #fff8ee; background: #16110e; font: inherit; }
      input:focus { border-color: #d2a56e; box-shadow: 0 0 0 3px #d2a56e26; }
      button { width: 100%; margin-top: 15px; padding: 14px; border: 0; border-radius: 8px; color: #21160e; background: #d5aa75; font: inherit; font-weight: 750; cursor: pointer; }
      .error { margin: 0 0 17px; padding: 10px 12px; border-radius: 7px; color: #ffd8d0; background: #6c2d263d; }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">Privates Bücherregal</p>
      <h1>Willkommen</h1>
      <p class="intro">Bitte gib das Passwort ein, um das Regal zu öffnen.</p>
      ${error ? `<p class="error" role="alert">${error}</p>` : ''}
      <form method="post" action="${action}">
        ${next ? `<input name="next" type="hidden" value="${next}" />` : ''}
        <label>Passwort<input name="password" type="password" autocomplete="current-password" required autofocus /></label>
        <button type="submit">Regal öffnen</button>
      </form>
    </main>
  </body>
</html>`;
}

async function readForm(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 8_192) throw new Error('Anfrage ist zu groß.');
    chunks.push(buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function showLogin(request, response, status = 200, error = '', requestedNext = '') {
  const prefix = requestPrefix(request);
  const next = safeNext(requestedNext || new URL(request.url, 'http://localhost').searchParams.get('next'));
  const body = loginPage({ error, action: `${prefix}/auth/login`, next });
  response.statusCode = status;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  response.end(body);
}

export function authConfiguration(environment = process.env) {
  const password = environment.APP_PASSWORD;
  const secret = environment.SESSION_SECRET;
  if (!password || password.length < 8) throw new Error('APP_PASSWORD muss mindestens 8 Zeichen lang sein.');
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET muss mindestens 32 Zeichen lang sein.');
  return { password, secret };
}

export function createAuthHandler(configuration) {
  const failedLogins = new Map();
  return async function handleAuth(request, response) {
    const url = new URL(request.url, 'http://localhost');
    const prefix = requestPrefix(request);
    if (request.method === 'POST' && url.pathname === '/auth/login') {
      const address = clientAddress(request);
      const previous = failedLogins.get(address);
      if (previous?.blockedUntil > Date.now()) {
        showLogin(request, response, 429, 'Zu viele Versuche. Bitte warte 15 Minuten.');
        return false;
      }
      const form = await readForm(request);
      const next = safeNext(form.get('next'));
      if (!safeEqual(form.get('password') || '', configuration.password)) {
        const failures = previous?.blockedUntil > Date.now() - LOGIN_BLOCK_MS ? previous.failures + 1 : 1;
        failedLogins.set(address, {
          failures,
          blockedUntil: failures >= MAX_FAILED_LOGINS ? Date.now() + LOGIN_BLOCK_MS : Date.now(),
        });
        showLogin(request, response, 401, 'Das Passwort ist nicht richtig.', next);
        return false;
      }
      failedLogins.delete(address);
      const attributes = [
        `${COOKIE_NAME}=${sessionToken(configuration.secret)}`,
        `Max-Age=${SESSION_SECONDS}`,
        `Path=${prefix || '/'}`,
        'HttpOnly',
        'SameSite=Strict',
      ];
      if (isSecureRequest(request)) attributes.push('Secure');
      response.statusCode = 303;
      response.setHeader('Set-Cookie', attributes.join('; '));
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Location', `${prefix}${next || '/'}` || '/');
      response.end();
      return false;
    }
    if (validSession(cookies(request)[COOKIE_NAME], configuration.secret)) return true;
    if (url.pathname.startsWith('/api/')) {
      response.statusCode = 401;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
      response.end(JSON.stringify({ error: 'Anmeldung erforderlich.' }));
    } else showLogin(request, response);
    return false;
  };
}

export function isAuthenticatedRequest(request, configuration) {
  return validSession(cookies(request)[COOKIE_NAME], configuration.secret);
}

export const authInternals = { loginPage, sessionToken, validSession, requestPrefix, safeNext };
