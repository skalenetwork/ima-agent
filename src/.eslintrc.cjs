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
        "linebreak-style": [ "error", "unix" ],
        "eqeqeq": "off",
        "comma-dangle": [ "error", "never" ],
        "comma-style": [ "error", "last" ],
        "space-in-parens": [ "error", "always" ],
        "space-before-blocks": [ "error", "always" ],
        "array-bracket-spacing": [ "error", "always" ],
        "object-curly-spacing": [ "error", "always" ],
        "curly": [ "error", "multi-or-nest" ],
        "nonblock-statement-body-position": [ "error", "below" ],
        "no-cond-assign": [ "error", "always" ],
        "max-len": [ "error", { "code": 100, "tabWidth": 4 } ],
        "max-lines-per-function": [ "error", { "max": 200, "skipBlankLines": false } ],
        "@typescript-eslint/indent": [ "error", 4,  { "ignoredNodes": [ "SwitchCase" ] } ],
        "@typescript-eslint/quotes": [ "error", "double" ],
        "@typescript-eslint/semi": [ "error", "always" ],
        "@typescript-eslint/space-before-function-paren": "off",
        "@typescript-eslint/keyword-spacing": [ "error", {
            "overrides": {
                "if": { "before": false, "after": false },
                "else": { "before": true, "after": true },
                "for": { "before": false, "after": false },
                "while": { "before": false, "after": false }
            }
        } ],
        "@typescript-eslint/strict-boolean-expressions": "off",
        "@typescript-eslint/no-this-alias": "off"
    }
};
