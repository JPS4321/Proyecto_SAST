import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // better-sqlite3 es un módulo nativo: cada archivo de pruebas corre en su propio proceso.
    pool: 'forks',
    // BD SQLite en memoria y secreto fijo: las pruebas no dependen de data/crm.db ni del entorno.
    env: {
      DB_PATH: ':memory:',
      JWT_SECRET: 'test-secret',
    },
    coverage: {
      provider: 'v8',
      // Rutas del lcov relativas a la raíz del monorepo (apps/<paquete>/...), que es
      // la base del análisis de SonarQube (sonar-project.properties).
      reporter: ['text', ['lcov', { projectRoot: '../..' }]],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
    },
  },
});
