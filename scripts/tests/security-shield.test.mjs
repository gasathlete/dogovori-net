import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assessHeaders, probeRoute } from '../security-shield-check.mjs';
import { buildCors } from '../../supabase/functions/_shared/cors.ts';

const safeHeaders = () => new Headers({
  'content-type': 'text/html',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'content-security-policy': "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
  'permissions-policy': 'camera=(), microphone=()',
});

test('known project and production origins retain CORS and correlation headers', () => {
  for (const origin of ['https://dogovori.net', 'https://www.dogovori.net', 'https://contract-architect-ai.lovable.app', 'https://dogovori-net.lovable.app', 'https://id-preview--6b2da12e-e1d6-4f97-8549-b632fb66ddd1.lovable.app', 'https://6b2da12e-e1d6-4f97-8549-b632fb66ddd1.lovableproject.com', 'http://localhost:8080']) {
    const headers = buildCors(new Request('https://api.example.test', { headers: { origin } }));
    assert.equal(headers['Access-Control-Allow-Origin'], origin);
    assert.match(headers['Access-Control-Allow-Headers'], /x-correlation-id/);
    assert.equal(headers.Vary, 'Origin');
  }
});

test('unrelated hosted apps, lookalikes, HTTP and malformed origins get no matching CORS grant', () => {
  for (const origin of ['https://unrelated.lovable.app', 'https://unrelated.lovableproject.com', 'https://unrelated.lovable.dev', 'http://unrelated.lovable.app', 'https://dogovori.net.attacker.test', 'https://dogovori.net:444', 'https://dogovori.net/path', 'null']) {
    const headers = buildCors(new Request('https://api.example.test', { headers: { origin } }));
    assert.notEqual(headers['Access-Control-Allow-Origin'], origin);
    assert.notEqual(headers['Access-Control-Allow-Origin'], '*');
  }
  assert.equal(buildCors(new Request('https://api.example.test'))['Access-Control-Allow-Origin'], 'https://dogovori.net');
});

test('strict response headers meet the header baseline', () => assert.deepEqual(assessHeaders(safeHeaders()), []));
test('report-only CSP cannot produce a passing result', () => {
  const headers = safeHeaders();
  headers.set('content-security-policy-report-only', headers.get('content-security-policy'));
  headers.delete('content-security-policy');
  assert(assessHeaders(headers).some(f => f.id === 'csp'));
});
test('weak script and subdirective policies fail the baseline', () => {
  for (const tail of ["script-src 'self' 'unsafe-inline'", "script-src 'self' 'unsafe-eval'", 'script-src https:', "script-src 'self'; script-src-elem *", "script-src 'self'; script-src-attr 'unsafe-inline'"]) {
    const headers = safeHeaders();
    headers.set('content-security-policy', `object-src 'none'; base-uri 'self'; frame-ancestors 'self'; ${tail}`);
    assert(assessHeaders(headers).some(f => f.id === 'csp-script'));
  }
});
test('missing headers and short HSTS fail instead of silently passing', () => {
  assert(assessHeaders(new Headers()).filter(f => f.severity === 'error').length >= 4);
  const headers = safeHeaders(); headers.set('strict-transport-security', 'max-age=0');
  assert(assessHeaders(headers).some(f => f.id === 'hsts'));
});
test('probe uses GET without credentials and follows only known HTTPS origins', async () => {
  let calls = 0;
  const result = await probeRoute('https://dogovori.net/', async (url, options) => {
    calls++;
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.Authorization, undefined);
    return calls === 1 ? new Response(null, { status: 301, headers: { location: 'https://www.dogovori.net/' } }) : new Response(null, { status: 200, headers: safeHeaders() });
  });
  assert.equal(calls, 2); assert.deepEqual(result.findings, []);
});
test('external redirect is rejected before sending another request', async () => {
  let calls = 0;
  const result = await probeRoute('https://dogovori.net/', async () => { calls++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } }); });
  assert.equal(calls, 1); assert.equal(result.findings[0].id, 'probe');
});
test('network failure, redirect loops and error pages cannot pass', async () => {
  for (const fetcher of [async () => { throw new Error('secret must not enter report'); }, async () => new Response(null, { status: 302, headers: { location: '/' } }), async () => new Response(null, { status: 403, headers: safeHeaders() })]) {
    const result = await probeRoute('https://dogovori.net/auth', fetcher);
    assert(result.findings.some(f => f.severity === 'error'));
    assert(!JSON.stringify(result).includes('secret must not'));
  }
});
test('production SQL scanner covers all three migration directories', () => {
  const root = mkdtempSync(join(tmpdir(), 'dogovori-shield-'));
  const scanner = fileURLToPath(new URL('../security-scan.ts', import.meta.url));
  try {
    for (const directory of ['supabase/migrations', 'drizzle/migrations', 'docs/migrations']) {
      mkdirSync(join(root, directory), { recursive: true });
      const file = `${directory}/unsafe.sql`;
      writeFileSync(join(root, file), 'create function public.unsafe_test() returns boolean security definer as $$ select true $$ language sql;\n');
      const result = spawnSync(process.execPath, ['--experimental-strip-types', scanner, file], { cwd: root, encoding: 'utf8' });
      assert.equal(result.status, 1, `${file}: ${result.stderr}`);
      assert.match(result.stderr, /security-definer-no-authz/);
      assert(result.stderr.includes(file));
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
