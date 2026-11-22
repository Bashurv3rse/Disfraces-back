import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",

    include: [
      "tests/funcional/**/*.test.ts",
    ],

    coverage: {
      provider: "v8",

      // Medimos únicamente la capa de lógica de negocio (servicios y sus utilidades).
      include: [
        "src/**/*.service.ts",
        "src/modules/a-medida/reservas.base.ts",
        "src/modules/disfraces/rango.ts",
        "src/common/health.ts",
        "src/common/tallas.ts",
        "src/common/texto.ts",
      ],

      exclude: [
        "src/**/*.d.ts",
      ],

      reporter: [
        "text",
        "html",
        "json-summary",
        "lcov", // lo lee SonarCloud
      ],

      // Puerta de calidad: si la cobertura de la lógica de negocio baja de estos valores,
      // `npm run test:coverage:services` falla y la CI también (S30: mínimo 80 % en servicios).
      thresholds: {
        lines: 80,
        functions: 75,
        branches: 70,
        statements: 80,
      },

      // Reporte separado para no sobrescribir la cobertura global.
      reportsDirectory: "./coverage/services",
    },
  },
});
