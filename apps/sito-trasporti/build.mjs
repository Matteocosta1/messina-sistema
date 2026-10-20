// Copia la pagina già pronta in dist/ (nessuna compilazione: è HTML statico generato da siti/genera.mjs).
import { mkdirSync, copyFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
const qui = new URL('.', import.meta.url).pathname;
rmSync(qui + 'dist', { recursive: true, force: true });
mkdirSync(qui + 'dist');
for (const f of ['index.html', 'privacy.html', '_headers']) copyFileSync(qui + f, qui + 'dist/' + f);
if (existsSync(qui + 'config.js')) copyFileSync(qui + 'config.js', qui + 'dist/config.js');
else writeFileSync(qui + 'dist/config.js', 'window.MESSINA = window.MESSINA || {};\n');   // senza configurazione: sito visibile, modulo spento
console.log('sito-trasporti: dist pronta');
