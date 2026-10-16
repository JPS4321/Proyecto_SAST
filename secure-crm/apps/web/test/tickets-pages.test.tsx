// Páginas /tickets (listado y búsqueda) y /tickets/[id] (detalle, guardado y borrado).
import { describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TicketsPage from '@/app/tickets/page';
import TicketDetail from '@/app/tickets/[id]/page';
import { fakeApi, login, ticket } from './fake-api';
import { nav, router } from './next-state';

describe('/tickets', () => {
  test('muestra el indicador de carga y luego la lista de tickets', async () => {
    login();
    fakeApi({
      'GET /api/tickets': () => ({
        body: { query: '', tickets: [ticket(), ticket({ id: 8, title: 'Factura', assigneeName: 'Ana Agente', status: 'closed' })] },
      }),
    });
    const { container } = render(<TicketsPage />);
    expect(container.querySelector('.animate-spin')).not.toBeNull();
    await screen.findByText('Impresora sin tóner');
    expect(container.querySelector('.animate-spin')).toBeNull();
    expect(screen.getByText('Factura').closest('a')?.getAttribute('href')).toBe('/tickets/8');
    expect(screen.getByText('Sin asignar')).toBeTruthy();
    expect(screen.getByText('Ana Agente')).toBeTruthy();
    expect(screen.getByText('Cerrado')).toBeTruthy();
    expect(screen.queryByText('No hay tickets')).toBeNull();
    expect(screen.queryByText(/Resultados para/)).toBeNull();
  });

  test('sin resultados muestra el estado vacío', async () => {
    login();
    fakeApi({ 'GET /api/tickets': () => ({ body: { query: '', tickets: [] } }) });
    render(<TicketsPage />);
    expect(await screen.findByText('No hay tickets')).toBeTruthy();
  });

  test('un error de la API se muestra al usuario', async () => {
    login();
    fakeApi({ 'GET /api/tickets': () => ({ status: 400, body: { error: 'El parámetro q supera 200 caracteres' } }) });
    render(<TicketsPage />);
    expect(await screen.findByText('El parámetro q supera 200 caracteres')).toBeTruthy();
    expect(screen.getByText('No hay tickets')).toBeTruthy();
  });

  test('usa ?q= inicial y al buscar actualiza la URL y consulta la API codificando el término', async () => {
    login();
    nav.searchParams = new URLSearchParams('q=factura');
    const queries: string[] = [];
    fakeApi({
      'GET /api/tickets': ({ url }) => {
        const q = url.searchParams.get('q') ?? '';
        queries.push(q);
        return { body: { query: q, tickets: q ? [ticket({ title: `Resultado ${q}` })] : [] } };
      },
    });
    render(<TicketsPage />);
    expect(await screen.findByText('Resultado factura')).toBeTruthy();
    expect(screen.getByText(/Resultados para/).textContent).toContain('factura');

    const input = screen.getByPlaceholderText(/Buscar por título/);
    fireEvent.change(input, { target: { value: "O'Brien & co" } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(router.replace).toHaveBeenLastCalledWith('/tickets?q=O\'Brien%20%26%20co');
    expect(await screen.findByText("Resultado O'Brien & co")).toBeTruthy();

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(router.replace).toHaveBeenLastCalledWith('/tickets');
    expect(await screen.findByText('No hay tickets')).toBeTruthy();
    expect(queries).toEqual(['factura', "O'Brien & co", '']);
  });
});

describe('/tickets/[id]', () => {
  function setup(routes: Parameters<typeof fakeApi>[0]) {
    login();
    nav.params = { id: '7' };
    return fakeApi({ 'GET /api/tickets/7': () => ({ body: ticket() }), ...routes });
  }

  test('muestra carga y luego el detalle del ticket', async () => {
    setup({});
    const { container } = render(<TicketDetail />);
    expect(container.querySelector('.animate-spin')).not.toBeNull();
    expect(await screen.findByDisplayValue('Impresora sin tóner')).toBeTruthy();
    expect(screen.getByText('maya@cliente.gt')).toBeTruthy();
    expect(screen.getByText('Sin asignar')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeTruthy();
  });

  test('si el ticket no existe muestra el error', async () => {
    setup({ 'GET /api/tickets/7': () => ({ status: 404, body: { error: 'Ticket no encontrado' } }) });
    render(<TicketDetail />);
    expect(await screen.findByText('Ticket no encontrado')).toBeTruthy();
  });

  test('guardar envía los cambios y la etiqueta pasa por Guardando… y Guardado', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const sent: any[] = [];
    setup({
      'PUT /api/tickets/7': async ({ body }) => {
        sent.push(body);
        await gate;
        return { body: { ...ticket(), ...body, assigneeName: 'Ana Agente' } };
      },
    });
    render(<TicketDetail />);
    fireEvent.change(await screen.findByDisplayValue('Impresora sin tóner'), { target: { value: 'Título editado' } });
    fireEvent.change(screen.getByDisplayValue('Solicitan reposición'), { target: { value: 'Nueva desc' } });
    fireEvent.change(screen.getByDisplayValue('Abierto'), { target: { value: 'closed' } });
    fireEvent.change(screen.getByDisplayValue('Alta'), { target: { value: 'low' } });

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
      const busy = await screen.findByRole('button', { name: 'Guardando…' });
      expect((busy as HTMLButtonElement).disabled).toBe(true);
      release();
      expect(await screen.findByRole('button', { name: 'Guardado' })).toBeTruthy();
      expect(screen.getByText('Ana Agente')).toBeTruthy();
      expect(sent[0]).toMatchObject({ title: 'Título editado', description: 'Nueva desc', status: 'closed', priority: 'low' });
      await act(() => vi.advanceTimersByTimeAsync(2000));
      expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  test('un error al guardar se muestra sin perder el formulario', async () => {
    setup({ 'PUT /api/tickets/7': () => ({ status: 400, body: { error: 'Estado inválido' } }) });
    render(<TicketDetail />);
    await screen.findByDisplayValue('Impresora sin tóner');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Estado inválido')).toBeTruthy();
    expect(screen.getByDisplayValue('Impresora sin tóner')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeTruthy();
  });

  test('eliminar pide confirmación; si se acepta borra y vuelve al listado', async () => {
    const del = vi.fn(() => ({ body: { ok: true } }));
    setup({ 'DELETE /api/tickets/7': del });
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal('confirm', confirm);
    render(<TicketDetail />);
    await screen.findByDisplayValue('Impresora sin tóner');

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(confirm).toHaveBeenCalledWith('¿Eliminar este ticket?');
    expect(del).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/tickets'));
    expect(del).toHaveBeenCalledOnce();
  });
});
