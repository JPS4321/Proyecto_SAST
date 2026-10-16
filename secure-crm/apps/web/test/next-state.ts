// Estado compartido de los dobles de next/navigation (ver setup.tsx).
import { vi } from 'vitest';

export const router = { replace: vi.fn(), push: vi.fn() };
export const nav = {
  pathname: '/tickets',
  searchParams: new URLSearchParams(),
  params: {} as Record<string, string>,
};

export function resetNav() {
  router.replace.mockReset();
  router.push.mockReset();
  nav.pathname = '/tickets';
  nav.searchParams = new URLSearchParams();
  nav.params = {};
}
