import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { resetNav } from './next-state';

// next/navigation y next/link necesitan el router de Next; en las pruebas se sustituyen
// por dobles cuyo estado controla cada prueba a través de next-state.ts.
vi.mock('next/navigation', async () => {
  const { router, nav } = await import('./next-state');
  return {
    useRouter: () => router,
    usePathname: () => nav.pathname,
    useSearchParams: () => nav.searchParams,
    useParams: () => nav.params,
  };
});

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetNav();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
