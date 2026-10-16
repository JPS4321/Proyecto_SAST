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
  test('envía las cabeceras de seguridad en todas las rutas y oculta X-Powered-By', async () => {
    const { default: config } = await import('../next.config.mjs');
    expect(config.reactStrictMode).toBe(true);
    expect(config.poweredByHeader).toBe(false);
    const rules = await config.headers?.();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe('/:path*');
    const headers = Object.fromEntries(rules[0].headers.map((h: { key: string; value: string }) => [h.key, h.value]));
    expect(headers).toMatchObject({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    expect(headers['Permissions-Policy']).toContain('camera=()');
    // La CSP lleva nonce por petición: no debe fijarse aquí (se enviaría duplicada).
    expect(headers).not.toHaveProperty('Content-Security-Policy');
  });
});

describe('NotFound', () => {
  test('página 404 propia sin <style> inline', async () => {
    const { default: NotFound } = await import('@/app/not-found');
    const html = renderToStaticMarkup(<NotFound />);
    expect(html).toContain('Página no encontrada');
    expect(html).toContain('href="/"');
    expect(html).not.toContain('<style');
  });
});
