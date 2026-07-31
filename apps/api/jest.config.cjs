module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFiles: ["<rootDir>/test/setup-env.ts"],
  globalSetup: "<rootDir>/test/global-setup.cjs",
  testMatch: [
    "<rootDir>/test/**/*.e2e-spec.ts",
    "<rootDir>/test/**/*.spec.ts",
    "<rootDir>/src/**/*.spec.ts"
  ]
}
