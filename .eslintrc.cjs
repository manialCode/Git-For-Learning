module.exports = {
  overrides: [
    {
      files: ["**/*.{js,mjs,cjs}"],
      env: { node: true, es2021: true },
      extends: ["eslint:recommended"],
    },
    {
      files: ["**/*.{ts,mts,cts}"],
      parser: "@typescript-eslint/parser",
      plugins: ["@typescript-eslint"],
      extends: ["plugin:@typescript-eslint/recommended"],
    },
  ],
};
