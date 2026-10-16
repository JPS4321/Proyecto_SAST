// Pruebas de la API contra la app Express real y una BD SQLite en memoria.
// Ejecutar con: pnpm --filter @secure-crm/api test
import { test, beforeAll as before, afterAll as after } from 'vitest';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';

let server: Server;
let baseUrl: string;
let adminToken: string;
let viewerToken: string;

const TICKETS = [
  { title: 'Error al exportar a PDF', description: 'El botón no responde en Safari.', customer: 'Comercial El Quetzal' },
  { title: 'Factura duplicada', description: 'Aparece dos veces el cargo de septiembre.', customer: 'Cafés de Guatemala' },
  { title: "Impresora de O'Brien sin tóner", description: 'Solicitan reposición urgente.', customer: 'Constructora Maya' },
];

before(async () => {
  // La BD se elige al importar db.ts: se fija antes de cargar la app.
  process.env.DB_PATH = ':memory:';
  const { db, initSchema } = await import('../src/db');
  const { app } = await import('../src/app');
  const { JWT_SECRET } = await import('../src/auth');
  initSchema();

  const insertUser = db.prepare(
    `INSERT INTO users (username, email, full_name, role, password_hash) VALUES (?, ?, ?, ?, ?)`
  );
  const adminId = Number(insertUser.run('admin', 'admin@test.local', 'Ada Admin', 'admin', 'scrypt$aa$bb').lastInsertRowid);
  const viewerId = Number(insertUser.run('viewer', 'viewer@test.local', 'Víctor Vista', 'viewer', 'scrypt$cc$dd').lastInsertRowid);

  const insertTicket = db.prepare(
    `INSERT INTO tickets (title, description, customer_name, customer_email, created_by_id) VALUES (?, ?, ?, ?, ?)`
  );
  for (const t of TICKETS) insertTicket.run(t.title, t.description, t.customer, 'c@test.local', adminId);

  adminToken = jwt.sign({ sub: adminId, username: 'admin', role: 'admin' }, JWT_SECRET);
  viewerToken = jwt.sign({ sub: viewerId, username: 'viewer', role: 'viewer' }, JWT_SECRET);

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => new Promise<void>((resolve) => server.close(() => resolve())));

function api(path: string, init: RequestInit & { token?: string | null } = {}) {
  const { token = adminToken, ...rest } = init;
  return fetch(baseUrl + path, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...rest.headers,
    },
  });
}

async function search(q: string) {
  const res = await api('/api/tickets?q=' + encodeURIComponent(q));
  return { res, body: (await res.json()) as any };
}

// --- SQL Injection (ZAP 40018) ---------------------------------------------

test('una comilla simple no provoca error SQL', async () => {
  const { res, body } = await search("'");
  assert.equal(res.status, 200);
  assert.equal(body.query, "'");
  // Solo coincide el ticket que contiene una comilla literal en su título.
  assert.deepEqual(body.tickets.map((t: any) => t.title), ["Impresora de O'Brien sin tóner"]);
});

test('payloads de inyección se tratan como texto y no alteran la consulta', async () => {
  for (const payload of [
    "' OR '1'='1",
    "' OR 1=1 --",
    "%' OR 1=1 --",
    "x' UNION SELECT id, username, password_hash, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1 FROM users --",
    "'; DROP TABLE tickets; --",
  ]) {
    const { res, body } = await search(payload);
    assert.equal(res.status, 200, payload);
    assert.deepEqual(body.tickets, [], `no debería devolver filas para: ${payload}`);
  }
  // La tabla sigue intacta tras el intento de DROP.
  const { body } = await search('');
  assert.equal(body.tickets.length, TICKETS.length);
});

test('los comodines de LIKE del usuario se buscan literalmente', async () => {
  assert.deepEqual((await search('%')).body.tickets, []);
  assert.deepEqual((await search('_')).body.tickets, []);
});

// --- Búsquedas legítimas ---------------------------------------------------

test('sin q devuelve todos los tickets', async () => {
  const { res, body } = await search('');
  assert.equal(res.status, 200);
  assert.equal(body.tickets.length, TICKETS.length);
});

test('busca por título, descripción y nombre del cliente', async () => {
  assert.deepEqual((await search('PDF')).body.tickets.map((t: any) => t.title), ['Error al exportar a PDF']);
  assert.deepEqual((await search('septiembre')).body.tickets.map((t: any) => t.title), ['Factura duplicada']);
  assert.deepEqual((await search('Constructora')).body.tickets.map((t: any) => t.customerName), ['Constructora Maya']);
});

test('la búsqueda no distingue mayúsculas (ASCII) y admite comillas legítimas', async () => {
  assert.equal((await search('factura')).body.tickets.length, 1);
  const { res, body } = await search("O'Brien");
  assert.equal(res.status, 200);
  assert.deepEqual(body.tickets.map((t: any) => t.title), ["Impresora de O'Brien sin tóner"]);
});

// --- Validación de entradas y errores (ZAP 100000) -------------------------

test('q repetido o demasiado largo devuelve 400, no 500', async () => {
  const dup = await api('/api/tickets?q=a&q=b');
  assert.equal(dup.status, 400);
  const nested = await api('/api/tickets?q[x]=1');
  assert.equal(nested.status, 400);
  const long = await api('/api/tickets?q=' + 'a'.repeat(201));
  assert.equal(long.status, 400);
});

test('ids no numéricos devuelven 400', async () => {
  for (const id of ['abc', "1'", '-1', '0', '1e3']) {
    const res = await api('/api/tickets/' + encodeURIComponent(id));
    assert.equal(res.status, 400, id);
  }
});

test('tipos inesperados en el cuerpo devuelven 400', async () => {
  const cases = [
    { title: { $gt: '' } },
    { title: ['a'] },
    { description: 123 },
    { status: 'hacked' },
    { priority: 'x' },
    { assigneeId: 'abc' },
    { assigneeId: 1.5 },
  ];
  for (const body of cases) {
    const res = await api('/api/tickets', { method: 'POST', body: JSON.stringify(body) });
    assert.equal(res.status, 400, JSON.stringify(body));
    const put = await api('/api/tickets/1', { method: 'PUT', body: JSON.stringify(body) });
    assert.equal(put.status, 400, JSON.stringify(body));
  }
});

test('crear y editar tickets válidos sigue funcionando (campos extra se ignoran)', async () => {
  const res = await api('/api/tickets', {
    method: 'POST',
    body: JSON.stringify({ title: 'Nuevo', description: 'd', priority: 'high', status: 'open', customerName: 'C', customerEmail: 'c@x.gt' }),
  });
  assert.equal(res.status, 201);
  const created = (await res.json()) as any;
  const put = await api(`/api/tickets/${created.id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...created, status: 'closed', assigneeName: null }),
  });
  assert.equal(put.status, 200);
  assert.equal(((await put.json()) as any).status, 'closed');
  assert.equal((await api(`/api/tickets/${created.id}`, { method: 'DELETE' })).status, 200);
});

test('JSON malformado devuelve 400 sin stack ni detalles internos', async () => {
  const res = await api('/api/tickets', { method: 'POST', body: '{"title": ' });
  assert.equal(res.status, 400);
  const body = (await res.json()) as any;
  assert.deepEqual(Object.keys(body), ['error']);
  assert.doesNotMatch(JSON.stringify(body), /stack|at \w+ \(|SyntaxError/);
});

// --- Cabeceras y Content-Type (ZAP 10021 / 100001) -------------------------

test('X-Content-Type-Options: nosniff en respuestas 200, 400, 401 y 404', async () => {
  const responses = [
    await api('/api/dashboard'),
    await api('/api/tickets'),
    await api('/api/users'),
    await api('/api/tickets/abc'),
    await api('/api/tickets', { token: null }),
    await api('/api/no-existe'),
  ];
  for (const res of responses) assert.equal(res.headers.get('x-content-type-options'), 'nosniff', res.url);
});

test('las rutas inexistentes devuelven 404 en JSON', async () => {
  for (const [method, path] of [['GET', '/api/no-existe'], ['POST', '/no-existe'], ['DELETE', '/api/tickets']]) {
    const res = await api(path, { method });
    assert.equal(res.status, 404, `${method} ${path}`);
    assert.match(res.headers.get('content-type') ?? '', /^application\/json/);
    assert.deepEqual(await res.json(), { error: 'Recurso no encontrado' });
  }
});

// --- PII en /api/users (ZAP 10062) -----------------------------------------

test('/api/users nunca devuelve el hash de la contraseña', async () => {
  const res = await api('/api/users');
  const text = await res.text();
  assert.equal(res.status, 200);
  assert.doesNotMatch(text, /passwordHash|password_hash|scrypt\$/);
  const one = await (await api('/api/users/1')).text();
  assert.doesNotMatch(one, /passwordHash|password_hash|scrypt\$/);
});

test('el correo solo se incluye para administradores', async () => {
  const asAdmin = (await (await api('/api/users')).json()) as any[];
  assert.equal(asAdmin[0].email, 'admin@test.local');
  const asViewer = (await (await api('/api/users', { token: viewerToken })).json()) as any[];
  assert.equal(asViewer.length, 2);
  for (const u of asViewer) {
    assert.equal(u.email, undefined);
    assert.ok(u.username && u.fullName && u.role);
  }
});

test('validación en usuarios: rol inválido y duplicados no generan 500', async () => {
  assert.equal((await api('/api/users/1/role', { method: 'PUT', body: '{}' })).status, 400);
  assert.equal((await api('/api/users/1/role', { method: 'PUT', body: '{"role":"root"}' })).status, 400);
  const dup = await api('/api/users', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'x' }) });
  assert.equal(dup.status, 409);
  assert.deepEqual(Object.keys((await dup.json()) as any), ['error']);
  const bad = await api('/api/users', { method: 'POST', body: JSON.stringify({ username: { a: 1 } }) });
  assert.equal(bad.status, 400);
});
