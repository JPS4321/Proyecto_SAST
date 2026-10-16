// Rutas /api/tickets: CRUD completo, valores por defecto, validación y autorización.
// Las pruebas de búsqueda y SQL Injection en ?q= están en api.test.ts.
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startServer, type TestServer } from './helpers';

let s: TestServer;
beforeAll(async () => {
  s = await startServer();
});
afterAll(() => s.close());

async function create(body: unknown, token?: string) {
  const res = await s.api('/api/tickets', { method: 'POST', body: JSON.stringify(body), token });
  return { res, body: (await res.json()) as any };
}

describe('POST /api/tickets', () => {
  test('aplica valores por defecto y toma el creador del token', async () => {
    const { res, body } = await create({ title: 'Solo título', createdById: 999 });
    expect(res.status).toBe(201);
    expect(body).toMatchObject({
      title: 'Solo título',
      description: '',
      status: 'open',
      priority: 'medium',
      customerName: '',
      customerEmail: '',
      assigneeId: null,
      assigneeName: null,
      createdById: s.ids.admin,
      createdByName: 'Ada Admin',
    });
  });

  test('acepta cada estado y prioridad válidos y asigna un agente', async () => {
    for (const status of ['open', 'in_progress', 'closed']) {
      for (const priority of ['low', 'medium', 'high', 'urgent']) {
        const { res, body } = await create({ title: `${status}/${priority}`, status, priority, assigneeId: s.ids.agent });
        expect(res.status).toBe(201);
        expect(body).toMatchObject({ status, priority, assigneeId: s.ids.agent, assigneeName: 'Ana Agente' });
      }
    }
  });

  test('guarda payloads de SQL Injection como texto literal', async () => {
    const title = "x'); DELETE FROM tickets; --";
    const { res, body } = await create({ title, description: "' OR '1'='1" });
    expect(res.status).toBe(201);
    const fetched = (await (await s.api(`/api/tickets/${body.id}`)).json()) as any;
    expect(fetched.title).toBe(title);
    expect(fetched.description).toBe("' OR '1'='1");
  });

  test('rechaza cuerpos no-objeto, textos demasiado largos y valores fuera de lista', async () => {
    const cases: [unknown, string][] = [
      [['a'], 'Cuerpo inválido'],
      [{ title: 't'.repeat(201) }, 'El campo title supera 200 caracteres'],
      [{ description: 'd'.repeat(5001) }, 'El campo description supera 5000 caracteres'],
      [{ customerEmail: 'e'.repeat(255) }, 'El campo customerEmail supera 254 caracteres'],
      [{ customerName: false }, 'El campo customerName debe ser texto'],
      [{ status: 'OPEN' }, 'Estado inválido'],
      [{ status: ['open'] }, 'Estado inválido'],
      [{ priority: 'critical' }, 'Prioridad inválida'],
      [{ assigneeId: 0 }, 'assigneeId inválido'],
      [{ assigneeId: -3 }, 'assigneeId inválido'],
      [{ assigneeId: 2 ** 53 }, 'assigneeId inválido'],
    ];
    for (const [body, error] of cases) {
      const r = await create(body);
      expect(r.res.status, JSON.stringify(body)).toBe(400);
      expect(r.body).toEqual({ error });
    }
  });

  test('un cuerpo vacío crea un ticket con todos los valores por defecto', async () => {
    const { res, body } = await create({});
    expect(res.status).toBe(201);
    expect(body).toMatchObject({ title: '', description: '', status: 'open', priority: 'medium', customerName: '' });
  });

  test('null en campos opcionales equivale a omitirlos', async () => {
    const { res, body } = await create({ title: 'Con nulls', description: null, status: null, priority: null, assigneeId: null });
    expect(res.status).toBe(201);
    expect(body).toMatchObject({ description: '', status: 'open', priority: 'medium', assigneeId: null });
  });
});

describe('GET /api/tickets/:id', () => {
  test('devuelve el ticket mapeado a camelCase', async () => {
    const { body: created } = await create({ title: 'Detalle', customerName: 'Cliente', customerEmail: 'c@x.gt' });
    const res = await s.api(`/api/tickets/${created.id}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(created);
  });

  test('id inexistente devuelve 404', async () => {
    const res = await s.api('/api/tickets/99999');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Ticket no encontrado' });
  });
});

describe('PUT /api/tickets/:id', () => {
  test('actualiza solo los campos enviados y conserva el resto', async () => {
    const { body: created } = await create({ title: 'Original', description: 'desc', priority: 'low', customerName: 'Cli' });
    const res = await s.api(`/api/tickets/${created.id}`, { method: 'PUT', body: JSON.stringify({ priority: 'urgent' }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ title: 'Original', description: 'desc', priority: 'urgent', customerName: 'Cli', status: 'open' });
  });

  test('actualiza todos los campos a la vez', async () => {
    const { body: created } = await create({ title: 'Viejo' });
    const changes = {
      title: 'Nuevo',
      description: 'Nueva desc',
      status: 'in_progress',
      priority: 'high',
      customerName: 'Otro cliente',
      customerEmail: 'otro@x.gt',
      assigneeId: s.ids.agent,
    };
    const res = await s.api(`/api/tickets/${created.id}`, { method: 'PUT', body: JSON.stringify(changes) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ...changes, assigneeName: 'Ana Agente' });
  });

  test('id inválido devuelve 400 e inexistente 404', async () => {
    expect((await s.api('/api/tickets/abc', { method: 'PUT', body: '{}' })).status).toBe(400);
    expect((await s.api('/api/tickets/99999', { method: 'PUT', body: '{}' })).status).toBe(404);
  });
});

describe('DELETE /api/tickets/:id', () => {
  test('elimina el ticket; una segunda vez devuelve 404', async () => {
    const { body: created } = await create({ title: 'Borrar' });
    const del = await s.api(`/api/tickets/${created.id}`, { method: 'DELETE' });
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ ok: true });
    expect((await s.api(`/api/tickets/${created.id}`)).status).toBe(404);
    expect((await s.api(`/api/tickets/${created.id}`, { method: 'DELETE' })).status).toBe(404);
  });

  test('id inválido devuelve 400 y no borra nada', async () => {
    const before = (s.db.prepare('SELECT COUNT(*) AS c FROM tickets').get() as any).c;
    for (const id of ['abc', '1 OR 1=1', '0']) {
      expect((await s.api('/api/tickets/' + encodeURIComponent(id), { method: 'DELETE' })).status, id).toBe(400);
    }
    expect((s.db.prepare('SELECT COUNT(*) AS c FROM tickets').get() as any).c).toBe(before);
  });
});

describe('autorización', () => {
  test('sin token no se puede leer, crear, editar ni borrar', async () => {
    const opts = { token: null, body: '{"title":"x"}' };
    expect((await s.api('/api/tickets/1', { token: null })).status).toBe(401);
    expect((await s.api('/api/tickets', { ...opts, method: 'POST' })).status).toBe(401);
    expect((await s.api('/api/tickets/1', { ...opts, method: 'PUT' })).status).toBe(401);
    expect((await s.api('/api/tickets/1', { token: null, method: 'DELETE' })).status).toBe(401);
  });

  // Vulnerabilidad conocida del laboratorio (A01): un 'viewer' (solo lectura) puede escribir.
  test.fails('[vuln. conocida A01] un viewer no puede crear tickets', async () => {
    const { res } = await create({ title: 'Desde viewer' }, s.tokens.viewer);
    expect(res.status).toBe(403);
  });
});
