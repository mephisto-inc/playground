import globals from "globals";

export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: [
      "src/**/*.js",
      "tests/**/*.mjs",
      "vite.config.js",
      "eslint.config.js",
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": [
        "warn",
        {
          args: "none",
          caughtErrors: "none",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
];
