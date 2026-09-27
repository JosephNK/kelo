// Project-specific ESLint rules (user-owned — created once, never overwritten by sync).
// Allowed: new rules/plugins. Redefining jkit rules/settings, linterOptions, or
// global ignores fails at load time — use jkit.lint.json `ignores` for exclusions.
// Install any plugin you import here as a devDependency of this project.

// import groupDepPlugin from "eslint-plugin-import";

/** @type {import('eslint').Linter.Config[]} */
const projectConfig = [
  // Example: block dependencies between bounded contexts (uncomment the import above)
  // {
  //   files: ["src/**/*.ts"],
  //   ignores: ["**/*.spec.ts"],
  //   plugins: { groupdep: groupDepPlugin },
  //   rules: {
  //     "groupdep/no-restricted-paths": ["error", {
  //       zones: [
  //         {
  //           target: "./src/modules/forwarder",
  //           from: "./src/modules/consumer",
  //           message: "forwarder must not depend on consumer.",
  //         },
  //       ],
  //     }],
  //   },
  // },
];

export default projectConfig;
