// Build comune a tutte le app Messina (gestionale, app, portale, negozio) con esbuild.
// Uso: node build.mjs [--serve]   → dist/ con index.html, main.js, main.css, config.js
import { build, context } from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function costruisci(qui, { entrata = 'src/main.tsx', statici = [] } = {}) {
  const dist = path.join(qui, 'dist');
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  const opzioni = {
    entryPoints: { main: path.join(qui, entrata) },
    bundle: true, minify: true, sourcemap: true, format: 'esm', target: ['es2020', 'safari15'],
    outdir: dist, jsx: 'automatic', loader: { '.css': 'css', '.svg': 'text' },
    alias: { '@messina/ui': path.join(radice, 'packages/ui/src'), '@messina/dati': path.join(radice, 'packages/dati/src') },
    nodePaths: [path.join(radice, 'node_modules'), ...(process.env.NODE_PATH || '').split(':').filter(Boolean)],
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'info',
  };
  cpSync(path.join(qui, 'index.html'), path.join(dist, 'index.html'));
  for (const s of statici) if (existsSync(path.join(qui, s))) cpSync(path.join(qui, s), path.join(dist, path.basename(s)), { recursive: true });
  // config.js: la si crea copiando config.example.js e incollando le chiavi PUBBLICHE. Senza, parte la Prova.
  if (existsSync(path.join(qui, 'config.js'))) cpSync(path.join(qui, 'config.js'), path.join(dist, 'config.js'));
  else writeFileSync(path.join(dist, 'config.js'), '// nessuna configurazione: modalità Prova con dati di esempio\nwindow.MESSINA = {};\n');
  if (process.argv.includes('--serve')) {
    const ctx = await context(opzioni); await ctx.watch();
    const { port } = await ctx.serve({ servedir: dist, port: 8765 });
    console.log(`Anteprima: http://localhost:${port}`);
  } else await build(opzioni);
}
