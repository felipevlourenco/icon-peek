import { build, context } from 'esbuild';

const options = {
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  await (await context(options)).watch();
} else {
  await build(options);
}
