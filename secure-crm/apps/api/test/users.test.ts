// Rutas /api/users: creación, cambio de rol, validación de entradas y autorización.
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { verifyPassword } from '../src/hash';
import { startServer, type TestServer } from './helpers';

let s: TestServer;
beforeAll(async () => {
  s = await startServer();
});
afterAll(() => s.close());
afterEach(() => vi.restoreAllMocks());

function createUser(body: unknown, token?: string) {
  return s.api('/api/users', { method: 'POST', body: JSON.stringify(body), token });
}
function setRole(id: number | string, body: unknown) {
  return s.api(`/api/users/${id}/role`, { method: 'PUT', body: JSON.stringify(body) });
}
function storedHash(id: number) {
  return (s.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(id) as any).password_hash as string;
}

describe('GET /api/users/:id', () => {
  test('devuelve el usuario sin hash; el correo solo para admin', async () => {
    const asAdmin = (await (await s.api(`/api/users/${s.ids.agent}`)).json()) as any;
    expect(asAdmin).toMatchObject({ id: s.ids.agent, username: 'agente', email: 'agente@test.local', role: 'agent' });
    const asViewer = (await (await s.api(`/api/users/${s.ids.agent}`, { token: s.tokens.viewer })).json()) as any;
    expect(asViewer.email).toBeUndefined();
    expect(asViewer.passwordHash).toBeUndefined();
  });

  test('id inexistente devuelve 404 e id no numérico 400', async () => {
    expect((await s.api('/api/users/99999')).status).toBe(404);
    for (const id of ['abc', '0', '-1', "1' OR '1'='1", '1;DROP TABLE users']) {
      expect((await s.api('/api/users/' + encodeURIComponent(id))).status, id).toBe(400);
    }
  });
});

describe('POST /api/users', () => {
  test('crea el usuario con contraseña hasheada (scrypt) y verificable', async () => {
    const res = await createUser({ username: 'nuevo', email: 'n@test.local', fullName: 'Nuevo', role: 'agent', password: 'Clave-123' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body).toMatchObject({ username: 'nuevo', email: 'n@test.local', fullName: 'Nuevo', role: 'agent' });
    expect(JSON.stringify(body)).not.toMatch(/scrypt\$|password/i);
    const hash = storedHash(body.id);
    expect(hash).toMatch(/^scrypt\$/);
    expect(verifyPassword('Clave-123', hash)).toBe(true);
  });

  test('aplica valores por defecto: rol viewer, nombre = username, correo vacío', async () => {
    const res = await createUser({ username: 'minimo' });
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body).toMatchObject({ username: 'minimo', fullName: 'minimo', email: '', role: 'viewer' });
    expect(verifyPassword('changeme', storedHash(body.id))).toBe(true);
  });

  test('el nombre de usuario con comillas se guarda literal (sin SQL Injection)', async () => {
    const username = "o'hara'); DROP TABLE users; --";
    const res = await createUser({ username, password: 'x' });
    expect(res.status).toBe(201);
    expect(((await res.json()) as any).username).toBe(username);
    expect((await s.api('/api/users')).status).toBe(200);
  });

  test('valida cuerpo, username, tipos, longitudes y rol', async () => {
    const cases: [unknown, string][] = [
      [[{ username: 'a' }], 'Cuerpo inválido'],
      [{}, 'El campo username es obligatorio'],
      [{ username: '   ' }, 'El campo username es obligatorio'],
      [{ username: 123 }, 'El campo username es obligatorio'],
      [{ username: 'a'.repeat(51) }, 'El campo username supera 50 caracteres'],
      [{ username: 'ok', email: ['x'] }, 'El campo email debe ser texto'],
      [{ username: 'ok', password: 12345 }, 'El campo password debe ser texto'],
      [{ username: 'ok', password: 'p'.repeat(257) }, 'El campo password supera 256 caracteres'],
      [{ username: 'ok', fullName: { a: 1 } }, 'El campo fullName debe ser texto'],
      [{ username: 'ok', role: 'root' }, 'Rol inválido'],
      [{ username: 'ok', role: 'ADMIN' }, 'Rol inválido'],
      [{ username: 'ok', role: ['admin'] }, 'Rol inválido'],
    ];
    for (const [body, error] of cases) {
      const res = await createUser(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(await res.json()).toEqual({ error });
    }
  });

  test('username duplicado devuelve 409 sin detalles del motor', async () => {
    const res = await createUser({ username: 'admin', password: 'x' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'El nombre de usuario ya existe' });
  });

  test('otros errores de BD devuelven 400 genérico y se registran en el servidor', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(s.db, 'prepare').mockImplementationOnce(() => {
      throw new Error('SQLITE_FULL: database or disk is full');
    });
    const res = await createUser({ username: 'fallo' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'No se pudo crear el usuario' });
    expect(console.error).toHaveBeenCalled();
  });
});

describe('PUT /api/users/:id/role', () => {
  test('acepta cada rol válido y lo persiste', async () => {
    const id = ((await (await createUser({ username: 'rotativo' })).json()) as any).id;
    for (const role of ['agent', 'admin', 'viewer']) {
      const res = await setRole(id, { role });
      expect(res.status, role).toBe(200);
      expect(await res.json()).toEqual({ id, username: 'rotativo', role });
    }
  });

  test('rechaza roles inválidos, ids inválidos e ids inexistentes', async () => {
    for (const body of [{}, { role: 'root' }, { role: 'Admin' }, { role: null }, { role: ['admin'] }]) {
      expect((await setRole(s.ids.viewer, body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await setRole('abc', { role: 'admin' })).status).toBe(400);
    expect((await setRole(99999, { role: 'admin' })).status).toBe(404);
    const viewer = (await (await s.api(`/api/users/${s.ids.viewer}`)).json()) as any;
    expect(viewer.role).toBe('viewer');
  });
});

describe('autorización', () => {
  test('sin autenticación no se puede crear usuarios ni cambiar roles', async () => {
    expect((await s.api('/api/users', { method: 'POST', token: null, body: '{"username":"x"}' })).status).toBe(401);
    expect((await s.api('/api/users/1/role', { method: 'PUT', token: null, body: '{"role":"admin"}' })).status).toBe(401);
  });

  // Vulnerabilidades conocidas del laboratorio (A01 / CWE-862 y CWE-915): no hay control de rol.
  test.fails('[vuln. conocida A01] un viewer no puede escalar su propio rol a admin', async () => {
    const res = await s.api(`/api/users/${s.ids.viewer}/role`, {
      method: 'PUT',
      token: s.tokens.viewer,
      body: JSON.stringify({ role: 'admin' }),
    });
    s.db.prepare("UPDATE users SET role = 'viewer' WHERE id = ?").run(s.ids.viewer);
    expect(res.status).toBe(403);
  });

  test.fails('[vuln. conocida A01] un viewer no puede crear cuentas de administrador', async () => {
    const res = await createUser({ username: 'intruso', role: 'admin' }, s.tokens.viewer);
    expect(res.status).toBe(403);
  });
});
