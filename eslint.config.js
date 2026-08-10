import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

/**
 * Flat ESLint config.
 *
 * Type-aware linting is deliberately *not* enabled. `tsc -b` already runs in CI
 * with `strict`, `noUnusedLocals` and `noUnusedParameters`, so the whole
 * type-checked rule set would be a second, far slower pass over ground the
 * compiler already covers. What is left is the two things the compiler cannot
 * see: the rules of hooks, and the Fast Refresh export constraint.
 *
 * Three environments, because they run on different globals:
 *   - src/    browser, React, JSX
 *   - tests   the same, plus Vitest's globals: true
 *   - scripts/, *.config.*  Node, no JSX
 */
export default tseslint.config(
  {
    // Generated, vendored or not ours: the native projects, the build output,
    // and the Stitch design export that ships as raw HTML.
    ignores: ['dist', 'dev-dist', 'ios', 'android', 'coverage', 'design', 'playwright-report', 'test-results'],
  },

  // ── App source ───────────────────────────────────────────────────────────
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    linterOptions: {
      // A disable directive that has stopped suppressing anything is a comment
      // asserting something untrue about the code under it.
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // The two classic rules stay errors: both catch real bugs.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      /**
       * The React Compiler-era rules, downgraded to warnings on purpose.
       *
       * `set-state-in-effect` fires on the fetch-in-effect pattern every data
       * hook here is built on (useFoodLogs, useTargets, useWaterLogs,
       * useWeightLogs, useAdaptiveTargets, useFoodSearch) — 21 sites. It is
       * right that each costs one extra render on mount, but silencing it means
       * either adopting a data-fetching library or hand-restructuring every
       * hook, and the pattern is correct for an app that does not run the React
       * Compiler. Left visible as a standing backlog rather than turned off.
       *
       * `refs` fires on two deliberate render-phase ref writes (MealsContext,
       * Targets) where the assignment is idempotent and documented in place.
       */
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',

      // Fast Refresh can only preserve state for a module that exports
      // components and nothing else. Every context file here pairs a provider
      // with its `useX` hook, which is the deliberate exception the
      // `allowConstantExport` escape hatch does not cover — hence the inline
      // disables in src/context.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // An unused binding is an error, except for the leading-underscore
      // convention already used for intentionally-ignored callback arguments
      // (`(_event, session) => …` in AuthContext, `_err` in BarcodeScanner).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // ── Tests: unit (jsdom), Playwright E2E, and the store screenshot run ────
  {
    files: ['src/**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}', 'e2e/**/*.ts', 'store/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Test doubles legitimately stand in for shapes we don't want to model.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // ── Build scripts and TypeScript configs, all Node ───────────────────────
  {
    files: ['scripts/**/*.mjs', 'store/**/*.mjs', '*.config.ts', '*.config.js', '*.config.mjs'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
  },

  // ── Supabase Edge Functions: Deno, not Node ──────────────────────────────
  {
    files: ['supabase/functions/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      // Deno is a global the Deno runtime injects; npm: and jsr: specifiers
      // are resolved by Deno, not by anything installed here.
      globals: { ...globals.browser, Deno: 'readonly' },
    },
    rules: {
      // These modules are only ever run by Deno, whose import specifiers
      // (`npm:`, `jsr:`, URLs) nothing in this repo can resolve.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
)
