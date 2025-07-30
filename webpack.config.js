const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  target: 'node',
  mode: 'production',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'out'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: 'ts-loader',
      },
    ],
  },
  // Важно: исключаем vscode и другие ненужные модули
  externals: [
    nodeExternals({
      allowlist: ['jsonc-parser', 'lodash.debounce']
    }),
    {
      vscode: 'commonjs vscode',
      crypto: 'commonjs crypto',

    },
  ],
};