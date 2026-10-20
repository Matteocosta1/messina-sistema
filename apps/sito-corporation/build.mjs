// Copia il sito già generato (cartella sito/, da siti/genera.mjs) in dist/ e aggiunge config.js.
import { cpSync, existsSync, rmSync, copyFileSync, writeFileSync } from 'node:fs';
const qui = new URL('.', import.meta.url).pathname;
rmSync(qui + 'dist', { recursive: true, force: true });
cpSync(qui + 'sito', qui + 'dist', { recursive: true });
if (existsSync(qui + 'config.js')) copyFileSync(qui + 'config.js', qui + 'dist/config.js');
else writeFileSync(qui + 'dist/config.js', 'window.MESSINA = window.MESSINA || {};\n');   // senza configurazione: sito visibile, moduli spenti
console.log('sito-corporation: dist pronta');
