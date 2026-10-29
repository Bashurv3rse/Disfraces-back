import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",

    include: [
      "tests/integracion/**/*.test.ts",
    ],

    setupFiles: [
      "./tests/integracion/setup.ts",
    ],

    sequence: {
      concurrent: false,
    },

    fileParallelism: false,

    coverage: {
      provider: "v8",
      reporter: [
        "text",
        "html",
        "json-summary",
      ],
      reportsDirectory: "./coverage/integracion",
    },
  },
});