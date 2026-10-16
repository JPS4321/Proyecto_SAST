/** @type {import('next').NextConfig} */

// Cabeceras de seguridad en todas las respuestas de la web, incluidos /_next/static, los
// archivos de public/ y las respuestas 404. La Content-Security-Policy no está aquí: lleva
// un nonce por petición y la añade middleware.ts.
export const securityHeaders = [
  // CWE-693: el navegador no reinterpreta el tipo MIME (ZAP 10021).
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Anti-clickjacking para navegadores sin CSP frame-ancestors (ZAP 10020).
  { key: 'X-Frame-Options', value: 'DENY' },
  // La app no usa estas APIs del navegador (ZAP 10063).
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
  },
  // Aislamiento entre orígenes (ZAP 90004). Todos los recursos son del mismo origen y la API
  // se consulta con fetch en modo CORS, compatible con require-corp.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@secure-crm/shared'],
  // Sin cabecera X-Powered-By: Next.js (ZAP 10037 / CWE-497).
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};
export default nextConfig;
