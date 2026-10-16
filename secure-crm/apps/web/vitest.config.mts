import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Next compila JSX con su propio transform; en las pruebas se usa el runtime automático de React.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname) },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.tsx'],
    env: { NEXT_PUBLIC_API_URL: 'http://api.test' },
    coverage: {
      provider: 'v8',
      // Rutas del lcov relativas a la raíz del monorepo (apps/<paquete>/...), que es
      // la base del análisis de SonarQube (sonar-project.properties).
      reporter: ['text', ['lcov', { projectRoot: '../..' }]],
      reportsDirectory: 'coverage',
      include: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.ts', 'next.config.mjs'],
      // Solo declaraciones de tipos generadas por Next (next-env.d.ts y .next/types).
      exclude: ['**/*.d.ts'],
    },
  },
});
