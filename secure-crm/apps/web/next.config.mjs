/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@secure-crm/shared'],
  // X-Content-Type-Options en todas las respuestas de la web, igual que en la API (CWE-693).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }],
      },
    ];
  },
};
export default nextConfig;
