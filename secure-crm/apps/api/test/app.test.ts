// Configuración global de la app: cabeceras, salud, dashboard y manejador de errores.
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { startServer, type TestServer } from './helpers';

let s: TestServer;
beforeAll(async () => {
  s = await startServer();
});
afterAll(() => s.close());
afterEach(() => vi.restoreAllMocks());

describe('app', () => {
  test('GET /api/health responde sin autenticación', async () => {
    const res = await s.api('/api/health', { token: null });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', service: 'secure-crm-api' });
  });

  test('no revela el framework en X-Powered-By', async () => {
    const res = await s.api('/api/health');
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  test('GET /api/dashboard agrega los tickets por estado, prioridad y agente', async () => {
    const add = (title: string, extra: object) =>
      s.api('/api/tickets', { method: 'POST', body: JSON.stringify({ title, ...extra }) });
    await add('A', { status: 'closed', priority: 'urgent', assigneeId: s.ids.agent });
    await add('B', { status: 'open', priority: 'low' });
    const res = await s.api('/api/dashboard', { token: s.tokens.viewer });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.totalTickets).toBe(2);
    expect(body.byStatus).toEqual({ open: 1, in_progress: 0, closed: 1 });
    expect(body.byPriority).toEqual({ low: 1, medium: 0, high: 0, urgent: 1 });
    expect(body.byAgent).toEqual(
      expect.arrayContaining([
        { assigneeName: 'Ana Agente', count: 1 },
        { assigneeName: 'Sin asignar', count: 1 },
      ])
    );
    expect(body.recent).toHaveLength(2);
  });
});

describe('manejador de errores', () => {
  test('cuerpo mayor a 100kb devuelve 413 sin detalles', async () => {
    const res = await s.api('/api/tickets', { method: 'POST', body: JSON.stringify({ title: 'x'.repeat(110_000) }) });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'Cuerpo de la petición demasiado grande' });
  });

  test('otros errores 4xx del parser devuelven un mensaje genérico', async () => {
    const res = await s.api('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=latin-9' },
      body: '{"title":"x"}',
    });
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: 'Petición inválida' });
  });

  test('un error inesperado devuelve 500 sin stack ni mensaje interno', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(s.db, 'prepare').mockImplementationOnce(() => {
      throw new Error('SQLITE_CORRUPT: database disk image is malformed');
    });
    const res = await s.api('/api/dashboard');
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: 'Error interno del servidor' });
    expect(text).not.toMatch(/SQLITE|stack|at /);
    expect(console.error).toHaveBeenCalled();
  });
});
