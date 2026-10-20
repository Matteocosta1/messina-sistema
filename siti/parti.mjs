// Pezzi comuni ai due siti: testata, piede, intestazione di pagina, domande, moduli.
// Ogni sito è un oggetto { id, nome, menu, pagine: [{ path, titolo, descrizione, html }] } (vedi trasporti.mjs e corporation.mjs).

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** link interno: in produzione è un percorso vero (/servizi/trasporto/), nell'anteprima lo gestisce lo script */
export const href = (p) => (p === '/' ? '/' : '/' + p.replace(/^\/|\/$/g, '') + '/');

export function testa(sito, attivo) {
  const voce = ([p, t]) => {
    const on = attivo !== '/' && href(p) !== '/' && attivo.startsWith(href(p));
    return `<a href="${href(p)}"${on ? ' aria-current="page"' : ''}>${t}</a>`;
  };
  return `<header class="top">
  <div class="wrap">
    <nav class="bar glass" aria-label="Principale">
      <a class="logo" href="/">${sito.logo[0]} <span>${sito.logo[1]}</span></a>
      <div class="menu" id="menu">
        ${sito.menu.map(voce).join('')}
        <span class="menu-util">${sito.utilita.map(([p, t, link]) => link ? `<a href="#" data-link="${link}">${t}</a>` : voce([p, t])).join('')}</span>
      </div>
      <a class="btn" ${sito.cta[2] ? `href="#" data-link="${sito.cta[2]}"` : `href="${href(sito.cta[0])}"`}>${sito.cta[1]}</a>
      <button class="apri" type="button" aria-expanded="false" aria-controls="menu" aria-label="Menu"><i></i><i></i></button>
    </nav>
  </div>
</header>`;
}

export function piede(sito) {
  const voce = ([p, t, link]) => link ? `<a href="${p.startsWith('http') ? p : '#'}" data-link="${link}">${t}</a>` : p.startsWith('http') ? `<a href="${p}" rel="noopener" target="_blank">${t}</a>` : `<a href="${href(p)}">${t}</a>`;
  return `<footer>
  <div class="wrap">
    <div class="g">
      <div class="chi"><b>${sito.nome}</b><span class="muted">${sito.indirizzo}</span><span class="muted">${sito.contattiBrevi}</span></div>
      ${sito.piede.map(([titolo, voci]) => `<div><b>${titolo}</b>${voci.map(voce).join('')}</div>`).join('')}
    </div>
    <p class="legal">${sito.legale}</p>
  </div>
</footer>`;
}

/** intestazione delle pagine interne: percorso, titolo, una riga di spiegazione */
export function intest(briciole, titolo, lead, extra = '') {
  return `<div class="ph"><div class="wrap">
    <nav class="briciole" aria-label="Sei qui"><a href="/">Home</a>${briciole.map(([p, t]) => p ? ` <span aria-hidden="true">/</span> <a href="${href(p)}">${t}</a>` : ` <span aria-hidden="true">/</span> <span>${t}</span>`).join('')}</nav>
    <h1>${titolo}</h1>
    ${lead ? `<p class="lead">${lead}</p>` : ''}${extra}
  </div></div>`;
}

export const sezione = (titolo, testo, corpo, id = '', stile = '') =>
  `<section${id ? ` id="${id}"` : ''}${stile ? ` style="${stile}"` : ''}><div class="wrap">
    ${titolo ? `<div class="sh"><h2>${titolo}</h2>${testo ? `<p>${testo}</p>` : '<span></span>'}</div>` : ''}
    ${corpo}
  </div></section>`;

/** righe di servizi (titolo, testo, punti, etichetta, link opzionale) */
export const righe = (lista) => `<div class="servizi glass">${lista.map((r) => `
  <div class="srv">
    <h3>${r.link ? `<a href="${href(r.link)}">${r.t}</a>` : r.t}</h3>
    <div><p>${r.p}</p>${r.punti ? `<ul>${r.punti.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}${r.link ? `<p class="vai"><a href="${href(r.link)}">${r.vai || 'Scopri il servizio'}</a></p>` : ''}</div>
    ${r.tag ? `<span class="tag">${r.tag}</span>` : '<span></span>'}
  </div>`).join('')}</div>`;

export const passi = (lista) => `<ol class="passi glass">${lista.map(([b, s]) => `<li><b>${b}</b><span>${s}</span></li>`).join('')}</ol>`;

export const faq = (lista) => `<div class="faq glass">${lista.map(([d, r]) => `<details><summary>${d}</summary><div>${r}</div></details>`).join('')}</div>`;

export const dati = (lista) => `<dl class="dati">${lista.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

/** azioni rapide in apertura (come le grandi: traccia, preventivo, ritiro, area clienti) */
export const azioni = (lista) => `<div class="azioni glass">${lista.map(([p, t, s, link]) =>
  `<a ${link ? `href="#" data-link="${link}"` : `href="${href(p)}"`}><b>${t}</b><span>${s}</span></a>`).join('')}</div>`;

// ---- moduli ----
const c = (nome, etichetta, attr = '') => `<label class="f">${etichetta}<input name="${nome}" ${attr}></label>`;
export const campiContatto = () =>
  c('nome', 'Nome e cognome', 'autocomplete="name" required maxlength="80"') +
  c('azienda', 'Azienda', 'autocomplete="organization" maxlength="120"') +
  c('email', 'Email', 'type="email" autocomplete="email" required maxlength="200"') +
  c('telefono', 'Telefono', 'type="tel" autocomplete="tel" maxlength="40"');
export const dett = (chiave, etichetta, attr = '', largo = false) =>
  `<label class="f${largo ? ' w' : ''}">${etichetta}<input data-dettaglio="${chiave}" ${attr}></label>`;
export const scelta = (chiave, etichetta, opzioni, largo = false) =>
  `<label class="f${largo ? ' w' : ''}">${etichetta}<select data-dettaglio="${chiave}"><option value="">Scegli</option>${opzioni.map((o) => `<option>${o}</option>`).join('')}</select></label>`;
export const chips = (chiave, legenda, opzioni) =>
  `<fieldset class="f w gruppo"><legend>${legenda}</legend><div class="chips">${opzioni.map((o) =>
    `<label><input type="checkbox" value="${o}" data-dettaglio="${chiave}"><span>${o}</span></label>`).join('')}</div></fieldset>`;
export function modulo(sito, tipo, campi, bottone, note) {
  return `<form class="form panel glass" data-sito="${sito}" data-tipo="${tipo}" data-ok="Richiesta inviata. Vi rispondiamo all'indirizzo email che avete indicato." novalidate>
    ${campiContatto()}
    ${campi}
    <label class="f w">Note<textarea name="note" maxlength="3000" placeholder="${note}"></textarea></label>
    <label class="hp" aria-hidden="true">Sito web<input name="sito_web" tabindex="-1" autocomplete="off"></label>
    <label class="priv"><input type="checkbox" name="privacy" required><span>Ho letto l'<a href="${href('privacy')}">informativa privacy</a>. Usiamo questi dati solo per rispondere alla richiesta.</span></label>
    <div class="w"><button class="btn" type="submit">${bottone}</button></div>
    <div class="esito" role="status" tabindex="-1" hidden></div>
  </form>`;
}

/** colonna contatti accanto ai moduli */
export const recapiti = (sito, righe2) => `<div class="contatti">${(righe2 || sito.recapiti).map(([k, v]) => `<div><b>${k}</b>${v}</div>`).join('')}</div>`;

export const bozza = (testo = 'Testo indicativo da far verificare prima della pubblicazione.') => `<p class="bozza">${testo}</p>`;
