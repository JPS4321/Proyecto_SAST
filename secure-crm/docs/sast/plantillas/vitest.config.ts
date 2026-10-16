// Copia este archivo a la raíz del proyecto (junto a package.json)
// Requiere @vitest/coverage-v8 con la MISMA versión exacta que vitest
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],       // lcov → coverage/lcov.info para SonarQube
      include: ["src/**/*.{ts,tsx,js,jsx}"], // cuenta TODOS los archivos de src, aunque no tengan pruebas
      exclude: ["src/**/*.test.*", "src/**/*.spec.*"],
    },
  },
});
