import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { authConfiguration, authInternals, createAuthHandler } from '../src/auth.js';

function request({ method = 'GET', url = '/', headers = {}, body = '' } = {}) {
  const stream = Readable.from(body ? [body] : []);
  return Object.assign(stream, { method, url, headers, socket: {} });
}

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(body = '') { this.body = body; },
  };
}

test('authentication configuration fails closed without strong environment values', () => {
  assert.throws(() => authConfiguration({}), /APP_PASSWORD/);
  assert.throws(() => authConfiguration({ APP_PASSWORD: 'lang-genug' }), /SESSION_SECRET/);
  assert.deepEqual(authConfiguration({ APP_PASSWORD: 'lang-genug', SESSION_SECRET: 'x'.repeat(32) }), {
    password: 'lang-genug', secret: 'x'.repeat(32),
  });
});

test('signed sessions expire after 365 days and reject modification', () => {
  const secret = 's'.repeat(32);
  const now = Date.UTC(2026, 7, 22);
  const token = authInternals.sessionToken(secret, now);
  assert.equal(authInternals.validSession(token, secret, now + 364 * 86_400_000), true);
  assert.equal(authInternals.validSession(token, secret, now + 366 * 86_400_000), false);
  assert.equal(authInternals.validSession(`${token}x`, secret, now), false);
  assert.equal(authInternals.validSession(token, 'z'.repeat(32), now), false);
});

test('login sets a secure subpath cookie and redirects to the proxied app', async () => {
  const handle = createAuthHandler({ password: 'richtiges-passwort', secret: 's'.repeat(32) });
  const reply = response();
  const allowed = await handle(request({
    method: 'POST',
    url: '/auth/login',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-forwarded-prefix': '/buecherregal',
      'x-forwarded-proto': 'https',
    },
    body: 'password=richtiges-passwort',
  }), reply);
  assert.equal(allowed, false);
  assert.equal(reply.statusCode, 303);
  assert.equal(reply.headers.location, '/buecherregal/');
  assert.match(reply.headers['set-cookie'], /Max-Age=31536000/);
  assert.match(reply.headers['set-cookie'], /Path=\/buecherregal/);
  assert.match(reply.headers['set-cookie'], /HttpOnly/);
  assert.match(reply.headers['set-cookie'], /SameSite=Strict/);
  assert.match(reply.headers['set-cookie'], /Secure/);
});

test('family login safely returns to a public book while rejecting external redirects', async () => {
  const handle = createAuthHandler({ password: 'richtiges-passwort', secret: 's'.repeat(32) });
  const token = 'a'.repeat(24);
  const reply = response();
  await handle(request({
    method: 'POST', url: '/auth/login',
    headers: { 'x-forwarded-prefix': '/buecherregal' },
    body: `password=richtiges-passwort&next=${encodeURIComponent(`/buch/${token}`)}`,
  }), reply);
  assert.equal(reply.headers.location, `/buecherregal/buch/${token}`);

  const unsafeReply = response();
  await handle(request({
    method: 'POST', url: '/auth/login',
    headers: { 'x-forwarded-prefix': '/buecherregal' },
    body: 'password=richtiges-passwort&next=https%3A%2F%2Fevil.example',
  }), unsafeReply);
  assert.equal(unsafeReply.headers.location, '/buecherregal/');
});

test('unauthenticated pages receive login UI while APIs receive JSON 401', async () => {
  const handle = createAuthHandler({ password: 'richtiges-passwort', secret: 's'.repeat(32) });
  const pageReply = response();
  assert.equal(await handle(request({
    headers: { 'x-forwarded-prefix': '/buecherregal' },
  }), pageReply), false);
  assert.equal(pageReply.statusCode, 200);
  assert.match(pageReply.body, /action="\/buecherregal\/auth\/login"/);

  const apiReply = response();
  assert.equal(await handle(request({ url: '/api/books' }), apiReply), false);
  assert.equal(apiReply.statusCode, 401);
  assert.deepEqual(JSON.parse(apiReply.body), { error: 'Anmeldung erforderlich.' });
});

test('repeated wrong passwords are temporarily rate limited by client address', async () => {
  const handle = createAuthHandler({ password: 'richtiges-passwort', secret: 's'.repeat(32) });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reply = response();
    await handle(request({
      method: 'POST', url: '/auth/login',
      headers: { 'x-forwarded-for': '203.0.113.9' },
      body: 'password=falsch',
    }), reply);
    assert.equal(reply.statusCode, 401);
  }
  const blocked = response();
  await handle(request({
    method: 'POST', url: '/auth/login',
    headers: { 'x-forwarded-for': '203.0.113.9' },
    body: 'password=richtiges-passwort',
  }), blocked);
  assert.equal(blocked.statusCode, 429);
  assert.match(blocked.body, /15 Minuten/);
});
