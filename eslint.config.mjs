// ESLint flat config (ESLint 9+/10). Replaces the legacy .eslintrc.json — ESLint 9
// dropped support for the .eslintrc format entirely. Uses the unified
// `typescript-eslint` package, which bundles the parser and plugin in lockstep.
//
// Mirrors the previous config exactly:
//   extends: eslint:recommended + @typescript-eslint/recommended
//   env: node + es2021 (now expressed via globals.node)
//   parserOptions: ecmaVersion latest, sourceType module
//   rules: no-explicit-any=warn, no-unused-vars=warn (^_ ignore), no-console=off
//   ignores: dist, node_modules, coverage, *.js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  // Replaces the old `ignorePatterns`. A flat-config object with only `ignores`
  // is a global ignore that applies to every other config block.
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', '**/*.js'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2021 },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'off',
    },
  },
);
