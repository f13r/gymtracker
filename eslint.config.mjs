import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import perfectionist from 'eslint-plugin-perfectionist'
import stylistic from '@stylistic/eslint-plugin'
import tseslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'
import { createNodeResolver, importX } from 'eslint-plugin-import-x'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const sharedImportOrderRule = [
  'error',
  {
    alphabetize: { order: 'asc' },
    groups: ['external', ['builtin', 'internal', 'unknown', 'parent', 'sibling', 'index', 'object', 'type']],
    'newlines-between': 'always',
    pathGroups: [
      {
        group: 'external',
        pattern: '@gymtracker/**',
        position: 'after',
      },
    ],
    pathGroupsExcludedImportTypes: [],
  },
]

const sharedRules = {
  'eol-last': ['error', 'always'],
  'no-console': ['error', { allow: ['warn'] }],
  curly: ['error', 'all'],
  'require-await': 'error',
  'import-x/default': 'off',
  'import-x/no-deprecated': 'warn',
  'import-x/no-named-as-default': 'off',
  'import-x/no-named-as-default-member': 'off',
  'import-x/no-unresolved': 'off',
  'import-x/named': 'off',
  'import-x/order': sharedImportOrderRule,
}

export default defineConfig(
  { ignores: ['**/dist', '**/coverage', '**/.github', 'node_modules', '**/drizzle.config.ts', '**/vitest.config.ts'] },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      importX.flatConfigs.recommended,
      importX.flatConfigs.typescript,
    ],
    files: ['**/*.{ts,tsx}'],
    plugins: {
      '@stylistic': stylistic,
      perfectionist,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: sharedRules,
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver(), createNodeResolver()],
    },
  },
  // FE (React/Vite)
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.json'],
        tsconfigRootDir: path.join(__dirname, 'apps/web'),
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'perfectionist/sort-jsx-props': [
        'error',
        {
          type: 'alphabetical',
          order: 'asc',
          ignoreCase: false,
          customGroups: [
            { groupName: 'reserved', elementNamePattern: '^(key|ref)$' },
            { groupName: 'callback', elementNamePattern: '^on[A-Z]' },
          ],
          groups: ['reserved', 'unknown', 'shorthand-prop', 'callback'],
        },
      ],
    },
  },
  // BE (NestJS)
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: path.join(__dirname, 'apps/api'),
      },
    },
  },
  // Standalone CLI scripts: console output is their purpose
  {
    files: ['apps/api/src/scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  // Shared packages
  {
    files: ['packages/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: path.join(__dirname, 'packages/shared'),
      },
    },
  },
  // Test / spec files — mocks legitimately use `any` and async-without-await
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'require-await': 'off',
    },
  },
)
