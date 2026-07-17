import baseConfig from '../../eslint.config.mjs';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...baseConfig,
  {
    files: ['src/**/*.ts'],
    rules: {
      // Within a single service, deep relative imports between layers are expected
      // (application/ imports from domain/, infrastructure/ imports from application/)
      'no-restricted-imports': 'off',
    },
  },
];
