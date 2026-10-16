// Sustituye fetch por un backend en memoria: cada ruta "MÉTODO /ruta" devuelve { status, body }.
// Así se ejercita el cliente real de lib/api.ts sin depender de la API en ejecución.
import { vi } from 'vitest';
import type { Ticket, User } from '@secure-crm/shared';

export type Handler = (req: { method: string; url: URL; body: any; headers: Record<string, string> }) =>
  | { status?: number; body?: unknown }
  | Promise<{ status?: number; body?: unknown }>;

export function fakeApi(routes: Record<string, Handler>) {
  const fetchMock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    const handler = routes[`${method} ${url.pathname}`];
    if (!handler) return new Response(JSON.stringify({ error: 'Recurso no encontrado' }), { status: 404 });
    const { status = 200, body } = await handler({
      method,
      url,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      headers: init.headers as Record<string, string>,
    });
    return new Response(body === undefined ? '' : JSON.stringify(body), { status });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export function login(user: Partial<User> = {}) {
  const full: User = { id: 1, username: 'admin', fullName: 'Ada Admin', role: 'admin', createdAt: '2026-01-01', ...user };
  localStorage.setItem('crm_token', 'token-de-prueba');
  localStorage.setItem('crm_user', JSON.stringify(full));
  return full;
}

export function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 7,
    title: 'Impresora sin tóner',
    description: 'Solicitan reposición',
    status: 'open',
    priority: 'high',
    customerName: 'Constructora Maya',
    customerEmail: 'maya@cliente.gt',
    assigneeId: null,
    assigneeName: null,
    createdById: 1,
    createdAt: '2026-10-01 10:00:00',
    updatedAt: '2026-10-01 10:00:00',
    ...overrides,
  };
}
