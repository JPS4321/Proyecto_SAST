// Content-Security-Policy (lib/csp.ts) y middleware que la envía con un nonce por petición.
import { describe, expect, test } from 'vitest';
import { NextRequest } from 'next/server';
import { apiOrigin, buildCsp } from '@/lib/csp';
import { config, middleware } from '@/middleware';

function directives(csp: string) {
  return Object.fromEntries(
    csp.split('; ').map((d) => {
      const [name, ...values] = d.split(' ');
      return [name, values];
    })
  );
}

describe('buildCsp', () => {
  test('producción: nonce y strict-dynamic, sin unsafe-eval ni unsafe-inline en scripts', () => {
    const d = directives(buildCsp('abc', { dev: false, api: 'http://localhost:4000' }));
    expect(d['script-src']).toEqual(["'self'", "'nonce-abc'", "'strict-dynamic'"]);
    expect(d['style-src-elem']).toEqual(["'self'", "'nonce-abc'"]);
    expect(d['style-src-attr']).toEqual(["'unsafe-inline'"]);
    expect(d['connect-src']).toEqual(["'self'", 'http://localhost:4000']);
    expect(d['frame-ancestors']).toEqual(["'none'"]);
    expect(d['object-src']).toEqual(["'none'"]);
    expect(d['base-uri']).toEqual(["'self'"]);
    expect(d['form-action']).toEqual(["'self'"]);
    const csp = buildCsp('abc', { dev: false, api: null });
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('*');
    expect(directives(csp)['connect-src']).toEqual(["'self'"]);
  });

  test("desarrollo (next dev): permite 'unsafe-eval' y estilos inline que inyecta webpack", () => {
    const d = directives(buildCsp('abc', { dev: true, api: null }));
    expect(d['script-src']).toContain("'unsafe-eval'");
    expect(d['style-src-elem']).toEqual(["'self'", "'unsafe-inline'"]);
  });

  test('apiOrigin devuelve solo el origen, o null si la URL no es válida', () => {
    expect(apiOrigin('http://api.test:4000/api/x?y=1')).toBe('http://api.test:4000');
    expect(apiOrigin('no es una url')).toBeNull();
    expect(apiOrigin()).toBe('http://api.test');
  });
});

describe('middleware', () => {
  test('envía la misma CSP con nonce en la petición (para Next) y en la respuesta', () => {
    const res = middleware(new NextRequest('http://localhost:3000/login'));
    const csp = res.headers.get('Content-Security-Policy')!;
    const nonce = /'nonce-([^']+)'/.exec(csp)![1];
    expect(nonce.length).toBeGreaterThanOrEqual(16);
    expect(res.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
  });

  test('genera un nonce distinto en cada petición', () => {
    const a = middleware(new NextRequest('http://localhost:3000/')).headers.get('Content-Security-Policy');
    const b = middleware(new NextRequest('http://localhost:3000/')).headers.get('Content-Security-Policy');
    expect(a).not.toBe(b);
  });

  test('se aplica a páginas y 404, no a los recursos compilados de Next', () => {
    const re = new RegExp(`^${config.matcher[0]}$`);
    for (const path of ['/', '/login', '/tickets/1', '/robots.txt', '/brand/logo.svg']) {
      expect(re.test(path), path).toBe(true);
    }
    for (const path of ['/_next/static/chunks/main.js', '/_next/image']) {
      expect(re.test(path), path).toBe(false);
    }
  });
});
