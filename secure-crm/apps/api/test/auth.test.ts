// Login (POST /api/auth/login) y middleware JWT contra la app real.
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../src/auth';
import { PASSWORDS, signToken, startServer, type TestServer } from './helpers';

let s: TestServer;
beforeAll(async () => {
  s = await startServer();
});
afterAll(() => s.close());
afterEach(() => vi.restoreAllMocks());

function login(body: unknown) {
  return s.api('/api/auth/login', { method: 'POST', token: null, body: JSON.stringify(body) });
}

describe('POST /api/auth/login', () => {
  test('credenciales válidas devuelven un JWT firmado y el usuario sin hash', async () => {
    const res = await login({ username: 'admin', password: PASSWORDS.admin });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.user).toMatchObject({ id: s.ids.admin, username: 'admin', role: 'admin', fullName: 'Ada Admin' });
    expect(JSON.stringify(body)).not.toMatch(/password_hash|passwordHash|scrypt\$/);
    const payload = jwt.verify(body.token, JWT_SECRET) as any;
    expect(payload).toMatchObject({ sub: s.ids.admin, username: 'admin', role: 'admin' });
    expect(res.headers.get('set-cookie')).toMatch(/^session=/);
  });

  test('contraseña incorrecta, usuario inexistente o cuerpo vacío devuelven 401', async () => {
    expect((await login({ username: 'admin', password: 'mala' })).status).toBe(401);
    expect((await login({ username: 'nadie', password: PASSWORDS.admin })).status).toBe(401);
    expect((await login({})).status).toBe(401);
    expect((await login({ username: 'admin' })).status).toBe(401);
    const empty = await s.api('/api/auth/login', { method: 'POST', token: null });
    expect(empty.status).toBe(401);
    expect(await empty.json()).toEqual({ error: 'Credenciales inválidas' });
  });

  test('payloads de SQL Injection en usuario o contraseña no autentican', async () => {
    const payloads = [
      { username: "admin' --", password: 'x' },
      { username: "admin'/*", password: 'x' },
      { username: "' OR '1'='1' --", password: 'x' },
      { username: "' OR 1=1 LIMIT 1 --", password: "' OR '1'='1" },
      { username: 'admin', password: "' OR '1'='1" },
      { username: "x' UNION SELECT 1,'admin','a','A','admin','scrypt$00$00','now' --", password: 'x' },
    ];
    for (const p of payloads) {
      const res = await login(p);
      expect(res.status, JSON.stringify(p)).toBe(401);
      expect(await res.json()).toEqual({ error: 'Credenciales inválidas' });
    }
  });

  test('operadores tipo NoSQL ({ $ne: null }) no autentican ni provocan errores', async () => {
    expect((await login({ username: { $ne: null }, password: { $ne: null } })).status).toBe(401);
    expect((await login({ username: 'admin', password: { $gt: '' } })).status).toBe(401);
  });

  test('un fallo de la BD responde 500 genérico sin revelar SQL ni detalles', async () => {
    const { db } = s;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(db, 'prepare').mockImplementationOnce(() => {
      throw new Error('SQLITE_ERROR: no such table: users');
    });
    const res = await login({ username: 'admin', password: PASSWORDS.admin });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Error interno del servidor' });
    expect(console.error).toHaveBeenCalled();
  });
});

describe('middleware authenticate (JWT)', () => {
  test('sin token devuelve 401 en todas las rutas protegidas', async () => {
    for (const path of ['/api/tickets', '/api/tickets/1', '/api/users', '/api/users/1', '/api/dashboard']) {
      const res = await s.api(path, { token: null });
      expect(res.status, path).toBe(401);
      expect(await res.json()).toEqual({ error: 'No autenticado' });
    }
  });

  test('un token que no es JWT devuelve 401', async () => {
    for (const token of ['basura', 'a.b.c', 'eyJhbGciOiJIUzI1NiJ9..']) {
      const res = await s.api('/api/tickets', { token });
      expect(res.status, token).toBe(401);
      expect(await res.json()).toEqual({ error: 'Token inválido' });
    }
  });

  test('solo se acepta el esquema Bearer en Authorization', async () => {
    const res = await s.api('/api/tickets', {
      token: null,
      headers: { Authorization: `Basic ${s.tokens.admin}` },
    });
    expect(res.status).toBe(401);
  });

  test('acepta el token por cabecera Bearer o por la cookie de sesión', async () => {
    expect((await s.api('/api/tickets')).status).toBe(200);
    const viaCookie = await s.api('/api/tickets', { token: null, headers: { Cookie: `session=${s.tokens.viewer}` } });
    expect(viaCookie.status).toBe(200);
  });

  // Vulnerabilidad conocida y documentada del laboratorio (A07 / CWE-347): el middleware usa
  // jwt.decode sin verificar la firma. Se marca como fallo esperado para que, cuando se
  // corrija (jwt.verify), esta prueba avise y se convierta en una prueba normal.
  test.fails('[vuln. conocida CWE-347] rechaza tokens firmados con otro secreto', async () => {
    const forged = signToken(s.ids.viewer, 'viewer', 'admin', 'otro-secreto');
    expect((await s.api('/api/users', { token: forged })).status).toBe(401);
  });

  test.fails('[vuln. conocida CWE-347] rechaza tokens sin firma (alg none)', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 1, username: 'x', role: 'admin' })).toString('base64url');
    expect((await s.api('/api/users', { token: `${header}.${payload}.` })).status).toBe(401);
  });
});
