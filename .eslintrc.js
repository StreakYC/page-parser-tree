module.exports = {
  "parser": "babel-eslint",
  "env": {
    "jest": true,
    "browser": true,
    "node": true,
    "es6": true
  },
  "extends": ["eslint:recommended"],
  "parserOptions": {
    "ecmaFeatures": {
      "experimentalObjectRestSpread": true
    },
    "sourceType": "module"
  },
  "plugins": [
    "flowtype"
  ],
  "rules": {
    "flowtype/define-flow-type": 1,
    "flowtype/require-valid-file-annotation": ["error", "always"],

    "indent": ["error", 2],
    "linebreak-style": ["error", "unix"],
    "quotes": ["error", "single", "avoid-escape"],
    "semi": ["error", "always"],
    "no-var": ["error"],
    "brace-style": ["error"],
    "array-bracket-spacing": ["error", "never"],
    "block-spacing": ["error", "always"],
    "no-spaced-func": ["error"],
    "no-whitespace-before-property": ["error"],
    "space-before-blocks": ["error", "always"],
    "keyword-spacing": ["error"]
  }
};
