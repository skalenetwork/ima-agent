import neostandard from "neostandard";

export default [
    ...neostandard( { ts: true, semi: true } ),
    {
        rules: {
            "@stylistic/array-bracket-spacing": [ "error", "always" ],
            "@stylistic/comma-dangle": [ "error", "never" ],
            "@stylistic/indent": [ "error", 4, { ignoredNodes: [ "SwitchCase", "AssignmentExpression > .right" ] } ],
            "@stylistic/keyword-spacing": [ "error", {
                overrides: {
                    if: { before: false, after: false },
                    else: { before: true, after: true },
                    for: { before: false, after: false },
                    while: { before: false, after: false }
                }
            } ],
            "@stylistic/linebreak-style": [ "error", "unix" ],
            "@stylistic/max-len": [ "error", { code: 100, tabWidth: 4 } ],
            "@stylistic/nonblock-statement-body-position": [ "error", "below" ],
            "@stylistic/quotes": [ "error", "double" ],
            "@stylistic/space-before-function-paren": "off",
            "@stylistic/space-in-parens": [ "error", "always" ],
            curly: [ "error", "multi-or-nest" ],
            eqeqeq: "off",
            "max-lines-per-function": [ "error", { max: 200, skipBlankLines: false } ],
            "no-cond-assign": [ "error", "always" ]
        }
    }
];
