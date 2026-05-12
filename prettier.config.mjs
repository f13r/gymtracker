import * as prettierPluginTailwindcss from 'prettier-plugin-tailwindcss'

export default {
  trailingComma: 'all',
  tabWidth: 2,
  semi: false,
  singleQuote: true,
  printWidth: 120,
  bracketSpacing: true,
  arrowParens: 'avoid',
  endOfLine: 'lf',
  plugins: [prettierPluginTailwindcss],
}
