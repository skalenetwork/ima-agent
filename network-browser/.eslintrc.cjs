module.exports = {
    env: {
        browser: true,
        es2022: true,
        node: true
    },
    extends: 'standard-with-typescript',
    overrides: [
        {
            env: {
                node: true
            },
            files: ['.eslintrc.{js,cjs}'],
            parserOptions: {
                sourceType: 'script'
            }
        }
    ],
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: ['tsconfig.json']
    },
    rules: {
        '@typescript-eslint/indent': ['error', 4],
        '@typescript-eslint/semi': ['error', 'always'],
        '@typescript-eslint/quotes': ['error', 'single'],
        'no-unused-vars': 2
    }
}
