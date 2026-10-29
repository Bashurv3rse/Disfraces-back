module.exports = {
  default: {
    requireModule: ["ts-node/register"],
    require: ["tests/integracion/setup.ts", "features/step_definitions/**/*.ts"],
    paths: ["features/**/*.feature"],
    format: [
      "progress",
      "html:reports/cucumber-report.html"
    ],
    publishQuiet: true
  }
};
