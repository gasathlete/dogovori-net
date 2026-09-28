/** Read-only production header probe. No authentication, payloads or exploits. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PUBLIC_ORIGINS = new Set(['https://dogovori.net', 'https://www.dogovori.net']);
const ROUTES = ['/', '/auth', '/paketi'];

export function assessHeaders(headers) {
  const findings = [];
  const add = (id, severity, message) => findings.push({ id, severity, message });
  const hsts = headers.get('strict-transport-security') ?? '';
  const maxAge = /(?:^|;)\s*max-age\s*=\s*(\d+)\s*(?:;|$)/i.exec(hsts);
  if (!maxAge || Number(maxAge[1]) < 31536000) add('hsts', 'error', 'Require HSTS max-age >= 31536000 on HTTPS.');
  if (headers.get('x-content-type-options')?.trim().toLowerCase() !== 'nosniff') add('nosniff', 'error', 'Missing X-Content-Type-Options: nosniff.');
  if (!['no-referrer', 'same-origin', 'strict-origin', 'strict-origin-when-cross-origin'].includes(headers.get('referrer-policy')?.trim().toLowerCase())) add('referrer', 'error', 'Missing or weak Referrer-Policy.');

  const csp = headers.get('content-security-policy');
  if (!csp) {
    add('csp', 'error', 'No enforced CSP response header. A source file, HTML meta or report-only policy is not equivalent.');
  } else {
    // A single header can contain multiple independently enforced policies.
    // Require at least one whole policy to meet this conservative baseline.
    const policies = csp.split(',').map((policy) => {
      const directives = new Map();
      for (const entry of policy.split(';')) {
        const [name, ...values] = entry.trim().split(/\s+/);
        if (name && !directives.has(name.toLowerCase())) directives.set(name.toLowerCase(), values);
      }
      return directives;
    });
    const safeSource = (tokens) => Array.isArray(tokens) && tokens.length > 0 && tokens.every(t => ["'self'", "'none'"].includes(t));
    if (!policies.some(p => p.get('object-src')?.length === 1 && p.get('object-src')[0] === "'none'")) add('csp-object', 'error', "CSP must disable objects with object-src 'none'.");
    if (!policies.some(p => safeSource(p.get('base-uri')))) add('csp-base', 'error', 'CSP must restrict base-uri to self or none.');
    if (!policies.some(p => safeSource(p.get('frame-ancestors')))) add('csp-frame', 'error', 'CSP must restrict frame-ancestors to self or none.');
    const unsafe = new Set(["'unsafe-inline'", "'unsafe-eval'", '*', 'http:', 'https:', 'data:', 'blob:']);
    const safeScripts = (p) => {
      const scripts = p.get('script-src') ?? p.get('default-src');
      return [scripts, p.get('script-src-elem') ?? scripts, p.get('script-src-attr') ?? scripts]
        .every(tokens => Array.isArray(tokens) && tokens.length > 0 && !tokens.some(t => unsafe.has(t.toLowerCase())));
    };
    if (!policies.some(safeScripts)) add('csp-script', 'error', 'Script policy is missing or allows inline/eval/broad schemes; stage a compatible nonce/hash policy.');
  }
  const xfo = headers.get('x-frame-options')?.trim().toUpperCase();
  if (!['DENY', 'SAMEORIGIN'].includes(xfo) && !csp?.toLowerCase().includes('frame-ancestors')) add('frame', 'error', 'No response-level anti-framing policy.');
  if (!headers.get('permissions-policy')) add('permissions', 'warning', 'No Permissions-Policy response header.');
  return findings;
}

export async function probeRoute(url, fetchImpl = fetch) {
  const start = new URL(url);
  if (!PUBLIC_ORIGINS.has(start.origin) || start.username || start.password) throw new Error('Only the established public Dogovori origins are allowed.');
  let current = start;
  const signal = AbortSignal.timeout(12000);
  try {
    for (let hop = 0; hop < 4; hop++) {
      const response = await fetchImpl(current, { method: 'GET', redirect: 'manual', signal, headers: { 'User-Agent': 'DogovoriSecurityReadiness/1.0', Accept: 'text/html' } });
      await response.body?.cancel();
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error('Redirect without Location.');
        const next = new URL(location, current);
        if (!PUBLIC_ORIGINS.has(next.origin) || next.username || next.password) throw new Error('Redirect left the approved HTTPS origins.');
        current = next;
        continue;
      }
      const findings = assessHeaders(response.headers);
      if (response.status !== 200) findings.unshift({ id: 'http-status', severity: 'error', message: `Expected 200, got ${response.status}.` });
      if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('text/html')) findings.unshift({ id: 'content-type', severity: 'error', message: 'Expected HTML response.' });
      return { path: start.pathname, finalPath: current.pathname, status: response.status, findings };
    }
    throw new Error('Too many redirects.');
  } catch (error) {
    // Do not serialize response headers, cookies, bodies or arbitrary errors.
    const message = error?.name === 'TimeoutError' ? 'Request timed out.' : 'Probe failed or redirect was rejected.';
    return { path: start.pathname, status: null, findings: [{ id: 'probe', severity: 'error', message }] };
  }
}

export async function main(args = process.argv.slice(2)) {
  const outputArg = args.find(a => a.startsWith('--out='));
  if (args.some(a => a !== '--report-only' && !a.startsWith('--out='))) throw new Error('Usage: node scripts/security-shield-check.mjs [--out=report.json] [--report-only]');
  const routes = [];
  for (const route of ROUTES) routes.push(await probeRoute(`https://dogovori.net${route}`));
  const errors = routes.reduce((n, r) => n + r.findings.filter(f => f.severity === 'error').length, 0);
  const report = { checkedAt: new Date().toISOString(), origin: 'https://dogovori.net', scope: 'HTTP header readiness only; not a penetration test or proof of WAF/RLS/MFA.', ready: errors === 0, errors, routes };
  if (outputArg) { const path = outputArg.slice(6); if (!path) throw new Error('Empty output path.'); mkdirSync(dirname(resolve(path)), { recursive: true }); writeFileSync(path, JSON.stringify(report, null, 2) + '\n'); }
  console.log(JSON.stringify(report, null, 2));
  return args.includes('--report-only') ? 0 : errors === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
