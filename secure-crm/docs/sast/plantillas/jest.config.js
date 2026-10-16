// Copia este archivo a la raíz del proyecto (junto a package.json)
// Para TypeScript agrega ts-jest: npm install -D ts-jest  y  preset: "ts-jest"
module.exports = {
  // preset: "ts-jest",
  coverageReporters: ["text", "lcov"],          // lcov → coverage/lcov.info para SonarQube
  collectCoverageFrom: ["src/**/*.{js,jsx,ts,tsx}", "!src/**/*.test.*", "!src/**/*.spec.*"], // cuenta TODOS los archivos de src
};
