// Genera i due siti pubblici da siti/trasporti.mjs e siti/corporation.mjs.
//  - apps/sito-<x>/sito/      una cartella per pagina (/servizi/trasporto/index.html): è quello che va online
//  - apps/sito-<x>/anteprima.html   tutte le pagine in un solo file, per il pannello di prova
// Stile e script dentro ogni pagina, nessuna libreria. Lancia: node siti/genera.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { testa, piede, href, esc } from './parti.mjs';
import trasporti from './trasporti.mjs';
import corporation from './corporation.mjs';

const qui = new URL('.', import.meta.url).pathname;
const radice = new URL('..', import.meta.url).pathname;
const css = readFileSync(qui + 'comune.css', 'utf8');
const js = readFileSync(qui + 'comune.js', 'utf8');
const hash = 'sha256-' + createHash('sha256').update(js).digest('base64');

const ICONA = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%23111214'/%3E%3Ctext x='32' y='44' font-family='Arial' font-weight='900' font-size='34' text-anchor='middle' fill='%23fff'%3EM%3C/text%3E%3C/svg%3E`;

function testaDoc(sito, titolo, descrizione, cssSito, config = true) {
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(titolo)}</title>
<meta name="description" content="${esc(descrizione)}">
<meta name="theme-color" content="#f2f3f5">
<meta property="og:title" content="${esc(titolo)}">
<meta property="og:description" content="${esc(descrizione)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="it_IT">
<link rel="icon" href="${ICONA}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
${config ? '<script src="/config.js"></script>\n' : ''}<style>
${css}
${cssSito}
</style>
</head>`;
}

const titoloDi = (sito, p) => (p.path === '' ? sito.titoloBase : `${p.titolo} | ${sito.titoloBase}`);
const datiStrutturati = (sito) => `<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org', '@type': 'LocalBusiness', name: sito.nome, telephone: '+39 02 9227 0155',
  address: { '@type': 'PostalAddress', streetAddress: 'Via Cascina Nuova 1', postalCode: '20084', addressLocality: 'Lacchiarella', addressRegion: 'MI', addressCountry: 'IT' },
})}</script>`;

function intestazioni() {
  return `# Intestazioni di sicurezza per Cloudflare Pages. Generato da siti/genera.mjs: non modificare a mano.
# Lo script delle pagine è ammesso con la sua impronta (sha256); i dati strutturati (ld+json) non sono script eseguibili.
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' '${hash}'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), geolocation=(), microphone=()
  Cross-Origin-Opener-Policy: same-origin

/config.js
  Cache-Control: no-cache
/*.html
  Cache-Control: no-cache
`;
}

for (const [app, sito] of [['sito-trasporti', trasporti], ['sito-corporation', corporation]]) {
  const dir = `${radice}apps/${app}/`;
  const cssSito = readFileSync(`${qui}${sito.id}.css`, 'utf8');
  rmSync(dir + 'sito', { recursive: true, force: true });
  mkdirSync(dir + 'sito', { recursive: true });

  // una pagina per cartella
  for (const p of sito.pagine) {
    const cartella = dir + 'sito/' + (p.path ? p.path + '/' : '');
    mkdirSync(cartella, { recursive: true });
    writeFileSync(cartella + 'index.html', testaDoc(sito, titoloDi(sito, p), p.descrizione, cssSito) +
      `\n<body>\n${testa(sito, href(p.path || '/'))}\n<main>${p.html}</main>\n${piede(sito)}\n${p.path === '' ? datiStrutturati(sito) : ''}<script>${js}</script>\n</body>\n</html>\n`);
  }
  writeFileSync(dir + 'sito/404.html', testaDoc(sito, 'Pagina non trovata | ' + sito.titoloBase, 'Pagina non trovata', cssSito) +
    `\n<body>\n${testa(sito, '/x')}\n<main><div class="ph"><div class="wrap"><h1>Questa pagina non c'è.</h1><p class="lead">Forse l'indirizzo è cambiato. Ripartite dalla home o scriveteci.</p><p style="margin-top:24px"><a class="btn" href="/">Torna alla home</a></p></div></div></main>\n${piede(sito)}\n<script>${js}</script>\n</body>\n</html>\n`);
  writeFileSync(dir + 'sito/robots.txt', 'User-agent: *\nAllow: /\n');
  writeFileSync(dir + 'sito/_headers', intestazioni());

  // anteprima: tutte le pagine in un file
  const tutte = sito.pagine.map((p) => `<main data-path="${href(p.path || '/')}" data-titolo="${esc(titoloDi(sito, p))}" hidden>${p.html}</main>`).join('\n');
  writeFileSync(dir + 'anteprima.html', testaDoc(sito, sito.titoloBase, sito.pagine[0].descrizione, cssSito, false) +
    `\n<body data-anteprima>\n${testa(sito, '/')}\n${tutte}\n${piede(sito)}\n<script>${js}</script>\n</body>\n</html>\n`);

  writeFileSync(dir + 'config.example.js', `// Copia in config.js. Solo valori pubblici: la chiave è la publishable, mai quella segreta.
// Senza config.js il sito si vede lo stesso, ma i moduli non inviano.
window.MESSINA = {
  supabaseUrl: 'https://XXXX.supabase.co', supabaseKey: 'sb_publishable_...',
  negozioUrl: 'https://negozio.[dominio]', portaleUrl: 'https://portale.[dominio]',
  trasportiUrl: 'https://www.[dominio-trasporti]', corporationUrl: 'https://www.[dominio-corporation]',
};
`);
  writeFileSync(dir + 'build.mjs', `// Copia il sito già generato (cartella sito/, da siti/genera.mjs) in dist/ e aggiunge config.js.
import { cpSync, existsSync, rmSync, copyFileSync, writeFileSync } from 'node:fs';
const qui = new URL('.', import.meta.url).pathname;
rmSync(qui + 'dist', { recursive: true, force: true });
cpSync(qui + 'sito', qui + 'dist', { recursive: true });
if (existsSync(qui + 'config.js')) copyFileSync(qui + 'config.js', qui + 'dist/config.js');
else writeFileSync(qui + 'dist/config.js', 'window.MESSINA = window.MESSINA || {};\\n');   // senza configurazione: sito visibile, moduli spenti
console.log('${app}: dist pronta');
`);
  writeFileSync(dir + 'package.json', JSON.stringify({ name: `@messina/${app}`, private: true, version: '0.2.0', type: 'module', scripts: { build: 'node build.mjs', anteprima: 'node build.mjs && python3 -m http.server 8766 -d dist' } }, null, 2) + '\n');
  console.log(app, sito.pagine.length, 'pagine');
}
