module.exports = {
    "env": {
        browser: false,
        es2020: true,
        node: true
    },
    extends: "standard-with-typescript",
    "globals": {
        "Atomics": "readonly",
        "SharedArrayBuffer": "readonly"
    },
    "parserOptions": {
        "ecmaVersion": 2020,
        "sourceType": "module"
    },
    "rules": {
        "indent": [ "error", 4, {
            "CallExpression": {
                "arguments": 1
            }
        } ],
        "linebreak-style": [ "error", "unix" ],
        "quotes": [ "error", "double" ],
        "semi": [ "error", "always" ],
        "camelcase": "off",
        "eqeqeq": "off",
        "comma-dangle": [ "error", "never" ],
        "comma-style": [ "error", "last" ],
        "comma-spacing": "off",
        "space-in-parens": [ "error", "always" ],
        "space-before-blocks": [ "error", "always" ],
        "array-bracket-spacing": [ "error", "always" ],
        "object-curly-spacing": [ "error", "always" ],
        "space-unary-ops": "off",
        "spaced-comment": "off",
        "curly": [ "error", "multi-or-nest" ],
        "nonblock-statement-body-position": [ "error", "below" ],
        "no-unneeded-ternary": "off",
        "no-cond-assign": [ "error", "always" ],
        "no-tabs": "off",
        "no-mixed-spaces-and-tabs": "off",
        "no-useless-return": "off",
        "no-new": "off",
        "no-fallthrough": "off",
        "padded-blocks": "off",
        "lines-between-class-members": [ "error", "never" ],
        "multiline-ternary": "off",
        "max-len": [ "error", { "code": 100, "tabWidth": 4 } ],
        "max-lines-per-function": [ "error", { "max": 200, "skipBlankLines": false } ],
        "@typescript-eslint/indent": [ "error", 4,  { "ignoredNodes": [ "SwitchCase" ] } ],
        "@typescript-eslint/quotes": [ "error", "double" ],
        "semi": "off",
        "@typescript-eslint/semi": "off",
        "space-before-function-paren": "off",
        "@typescript-eslint/space-before-function-paren": "off",
        "keyword-spacing": "off",
        "@typescript-eslint/keyword-spacing": [ "error", {
            "overrides": {
                "if": { "before": false, "after": false },
                "else": { "before": true, "after": true },
                "for": { "before": false, "after": false },
                "while": { "before": false, "after": false }
            }
        } ],
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/no-non-null-asserted-nullish-coalescing": "off",
        "@typescript-eslint/prefer-nullish-coalescing": "off",
        "@typescript-eslint/strict-boolean-expressions": "off",
        "@typescript-eslint/no-dynamic-delete": "off",
        "@typescript-eslint/no-this-alias": "off",
        "@typescript-eslint/lines-between-class-members": "off",
        "handle-callback-err": "off",
        "n/handle-callback-err": "off",
        "@typescript-eslint/prefer-optional-chain": "off"
    }
};
