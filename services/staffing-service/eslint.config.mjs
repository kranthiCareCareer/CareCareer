import baseConfig from '../../eslint.config.mjs';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...baseConfig,
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
];
