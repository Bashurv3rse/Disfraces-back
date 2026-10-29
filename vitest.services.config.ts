import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",

    include: [
      "tests/funcional/**/*.test.ts",
    ],

    coverage: {
      provider: "v8",

      // Medimos únicamente la capa de lógica de negocio.
      include: [
        "src/**/*.service.ts",
      ],

      exclude: [
        "src/**/*.d.ts",
      ],

      reporter: [
        "text",
        "html",
        "json-summary",
      ],

      // Reporte separado para no sobrescribir la cobertura global.
      reportsDirectory: "./coverage/services",
    },
  },
});