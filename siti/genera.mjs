// Genera i due siti pubblici (apps/sito-trasporti, apps/sito-corporation) da siti/*.html.
// Ogni pagina esce in un solo file: stile e script dentro, nessuna libreria. Lancia: node siti/genera.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const qui = new URL('.', import.meta.url).pathname;
const radice = new URL('..', import.meta.url).pathname;
const css = readFileSync(qui + 'comune.css', 'utf8').replace(/^\/\*[^\n]*\*\/\n/, '');
const js = readFileSync(qui + 'comune.js', 'utf8');

// mappa dei giri: città del Nord proiettate da longitudine e latitudine, curve dalla base di Lacchiarella
const P = ([lon, lat]) => [Math.round((lon - 7.3) * 100 + 14), Math.round((46.02 - lat) * 140 + 12)];
const BASE = P([9.13, 45.32]);
const CITTA = [   // nome, [lon, lat], posizione dell'etichetta, curvatura (segno = da che parte piega)
  ['Torino', [7.69, 45.07], 's', -0.14], ['Novara', [8.62, 45.45], 'n', 0.12], ['Bergamo', [9.67, 45.70], 'n', -0.12], ['Brescia', [10.21, 45.54], 'n', -0.12],
  ['Verona', [10.99, 45.44], 'n', -0.02], ['Padova', [11.88, 45.41], 's', 0.09], ['Venezia', [12.33, 45.44], 'n', -0.12],
  ['Piacenza', [9.69, 45.05], 'e', 0.12], ['Bologna', [11.34, 44.49], 's', 0.12], ['Genova', [8.93, 44.41], 's', -0.12],
];
function mappa() {
  const [bx, by] = BASE;
  let giri = '', punti = '';
  CITTA.forEach(([nome, ll, pos, k], i) => {
    const [x, y] = P(ll);
    const dx = x - bx, dy = y - by, l = Math.hypot(dx, dy);
    const cx = Math.round(bx + dx / 2 - dy * k), cy = Math.round(by + dy / 2 + dx * k);
    const lung = Math.ceil(l * 1.06 + 4);
    giri += `<path class="giro" style="--i:${i};--l:${lung}" d="M${bx} ${by} Q${cx} ${cy} ${x} ${y}"/>`;
    const t = pos === 'n' ? `x="${x}" y="${y - 9}" text-anchor="middle"` : pos === 's' ? `x="${x}" y="${y + 17}" text-anchor="middle"` : `x="${x + 9}" y="${y + 4}"`;
    punti += `<g class="citta" style="--i:${i}"><circle cx="${x}" cy="${y}" r="4"/><text ${t}>${nome}</text></g>`;
  });
  let griglia = '';
  for (let y = 36; y < 262; y += 14) for (let x = 8; x < 556; x += 14) griglia += `M${x} ${y}h.01`;
  return `<svg viewBox="0 30 560 232" role="img" aria-hidden="true">` +
    `<path class="puntini" d="${griglia}" stroke="rgba(17,18,20,.14)" stroke-width="2.2" stroke-linecap="round"/>` +
    giri + punti +
    `<g class="base"><circle class="r" cx="${bx}" cy="${by}" r="7"/><circle class="c" cx="${bx}" cy="${by}" r="7"/><text x="${bx - 6}" y="${by + 34}" text-anchor="end">Lacchiarella</text></g></svg>`;
}

const postazioni = Array.from({ length: 60 }, () => '<i></i>').join('');

function intestazioni(hashScript) {
  return `# Intestazioni di sicurezza per Cloudflare Pages (copiate in dist/ dalla build). Generato da siti/genera.mjs.
# Lo script della pagina è ammesso con la sua impronta (sha256): se cambia siti/comune.js si rigenera con «node siti/genera.mjs».
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' '${hashScript}'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), geolocation=(), microphone=()
  Cross-Origin-Opener-Policy: same-origin

/config.js
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
`;
}

const privacy = (nome, cosa) => `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Privacy - ${nome}</title><meta name="robots" content="noindex">
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;800&display=swap" rel="stylesheet">
<style>${css}
main{max-width:720px;margin:0 auto;padding:48px var(--gut) 80px}
h1{font-size:clamp(32px,5vw,48px);font-weight:800;margin-bottom:24px}h2{font-size:20px;margin:28px 0 8px}
p,li{color:var(--ink)}.bozza{border-radius:16px;padding:14px 16px;background:var(--alert-soft);color:var(--alert);font-weight:600;margin-bottom:24px}</style></head>
<body><main>
<p><a href="./">Torna al sito</a></p>
<h1>Informativa privacy</h1>
<p class="bozza">Bozza da far verificare al consulente prima della pubblicazione.</p>
<h2>Titolare</h2><p>${nome}, [ragione sociale], Via Cascina Nuova 1, Lacchiarella (MI), P.IVA [da inserire], email info@[dominio].</p>
<h2>Quali dati e perché</h2><p>I dati che scrivete nel modulo (nome, azienda, email, telefono, ${cosa}) servono solo a rispondere alla vostra richiesta e a preparare un'offerta. Base giuridica: misure precontrattuali richieste da voi (art. 6.1.b GDPR).</p>
<h2>Per quanto tempo</h2><p>Fino a 24 mesi dall'ultima comunicazione, salvo che la richiesta diventi un contratto: in quel caso per i tempi previsti dalla legge.</p>
<h2>Chi li vede</h2><p>Solo il nostro personale incaricato. I dati sono conservati su server nell'Unione europea (Supabase, Cloudflare) con cui abbiamo accordi di trattamento.</p>
<h2>Cookie</h2><p>Il sito non usa cookie di profilazione né strumenti di statistica.</p>
<h2>I vostri diritti</h2><p>Potete chiedere di vedere, correggere o cancellare i vostri dati, o opporvi al trattamento, scrivendo a info@[dominio]. Potete anche rivolgervi al Garante per la protezione dei dati personali.</p>
</main></body></html>
`;

const SITI = [
  { app: 'sito-trasporti', sorgente: 'trasporti.html', nome: 'Messina Autotrasporti', cosa: 'tratte e tipo di merce' },
  { app: 'sito-corporation', sorgente: 'corporation.html', nome: 'Messina Corporation', cosa: 'tipo e numero di dispositivi' },
];

for (const s of SITI) {
  const dir = `${radice}apps/${s.app}/`;
  mkdirSync(dir, { recursive: true });
  const html = readFileSync(qui + s.sorgente, 'utf8')
    .replace('/*COMUNE_CSS*/', () => css)
    .replace('/*COMUNE_JS*/', () => js)
    .replace('<!--MAPPA-->', () => mappa())
    .replace('<!--POSTAZIONI-->', () => postazioni);
  const hash = 'sha256-' + createHash('sha256').update(js).digest('base64');
  writeFileSync(dir + 'index.html', html);
  writeFileSync(dir + 'privacy.html', privacy(s.nome, s.cosa));
  writeFileSync(dir + '_headers', intestazioni(hash));
  writeFileSync(dir + 'config.example.js', `// Copia in config.js. Solo valori pubblici: la chiave è la publishable, mai quella segreta.
// Senza config.js il modulo non invia (in anteprima dentro il pannello di prova passa la richiesta alla Mail di prova).
window.MESSINA = {
  supabaseUrl: 'https://XXXX.supabase.co', supabaseKey: 'sb_publishable_...',
  negozioUrl: 'https://negozio.[dominio]', portaleUrl: 'https://clienti.[dominio]',
  trasportiUrl: 'https://[dominio-trasporti]', corporationUrl: 'https://[dominio-corporation]',
};
`);
  writeFileSync(dir + 'build.mjs', `// Copia la pagina già pronta in dist/ (nessuna compilazione: è HTML statico generato da siti/genera.mjs).
import { mkdirSync, copyFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
const qui = new URL('.', import.meta.url).pathname;
rmSync(qui + 'dist', { recursive: true, force: true });
mkdirSync(qui + 'dist');
for (const f of ['index.html', 'privacy.html', '_headers']) copyFileSync(qui + f, qui + 'dist/' + f);
if (existsSync(qui + 'config.js')) copyFileSync(qui + 'config.js', qui + 'dist/config.js');
else writeFileSync(qui + 'dist/config.js', 'window.MESSINA = window.MESSINA || {};\\n');   // senza configurazione: sito visibile, modulo spento
console.log('${s.app}: dist pronta');
`);
  writeFileSync(dir + 'package.json', JSON.stringify({ name: `@messina/${s.app}`, private: true, version: '0.1.0', type: 'module', scripts: { build: 'node build.mjs', anteprima: 'node build.mjs && python3 -m http.server 8766 -d dist' } }, null, 2) + '\n');
  console.log(s.app, (html.length / 1024).toFixed(1) + ' KB');
}
