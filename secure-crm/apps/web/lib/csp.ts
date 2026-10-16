// Content-Security-Policy de la web (ZAP 10038 / 10055, CWE-693).
// Se genera por petición en middleware.ts con un nonce aleatorio: Next.js lo detecta en la
// cabecera de la petición y lo añade a sus propios <script>, así que no hace falta
// 'unsafe-inline' en script-src y cualquier script inline inyectado queda bloqueado.

// Origen de la API que consume el navegador (connect-src). Solo el origen, nunca un comodín.
export function apiOrigin(apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'): string | null {
  try {
    return new URL(apiUrl).origin;
  } catch {
    return null;
  }
}

export function buildCsp(
  nonce: string,
  { dev = process.env.NODE_ENV === 'development', api = apiOrigin() }: { dev?: boolean; api?: string | null } = {}
): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // 'strict-dynamic': los chunks que cargan los scripts con nonce heredan la confianza.
    // 'unsafe-eval' SOLO en `next dev` (React Refresh/webpack lo necesitan); nunca en producción.
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    // Hojas de estilo y <style>: propias o con nonce. En dev webpack inyecta <style> sin nonce.
    'style-src': ["'self'", ...(dev ? ["'unsafe-inline'"] : [`'nonce-${nonce}'`])],
    'style-src-elem': ["'self'", ...(dev ? ["'unsafe-inline'"] : [`'nonce-${nonce}'`])],
    // Atributos style="" que genera el SSR de React/motion (estado inicial de animaciones).
    // No permiten ejecutar scripts; es la única excepción inline de la política.
    'style-src-attr': ["'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'", ...(api ? [api] : [])],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}
