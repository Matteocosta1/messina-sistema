// Build del gestionale con esbuild: un solo file JS e un solo CSS in dist/.
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const qui = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(qui, 'dist');
mkdirSync(dist, { recursive: true });
await build({
  entryPoints: { main: path.join(qui, 'src/main.tsx') },
  bundle: true, minify: true, sourcemap: true, format: 'esm', target: ['es2020', 'safari15'],
  outdir: dist, jsx: 'automatic', loader: { '.css': 'css' },
  alias: { '@messina/ui': path.join(qui, '../../packages/ui/src/index.tsx'), '@messina/ui/src/styles.css': path.join(qui, '../../packages/ui/src/styles.css') },
  nodePaths: (process.env.NODE_PATH || '').split(':').filter(Boolean),
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
});
cpSync(path.join(qui, 'index.html'), path.join(dist, 'index.html'));
if (existsSync(path.join(qui, 'config.js'))) cpSync(path.join(qui, 'config.js'), path.join(dist, 'config.js'));
else writeFileSync(path.join(dist, 'config.js'), '// nessuna configurazione: modalità Prova\nwindow.MESSINA = {};\n');
