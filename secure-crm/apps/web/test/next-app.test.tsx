// Layout raíz y configuración de Next (cabeceras de seguridad).
import { describe, expect, test, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// next/font/google descarga fuentes en tiempo de build; aquí basta con la clase de variable.
vi.mock('next/font/google', () => {
  const font = (opts: { variable: string }) => ({ variable: opts.variable.replace('--', 'var-') });
  return { Inter: font, Bricolage_Grotesque: font, JetBrains_Mono: font };
});

describe('RootLayout', () => {
  test('declara el idioma, las fuentes y renderiza a los hijos', async () => {
    const { default: RootLayout, metadata } = await import('@/app/layout');
    const html = renderToStaticMarkup(
      <RootLayout>
        <main>hola</main>
      </RootLayout>
    );
    expect(html).toContain('<html lang="es" class="var-font-inter var-font-display var-font-mono">');
    expect(html).toContain('<body class="font-sans antialiased"><main>hola</main></body>');
    expect(metadata.title).toContain('Secure CRM');
  });
});

describe('next.config.mjs', () => {
  test('envía X-Content-Type-Options: nosniff en todas las rutas', async () => {
    const { default: config } = await import('../next.config.mjs');
    expect(config.reactStrictMode).toBe(true);
    expect(await config.headers?.()).toEqual([
      { source: '/:path*', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }] },
    ]);
  });
});
