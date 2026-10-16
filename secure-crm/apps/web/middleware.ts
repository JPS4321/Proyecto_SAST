import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp } from './lib/csp';

// Genera un nonce por petición y envía la CSP tanto en la petición (para que Next.js
// aplique el nonce a sus scripts al renderizar) como en la respuesta (para el navegador).
export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

// Todas las rutas (páginas, 404, /robots.txt, /brand/*) salvo los recursos compilados de
// Next, que no son documentos y reciben el resto de cabeceras desde next.config.mjs.
export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
