// Cliente HTTP del frontend (lib/api.ts): sesión, cabeceras, URLs y manejo de errores.
import { describe, expect, test } from 'vitest';
import { API_URL, api, clearSession, getToken, getUser, saveSession } from '@/lib/api';
import { fakeApi, login } from './fake-api';

describe('sesión en localStorage', () => {
  test('guarda, lee y borra el token y el usuario', () => {
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
    const user = { id: 3, username: 'ana', fullName: 'Ana', role: 'agent' as const, createdAt: 'x' };
    saveSession({ token: 'abc', user });
    expect(getToken()).toBe('abc');
    expect(getUser()).toEqual(user);
    clearSession();
    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
  });
});

describe('request', () => {
  test('usa NEXT_PUBLIC_API_URL y envía el token como Bearer', async () => {
    login();
    const fetchMock = fakeApi({ 'GET /api/dashboard': () => ({ body: { totalTickets: 0 } }) });
    expect(API_URL).toBe('http://api.test');
    expect(await api.dashboard()).toEqual({ totalTickets: 0 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/api/dashboard');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer token-de-prueba' });
  });

  test('sin sesión no envía Authorization', async () => {
    const fetchMock = fakeApi({ 'GET /api/users': () => ({ body: [] }) });
    await api.users();
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  test('propaga el mensaje de error de la API, o uno genérico con el código', async () => {
    fakeApi({
      'GET /api/tickets/1': () => ({ status: 404, body: { error: 'Ticket no encontrado' } }),
      'GET /api/tickets/2': () => ({ status: 400, body: { message: 'Mensaje alterno' } }),
      'GET /api/tickets/3': () => ({ status: 502 }),
    });
    await expect(api.ticket(1)).rejects.toThrow('Ticket no encontrado');
    await expect(api.ticket(2)).rejects.toThrow('Mensaje alterno');
    await expect(api.ticket(3)).rejects.toThrow('Error 502');
  });

  test('una respuesta vacía con 2xx devuelve null', async () => {
    fakeApi({ 'DELETE /api/tickets/5': () => ({ status: 200 }) });
    expect(await api.deleteTicket(5)).toBeNull();
  });
});

describe('endpoints', () => {
  test('tickets() codifica el término de búsqueda y lo omite si está vacío', async () => {
    const seen: string[] = [];
    fakeApi({ 'GET /api/tickets': ({ url }) => (seen.push(url.search), { body: { query: '', tickets: [] } }) });
    await api.tickets();
    await api.tickets('');
    await api.tickets("O'Brien & <b>hola</b>");
    expect(seen).toEqual(['', '', '?q=O%27Brien%20%26%20%3Cb%3Ehola%3C%2Fb%3E']);
  });

  test('cada operación usa el método, la ruta y el cuerpo correctos', async () => {
    const calls: unknown[] = [];
    const record = (status = 200) => (req: any) => (calls.push([req.method, req.url.pathname, req.body]), { status, body: {} });
    fakeApi({
      'POST /api/auth/login': record(),
      'POST /api/tickets': record(201),
      'PUT /api/tickets/9': record(),
      'DELETE /api/tickets/9': record(),
      'POST /api/users': record(201),
      'PUT /api/users/4/role': record(),
    });
    await api.login('admin', 'secreto');
    await api.createTicket({ title: 'Nuevo' });
    await api.updateTicket(9, { status: 'closed' });
    await api.deleteTicket(9);
    await api.createUser({ username: 'u' });
    await api.setRole(4, 'agent');
    expect(calls).toEqual([
      ['POST', '/api/auth/login', { username: 'admin', password: 'secreto' }],
      ['POST', '/api/tickets', { title: 'Nuevo' }],
      ['PUT', '/api/tickets/9', { status: 'closed' }],
      ['DELETE', '/api/tickets/9', undefined],
      ['POST', '/api/users', { username: 'u' }],
      ['PUT', '/api/users/4/role', { role: 'agent' }],
    ]);
  });
});
