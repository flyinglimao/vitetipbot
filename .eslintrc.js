module.exports = {
  env: {
    browser: true,
    commonjs: true,
    es2021: true,
  },
  extends: [
    'standard',
  ],
  parserOptions: {
    ecmaVersion: 12,
  },
  rules: {
    'comma-dangle': [
      'warn',
      'always-multiline',
    ],
    'arrow-parens': [
      'error',
      'always',
    ],
    'no-unused-vars': [
      'warn',
      {
        varsIgnorePattern: '^_',
      },
    ],
  },
}
