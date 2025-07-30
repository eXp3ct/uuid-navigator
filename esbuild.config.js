// esbuild.config.js
require('esbuild').build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  external: ['vscode'],
  outfile: 'out/extension.js',
  minify: process.env.NODE_ENV === 'production',
  sourcemap: false
}).catch(() => process.exit(1))