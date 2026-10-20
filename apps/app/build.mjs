import { costruisci } from '../../tools/costruisci.mjs';
await costruisci(new URL('.', import.meta.url).pathname, { statici: ['manifest.webmanifest', 'sw.js', 'icone', '_headers'] });
