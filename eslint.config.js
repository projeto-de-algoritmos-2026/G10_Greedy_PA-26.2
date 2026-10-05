import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const reactImports = {
  group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
  message: 'Algoritmos e domínio não dependem de React.',
};

const restrictedImports = (layers, { react = false } = {}) => [
  ...(react ? [reactImports] : []),
  {
    group: layers.flatMap((layer) => [
      `@/${layer}`,
      `@/${layer}/**`,
      `**/${layer}`,
      `**/${layer}/**`,
    ]),
    message: `Import proibido: viola a direção das camadas (${layers.join(', ')}).`,
  },
];

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
  },
  {
    files: ['vite.config.ts', 'scripts/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  // Camadas (docs/estrutura-do-projeto.md §7): components -> game -> domain -> algorithms.
  // Camada inferior nunca importa a superior; algoritmos e domínio não conhecem React.
  // `infra` isola APIs do navegador (download, arquivos, armazenamento) e só a interface a usa.
  {
    files: ['src/algorithms/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: restrictedImports(['domain', 'game', 'components', 'data', 'infra'], {
            react: true,
          }),
        },
      ],
    },
  },
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: restrictedImports(['game', 'components', 'infra'], { react: true }) },
      ],
    },
  },
  {
    files: ['src/game/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: restrictedImports(['components', 'infra']) }],
    },
  },
  {
    files: ['src/infra/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: restrictedImports(['algorithms', 'domain', 'game', 'components', 'data'], {
            react: true,
          }),
        },
      ],
    },
  },
  prettier,
]);
