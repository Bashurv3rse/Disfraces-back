import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",

    // Ejecutar únicamente las pruebas funcionales.
    include: [
      "tests/funcional/**/*.test.ts",
    ],

    coverage: {
      provider: "v8",

      // Medir la cobertura de TODO el código fuente del backend.
      include: [
        "src/**/*.ts",
      ],

      exclude: [
        "src/**/*.d.ts",
      ],

      reporter: [
        "text",
        "html",
        "json-summary",
      ],

      reportsDirectory: "./coverage",
    },
  },
});