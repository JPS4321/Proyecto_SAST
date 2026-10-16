// AppShell + useAuth: protección de rutas en el cliente, menú por rol y cierre de sesión.
import { describe, expect, test } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AppShell } from '@/components/AppShell';
import { getToken } from '@/lib/api';
import { login } from './fake-api';
import { nav, router } from './next-state';

describe('AppShell', () => {
  test('sin sesión redirige a /login y no muestra el contenido', () => {
    render(<AppShell><p>privado</p></AppShell>);
    expect(router.replace).toHaveBeenCalledWith('/login');
    expect(screen.queryByText('privado')).toBeNull();
  });

  test('un admin ve el menú completo y el enlace activo marcado', () => {
    login({ fullName: 'Ada Admin', role: 'admin' });
    nav.pathname = '/tickets/7';
    render(<AppShell><p>contenido</p></AppShell>);
    expect(screen.getByText('contenido')).toBeTruthy();
    expect(screen.getByText('Usuarios y roles')).toBeTruthy();
    expect(screen.getByText('Tickets').className).toContain('bg-white/10');
    expect(screen.getByText('Panel').className).toContain('text-white/60');
    expect(screen.getByText('Ada Admin')).toBeTruthy();
  });

  test('un viewer no ve la administración de usuarios', () => {
    login({ username: 'viewer', fullName: 'Víctor', role: 'viewer' });
    render(<AppShell><p>contenido</p></AppShell>);
    expect(screen.queryByText('Usuarios y roles')).toBeNull();
    expect(screen.getByText('viewer')).toBeTruthy();
  });

  test('cerrar sesión borra el token y vuelve al login', () => {
    login();
    render(<AppShell><p>contenido</p></AppShell>);
    fireEvent.click(screen.getByText('Cerrar sesión'));
    expect(getToken()).toBeNull();
    expect(router.replace).toHaveBeenCalledWith('/login');
    login();
    fireEvent.click(screen.getByText('Salir'));
    expect(getToken()).toBeNull();
  });
});
