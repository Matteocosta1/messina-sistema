// Sito pubblico di Messina Autotrasporti: tutte le pagine.
// Fonti dei contenuti: Matteo e Pier (flotta, orari, servizi, magazzino), registro imprese (P.IVA, sede, telefono),
// articolo Italia Daily News 24 del 3/5/2023 (storia e famiglia). Le parti tra [parentesi] o con «bozza» sono da confermare.
import { href, intest, sezione, righe, passi, faq, dati, azioni, modulo, dett, scelta, chips, recapiti, bozza } from './parti.mjs';

// ---- mappa dei giri (unico movimento della pagina) ----
const P = ([lon, lat]) => [Math.round((lon - 7.3) * 100 + 14), Math.round((46.02 - lat) * 140 + 12)];
const BASE = P([9.13, 45.32]);
const CITTA = [
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
    giri += `<path class="giro" style="--i:${i};--l:${Math.ceil(l * 1.06 + 4)}" d="M${bx} ${by} Q${cx} ${cy} ${x} ${y}"/>`;
    const t = pos === 'n' ? `x="${x}" y="${y - 9}" text-anchor="middle"` : pos === 's' ? `x="${x}" y="${y + 17}" text-anchor="middle"` : `x="${x + 9}" y="${y + 4}"`;
    punti += `<g class="citta" style="--i:${i}"><circle cx="${x}" cy="${y}" r="4"/><text ${t}>${nome}</text></g>`;
  });
  let griglia = '';
  for (let y = 36; y < 262; y += 14) for (let x = 8; x < 556; x += 14) griglia += `M${x} ${y}h.01`;
  return `<svg viewBox="0 30 560 232" role="img" aria-hidden="true"><path class="puntini" d="${griglia}" stroke="rgba(17,18,20,.14)" stroke-width="2.2" stroke-linecap="round"/>${giri}${punti}<g class="base"><circle class="r" cx="${bx}" cy="${by}" r="7"/><circle class="c" cx="${bx}" cy="${by}" r="7"/><text x="${bx - 6}" y="${by + 34}" text-anchor="end">Lacchiarella</text></g></svg>`;
}

// ---- mezzi disegnati in scala ----
const ruota = (x, y, r) => `<circle class="ruota" cx="${x}" cy="${y}" r="${r}"/><circle class="cerchio" cx="${x}" cy="${y}" r="${r * 0.36}"/>`;
const SVG = {
  furgone: `<svg viewBox="0 0 200 104" aria-hidden="true"><path class="t" d="M6 92 V40 Q6 28 18 26 L118 22 Q132 22 140 32 L176 58 Q194 62 194 76 V92 Z"/><path class="v" d="M124 34 L166 60 H124 Z" opacity=".85"/>${ruota(44, 92, 12)}${ruota(158, 92, 12)}</svg>`,
  motrice: `<svg viewBox="0 0 320 150" aria-hidden="true"><rect class="t" x="6" y="10" width="214" height="118" rx="6"/><path class="t" d="M226 128 V58 Q226 46 238 46 H280 Q292 46 298 58 L314 94 V128 Z"/><path class="v" d="M240 58 H278 L292 88 H240 Z" opacity=".85"/><rect class="v" x="6" y="128" width="214" height="5"/>${ruota(48, 134, 14)}${ruota(84, 134, 14)}${ruota(276, 134, 14)}</svg>`,
  bilico: `<svg viewBox="0 0 480 160" aria-hidden="true"><rect class="t" x="6" y="8" width="372" height="124" rx="6"/><rect class="v" x="6" y="132" width="372" height="5"/><path class="t" d="M386 140 V64 Q386 52 398 52 H440 Q452 52 458 64 L474 100 V140 Z"/><path class="v" d="M400 64 H438 L452 94 H400 Z" opacity=".85"/>${ruota(250, 144, 14)}${ruota(284, 144, 14)}${ruota(318, 144, 14)}${ruota(410, 144, 14)}${ruota(446, 144, 14)}</svg>`,
};
const strada = () => `<div class="strada" role="list">
  <div class="mezzo m1" role="listitem">${SVG.furgone}<div class="solo-tel"><h3>Furgoni e Sprinter</h3><p>Città, consegne veloci, ZTL.</p></div></div>
  <div class="mezzo m2" role="listitem">${SVG.motrice}<div class="solo-tel"><h3>Motrici e tre assi</h3><p>Con sponda, per bancali e consegne al piano.</p></div></div>
  <div class="mezzo m3" role="listitem">${SVG.bilico}<div class="solo-tel"><h3>Bilici</h3><p>Carichi completi e tratte lunghe.</p></div></div>
</div>
<div class="mezzi-testo">
  <div><h3>Furgoni e Sprinter</h3><p>Città, consegne veloci, ZTL.</p></div>
  <div><h3>Motrici e tre assi</h3><p>Con sponda, per bancali e consegne al piano.</p></div>
  <div><h3>Bilici</h3><p>Carichi completi e tratte lunghe.</p></div>
</div>`;

const portaleMini = () => `<div class="portale-mini glass" aria-label="Esempio dell'area clienti">
  <div class="testa"><b>I vostri bancali</b><span>Area clienti</span></div>
  <table><thead><tr><th>Codice</th><th>Posto</th><th>Dal</th><th>Stato</th></tr></thead><tbody>
    <tr><td>B-1042</td><td>S03-2-4</td><td>2 ott</td><td><span class="stato">In magazzino</span></td></tr>
    <tr><td>B-1043</td><td>S03-2-5</td><td>2 ott</td><td><span class="stato">In magazzino</span></td></tr>
    <tr><td>B-1077</td><td>S05-1-1</td><td>9 ott</td><td><span class="stato esce">In uscita</span></td></tr>
    <tr><td>B-1081</td><td>S01-4-2</td><td>14 ott</td><td><span class="stato">In magazzino</span></td></tr>
  </tbody></table>
  <div class="piede"><span>Richiedi riconsegna</span></div>
</div>`;

const TEL = '<a href="tel:+390292270155">02 9227 0155</a>';
const MAIL = (u) => `<a href="mailto:${u}@messina-autotrasporti.it">${u}@messina-autotrasporti.it</a>`;
const MAPPA_URL = 'https://www.google.com/maps/search/?api=1&query=Via+Cascina+Nuova+1+20084+Lacchiarella+MI';

const SERVIZI = [
  { t: 'Distribuzione e trasporto', link: 'servizi/trasporto', tag: 'Bancali e colli', p: 'Consegne in giornata o su appuntamento in tutto il Nord Italia, con sponda idraulica, consegna al piano e fascia oraria quando serve.', punti: ['Collettame e carichi completi', 'Firma, foto e posizione a ogni consegna'] },
  { t: 'Magazzino e logistica', link: 'servizi/magazzino', tag: 'Area clienti', p: 'Custodiamo la vostra merce a Lacchiarella: ogni bancale ha un codice e un posto, controllato con lo scanner a ogni movimento.', punti: ['Giacenze visibili dal vivo', 'Preparazione ordini e merce di passaggio in giornata'] },
  { t: 'Logistica IT', link: 'servizi/logistica-it', tag: 'Seriali e IMEI', p: 'PC e telefoni aziendali preparati per ogni dipendente, consegnati in sede e ritirati a fine vita, tutto tracciato per numero di serie.', punti: ['Etichette cespite e accessori per utente', 'Busta di reso per il dispositivo vecchio'] },
  { t: 'Giacenze e resi', link: 'servizi/giacenze-resi', tag: 'Avviso in giornata', p: 'Se il destinatario non c\'è, la merce torna al sicuro in magazzino e vi avvisiamo il giorno stesso. Decidete voi come procedere.', punti: ['Riconsegna, reso o ritiro in sede', 'Resi dai vostri clienti gestiti per voi'] },
];

const sito = {
  id: 'trasporti',
  nome: 'Messina Autotrasporti',
  logo: ['Messina', 'Autotrasporti'],
  titoloBase: 'Messina Autotrasporti',
  menu: [['servizi', 'Servizi'], ['settori', 'Settori'], ['flotta', 'Flotta'], ['azienda', 'Azienda'], ['contatti', 'Contatti']],
  utilita: [['traccia', 'Traccia'], ['', 'Area clienti', 'portaleUrl']],
  cta: ['preventivo', 'Preventivo'],
  indirizzo: 'Via Cascina Nuova 1, 20084 Lacchiarella (MI)',
  contattiBrevi: `Tel. ${TEL}`,
  recapiti: [['Sede e magazzino', `Via Cascina Nuova 1, 20084 Lacchiarella (MI)<br><a href="${MAPPA_URL}" target="_blank" rel="noopener">Apri in Google Maps</a>`], ['Telefono', TEL], ['Email', MAIL('info')]],
  piede: [
    ['Servizi', [['servizi/trasporto', 'Distribuzione'], ['servizi/magazzino', 'Magazzino'], ['servizi/logistica-it', 'Logistica IT'], ['servizi/giacenze-resi', 'Giacenze e resi'], ['flotta', 'Flotta']]],
    ['Azienda', [['azienda', 'Chi siamo'], ['settori', 'Settori'], ['documenti', 'Documenti'], ['lavora-con-noi', 'Lavora con noi'], ['', 'Messina Corporation', 'corporationUrl']]],
    ['Supporto', [['traccia', 'Traccia'], ['preventivo', 'Preventivo'], ['ritiro', 'Prenota un ritiro'], ['domande', 'Domande'], ['contatti', 'Contatti'], ['', 'Area clienti', 'portaleUrl']]],
    ['Legale', [['condizioni', 'Condizioni di trasporto'], ['privacy', 'Privacy'], ['cookie', 'Cookie'], ['note-legali', 'Note legali']]],
  ],
  legale: 'Messina Autotrasporti S.r.l., Via Cascina Nuova 1, 20084 Lacchiarella (MI). P.IVA 09420230964. Iscritta all\'Albo nazionale gestori ambientali, n. MI/062921.',
  pagine: [],
};

const P2 = (path, titolo, descrizione, html) => sito.pagine.push({ path, titolo, descrizione, html });

// ======================= HOME =======================
P2('', 'Messina Autotrasporti', 'Trasporto merci, magazzino conto terzi e logistica IT da Lacchiarella (Milano) per tutto il Nord Italia. Ogni consegna con firma, foto e posizione.', `
<div class="hero"><div class="wrap g">
  <div>
    <h1>Ritiriamo, custodiamo, consegniamo.</h1>
    <p class="sub">Trasporto merci, magazzino conto terzi e logistica del materiale informatico, da Lacchiarella per tutto il Nord Italia. Ogni consegna arriva con firma, foto e posizione.</p>
    <div class="cta"><a class="btn" href="${href('preventivo')}">Chiedi un preventivo</a><a class="btn ghost" href="${href('servizi')}">Cosa facciamo</a></div>
    <div class="facts">
      <div><b>Dal 2000</b><span>un'azienda di famiglia</span></div>
      <div><b>Circa 30 mezzi</b><span>dal furgone al bilico</span></div>
      <div><b>Magazzino a Lacchiarella</b><span>scaffali a 6 piani</span></div>
    </div>
  </div>
  <figure class="mappa glass" aria-label="Giri in partenza da Lacchiarella verso le città del Nord Italia">
    <div class="cap"><b>Ogni mattina da Lacchiarella</b><span class="muted">Nord Italia</span></div>${mappa()}
  </figure>
</div></div>
<div class="wrap">${azioni([['traccia', 'Traccia una spedizione', 'Con il numero della bolla'], ['preventivo', 'Chiedi un preventivo', 'Risposta dal nostro commerciale'], ['ritiro', 'Prenota un ritiro', 'Per i clienti già attivi'], ['', 'Area clienti', 'Giacenze, spedizioni, fatture', 'portaleUrl']])}</div>
${sezione('Quattro servizi, un solo interlocutore.', 'Dalla bolla alla fattura ogni passaggio è registrato nel nostro gestionale: sapete sempre dove si trova la vostra merce.', righe(SERVIZI), 'servizi')}
${sezione('Come lavoriamo.', 'Sei passaggi, sempre gli stessi. Ognuno lascia una traccia che potete chiederci in qualsiasi momento.', passi([
  ['Ordine', 'Ci scrivete per mail, come fate oggi.'], ['Bolla verificata', 'Controlliamo che ci sia tutto prima di partire.'], ['Magazzino', 'Ogni collo passa dallo scanner.'],
  ['Giro', 'Percorso e mezzo scelti per il carico.'], ['Consegna', 'Firma, foto e posizione del destinatario.'], ['Fattura', 'Elettronica, con il dettaglio delle consegne.']]), '', 'padding-top:0')}
${sezione('Lavoriamo per chi non può sbagliare una consegna.', 'Aziende tecnologiche, energia, banche, beverage e cosmetica: settori dove la puntualità e la tracciabilità contano quanto il trasporto.', `<div class="settori-strip">${['Tecnologia ed elettronica', 'Energia e impianti', 'Banche e assicurazioni', 'Beverage', 'Cosmetica e retail', 'E-commerce'].map((s) => `<a href="${href('settori')}">${s}</a>`).join('')}</div>`, '', 'padding-top:0')}
${sezione('Il mezzo giusto per il carico.', 'Circa 30 mezzi, quasi tutti con sponda idraulica, guidati dai nostri autisti. Disegnati qui in scala, uno accanto all\'altro.', strada() + `<p class="vai" style="margin-top:22px"><a href="${href('flotta')}">Tutta la flotta</a></p>`, 'flotta', 'padding-top:0')}
<section style="padding-top:0"><div class="wrap mag">
  <div>
    <h2 class="h2">La vostra merce, sempre sotto gli occhi.</h2>
    <p class="muted" style="margin-top:16px;max-width:46ch">Il magazzino di Lacchiarella è organizzato in corsie e scaffali a 6 piani. Ogni bancale ha un codice, un posto e una storia: chi l'ha messo lì, quando, e quando è uscito.</p>
    <ul class="punti"><li>Area clienti con giacenze aggiornate dal vivo</li><li>Controllo con lo scanner a ogni ingresso e uscita</li><li>Riconsegna chiesta online, con la data che preferite</li></ul>
    <p style="margin-top:26px"><a class="btn ghost" href="${href('servizi/magazzino')}">Il magazzino</a></p>
  </div>
  ${portaleMini()}
</div></section>
<section style="padding-top:0"><div class="wrap"><div class="banda">
  <div><h2>Cerchiamo autisti e magazzinieri.</h2><p>Patente C o CE, carta di qualificazione del conducente, voglia di lavorare in una squadra che usa strumenti nuovi. Mezzi in ordine e assegnati alla persona.</p></div>
  <a class="btn" href="${href('lavora-con-noi')}">Lavora con noi</a>
</div></div></section>`);

// ======================= SERVIZI =======================
P2('servizi', 'Servizi', 'Distribuzione, magazzino conto terzi, logistica IT, giacenze e resi: i servizi di Messina Autotrasporti.',
  intest([[null, 'Servizi']], 'Servizi', 'Un solo fornitore per trasportare, custodire e consegnare. Ogni servizio si può usare da solo o insieme agli altri.') +
  sezione('', '', righe(SERVIZI.map((s) => ({ ...s, vai: 'Apri ' + s.t.toLowerCase() })))) +
  sezione('Servizi accessori.', 'Li indicate nell\'ordine e li trovate voce per voce in fattura: niente sorprese, niente dimenticanze.', `<div class="tabella glass"><table>
    <thead><tr><th>Servizio</th><th>Quando serve</th></tr></thead><tbody>
    <tr><td>Sponda idraulica</td><td>Scarico di bancali senza banchina</td></tr>
    <tr><td>Consegna al piano</td><td>Uffici, negozi, abitazioni senza accesso a livello strada</td></tr>
    <tr><td>Fascia oraria o appuntamento</td><td>Destinatari con orari di ricevimento</td></tr>
    <tr><td>Prenotazione della consegna</td><td>Grande distribuzione, cantieri, magazzini con prenotazione</td></tr>
    <tr><td>Consegna di sabato</td><td>Su richiesta, il sabato mattina</td></tr>
    <tr><td>Consegne in ZTL</td><td>Centri storici con accesso limitato</td></tr>
    <tr><td>Assicurazione della merce</td><td>Valore superiore al limite di legge</td></tr>
    <tr><td>Contrassegno</td><td>Incasso alla consegna per vostro conto</td></tr>
    <tr><td>Prova di consegna</td><td>Firma, foto della bolla e posizione, sempre disponibili</td></tr>
    </tbody></table></div>`, '', 'padding-top:0'));

P2('servizi/trasporto', 'Distribuzione e trasporto', 'Collettame, carichi completi e consegne dedicate in tutto il Nord Italia, con sponda, consegna al piano e prova di consegna digitale.',
  intest([['servizi', 'Servizi'], [null, 'Distribuzione']], 'Distribuzione e trasporto', 'Dal singolo collo al bilico completo, con i nostri mezzi e i nostri autisti: non affidiamo le vostre consegne ad altri vettori.') +
  sezione('Cosa trasportiamo.', 'Merce su bancale e a colli, per aziende, negozi, cantieri e consegne a privati per conto dei nostri clienti.', righe([
    { t: 'Collettame', tag: 'Da 1 collo', p: 'Spedizioni piccole e medie raggruppate nei giri del giorno. Ritiro da voi o consegna diretta a Lacchiarella.' },
    { t: 'Carichi completi', tag: 'Fino a 33 bancali', p: 'Un mezzo dedicato da un punto all\'altro, dalla motrice al bilico. Partenza al mattino, consegna in giornata nel Nord.' },
    { t: 'Consegne dedicate', tag: 'Su richiesta', p: 'Un mezzo e un autista per voi, per lanci di prodotto, allestimenti, urgenze o consegne che richiedono attenzione particolare.' },
    { t: 'Consegne a domicilio', tag: 'Per conto vostro', p: 'Consegniamo ai vostri clienti finali con appuntamento, consegna al piano e avviso prima dell\'arrivo.' },
  ])) +
  sezione('Come arriva la vostra spedizione.', 'Ogni passaggio è registrato dallo scanner o dall\'app dell\'autista.', passi([
    ['Ritiro o ingresso', 'Ritiriamo da voi o ricevete a Lacchiarella.'], ['Scansione', 'Ogni collo è letto prima di salire sul mezzo.'], ['Giro ottimizzato', 'Percorsi calcolati per camion, non per auto.'], ['Avviso', 'Il destinatario sa quando arriviamo.'], ['Prova di consegna', 'Firma, foto della bolla e posizione GPS.']]), '', 'padding-top:0') +
  sezione('Dove arriviamo.', 'Partiamo ogni mattina da Lacchiarella, a sud di Milano. Copriamo con mezzi propri Lombardia, Piemonte, Liguria, Emilia-Romagna e Veneto; per le altre destinazioni chiedeteci un preventivo.', `<div class="mappa glass solo">${mappa()}</div>`, '', 'padding-top:0') +
  sezione('Domande frequenti.', '', faq([
    ['In quanto tempo consegnate?', 'Nel Nord Italia di solito in giornata o il giorno lavorativo dopo il ritiro, a seconda di zona e orario. Per consegne con appuntamento concordiamo la data con il destinatario.'],
    ['Consegnate di sabato?', 'Sì, il sabato mattina su richiesta. La domenica solo per lavori concordati.'],
    ['Posso sapere dov\'è la mia spedizione?', `Sì: con il numero della bolla nella pagina <a href="${href('traccia')}">Traccia</a>, oppure dall'area clienti con tutte le vostre spedizioni.`],
  ]), '', 'padding-top:0'));

P2('servizi/magazzino', 'Magazzino e logistica', 'Magazzino conto terzi a Lacchiarella: stoccaggio, preparazione ordini, merce di passaggio, inventari e area clienti dal vivo.',
  intest([['servizi', 'Servizi'], [null, 'Magazzino']], 'Magazzino e logistica', 'Il nostro polo di Lacchiarella lavora dalle 6 del mattino fino a notte: riceve, custodisce, prepara e spedisce la vostra merce.') +
  `<section><div class="wrap mag"><div><h2 class="h2">Ogni bancale ha un posto.</h2>
    <p class="muted" style="margin-top:16px;max-width:46ch">Scaffali a 6 piani, ogni posto con il suo codice (per esempio S03-2-1: scaffale 3, piano 2, posto 1) e la sua etichetta. Il magazziniere spara il bancale e il posto: il sistema sa sempre dove si trova ogni cosa.</p>
    <ul class="punti"><li>Contenuto di ogni bancale, anche misto</li><li>Storico di chi ha mosso cosa e quando</li><li>Inventari a rotazione, senza fermare il magazzino</li></ul></div>${portaleMini()}</div></section>` +
  sezione('Cosa facciamo in magazzino.', '', righe([
    { t: 'Stoccaggio', tag: 'Conto terzi', p: 'Custodia di bancali e colli in area dedicata per cliente, con giacenze sempre aggiornate.' },
    { t: 'Ricevimento', tag: 'Con scanner', p: 'Controlliamo quantità e codici all\'arrivo e segnaliamo subito differenze rispetto al documento di trasporto.' },
    { t: 'Preparazione ordini', tag: 'Pick and pack', p: 'Prepariamo le spedizioni dai vostri ordini, anche per singolo destinatario, con etichette e documenti.' },
    { t: 'Merce di passaggio', tag: 'In giornata', p: 'Merce che entra al mattino e riparte nei giri dello stesso giorno, senza andare a scaffale.' },
    { t: 'Inventari', tag: 'Su richiesta', p: 'Conte programmate posto per posto: niente si chiude finché i numeri non tornano.' },
  ]), '', 'padding-top:0') +
  sezione('Cosa vedete voi.', 'Nell\'area clienti trovate giacenze, movimenti e seriali in tempo reale. Se il vostro sistema lo richiede, ogni notte vi mandiamo anche un file con tutti i movimenti del giorno.', passi([
    ['Giacenze dal vivo', 'Ogni bancale con posto e data.'], ['Seriali', 'Per la merce tracciata pezzo per pezzo.'], ['Riconsegne', 'Richieste online con la data che volete.'], ['File giornaliero', 'Excel o CSV ogni notte, se serve.']]), '', 'padding-top:0'));

P2('servizi/logistica-it', 'Logistica IT', 'Distribuzione di PC e telefoni aziendali ai dipendenti: cespiti, accessori, busta di reso, ritiro dei dispositivi vecchi, tracciamento per IMEI e seriale.',
  intest([['servizi', 'Servizi'], [null, 'Logistica IT']], 'Logistica IT', 'Portiamo PC e telefoni aziendali a ogni dipendente, pronti all\'uso, e ritiriamo quelli vecchi. Ogni dispositivo è tracciato per numero di serie o IMEI.') +
  sezione('Rinnovi di flotte aziendali.', 'Gestiamo progetti da migliaia di dispositivi per banche, assicurazioni e grandi aziende, anche attraverso i loro fornitori IT.', passi([
    ['Ingresso', 'Ogni dispositivo letto con lo scanner all\'arrivo.'], ['Preparazione', 'Etichette cespite, accessori e imballo per utente.'], ['Spedizione', 'Alla sede o al dipendente, con etichette nominative.'], ['Reso', 'Busta con etichetta di reso per il dispositivo vecchio.'], ['Rendiconto', 'IMEI, cespite e utente in un file ogni giorno.']])) +
  sezione('Cosa possiamo fare per ogni dispositivo.', '', righe([
    { t: 'Doppio cespite', tag: 'Telefono e scatola', p: 'Applichiamo le etichette cespite sul dispositivo e sulla scatola. Il lavoro non si chiude finché le due letture non coincidono.' },
    { t: 'Accessori per utente', tag: 'Su richiesta', p: 'Caricabatterie, cavi, cover: aggiunti solo a chi li ha richiesti, secondo l\'elenco che ci mandate.' },
    { t: 'Formattazione e test', tag: 'Con Messina Corporation', p: 'I dispositivi che rientrano vengono cancellati con software certificato e testati nel nostro stage da 60 postazioni.', link: '', },
    { t: 'Portale dedicato', tag: 'Dal vivo', p: 'Il vostro referente vede ingressi, preparazioni e spedizioni in tempo reale, con tutti i seriali.' },
  ]), '', 'padding-top:0') +
  `<section style="padding-top:0"><div class="wrap"><div class="banda"><div><h2>Dispositivi a fine vita?</h2><p>Ritiro, cancellazione certificata dei dati e valutazione dei lotti li fa Messina Corporation, la nostra società sorella, nello stesso polo di Lacchiarella.</p></div><a class="btn" href="#" data-link="corporationUrl">Messina Corporation</a></div></div></section>`);

P2('servizi/giacenze-resi', 'Giacenze e resi', 'Mancate consegne, giacenze e resi: avviso in giornata, merce al sicuro in magazzino, riconsegna quando volete.',
  intest([['servizi', 'Servizi'], [null, 'Giacenze e resi']], 'Giacenze e resi', 'Una consegna non riuscita non è una spedizione persa: la merce torna al sicuro e voi decidete cosa fare.') +
  sezione('Cosa succede se il destinatario non c\'è.', '', passi([
    ['Tentativo', 'L\'autista registra il motivo con l\'app.'], ['Avviso', 'Vi scriviamo il giorno stesso.'], ['Magazzino', 'La merce rientra a Lacchiarella, in area giacenze.'], ['Decisione', 'Riconsegna, reso al mittente o ritiro in sede.'], ['Riconsegna', 'Nella data che indicate voi.']])) +
  sezione('Costi chiari.', 'La giacenza ha un costo giornaliero di deposito e la riconsegna si paga come una nuova consegna, secondo le tariffe del vostro contratto. Dall\'area clienti vedete ogni giacenza aperta e da quanti giorni.', faq([
    ['Quanto resta la merce in giacenza?', 'Finché non ci date istruzioni, fino al termine previsto dal contratto. Oltre quel termine vi contattiamo per il reso al mittente.'],
    ['Posso chiedere la riconsegna online?', `Sì, dall'area clienti: scegliete la data e il nostro ufficio la conferma inserendola nel giro.`],
    ['Gestite anche i resi dei miei clienti?', 'Sì: ritiriamo la merce resa, la controlliamo all\'ingresso e la rimettiamo a scaffale o ve la riportiamo, come preferite.'],
  ]), '', 'padding-top:0'));

// ======================= SETTORI =======================
P2('settori', 'Settori', 'Tecnologia, energia, banche, beverage, cosmetica ed e-commerce: come lavoriamo per ogni settore.',
  intest([[null, 'Settori']], 'Settori', 'Ogni settore ha le sue regole di consegna. Le conosciamo perché le seguiamo ogni giorno.') +
  sezione('', '', righe([
    { t: 'Tecnologia ed elettronica', tag: 'Seriali', p: 'Distribuzione di prodotti di elettronica nel Nord Italia, con merce di alto valore tracciata collo per collo e consegne su appuntamento.' },
    { t: 'Energia e impianti', tag: 'Portale dal vivo', p: 'Materiali per cantieri e sedi tecniche, con magazzino dedicato e seriali visibili al cliente 24 ore su 24.' },
    { t: 'Banche e assicurazioni', tag: 'IMEI e cespiti', p: 'Rinnovi di telefoni e PC per migliaia di dipendenti, con etichette cespite, accessori per utente e resi.', link: 'servizi/logistica-it', vai: 'Logistica IT' },
    { t: 'Beverage', tag: 'Consegna in cantina', p: 'Consegne a ristoranti, enoteche e privati con prenotazione, consegna al piano o in cantina.' },
    { t: 'Cosmetica e retail', tag: 'Punti vendita', p: 'Rifornimento di negozi e corner con finestre orarie precise e consegna con sponda.' },
    { t: 'E-commerce', tag: 'Resi', p: 'Preparazione ordini, consegna al cliente finale e gestione dei resi dal nostro magazzino.' },
  ])) +
  `<section style="padding-top:0"><div class="wrap"><div class="banda"><div><h2>Il vostro settore non c'è?</h2><p>Raccontateci cosa spedite: la maggior parte dei nostri servizi nasce dalla richiesta di un cliente.</p></div><a class="btn" href="${href('preventivo')}">Chiedi un preventivo</a></div></div></section>`);

// ======================= FLOTTA =======================
P2('flotta', 'Flotta', 'Circa 30 mezzi: Sprinter, furgoni, motrici, tre assi e bilici, quasi tutti con sponda idraulica.',
  intest([[null, 'Flotta']], 'Flotta', 'Circa 30 mezzi, quasi tutti con sponda idraulica. Ogni mezzo ha il suo autista: lo conosce e lo tiene in ordine.') +
  sezione('', '', strada()) +
  sezione('Cosa porta ogni mezzo.', 'Valori indicativi: per carichi particolari verifichiamo misure e peso prima di partire.', `<div class="tabella glass"><table>
    <thead><tr><th>Mezzo</th><th>Portata indicativa</th><th>Ideale per</th></tr></thead><tbody>
    <tr><td><b>Sprinter e furgoni</b></td><td>Fino a 4 bancali, circa 1.000 kg</td><td>Città, ZTL, consegne veloci e a domicilio</td></tr>
    <tr><td><b>Motrici</b></td><td>Fino a 18 bancali</td><td>Distribuzione con sponda, consegne al piano</td></tr>
    <tr><td><b>Tre assi</b></td><td>Fino a 20 bancali</td><td>Carichi pesanti e consegne multiple</td></tr>
    <tr><td><b>Bilici</b></td><td>Fino a 33 bancali</td><td>Carichi completi e tratte lunghe</td></tr>
    </tbody></table></div>`, '', 'padding-top:0') +
  sezione('Mezzi seguiti ogni giorno.', '', righe([
    { t: 'Manutenzione interna', tag: 'Officina', p: 'Un meccanico interno controlla i mezzi e programma tagliandi e revisioni.' },
    { t: 'Un autista, un mezzo', tag: 'Assegnazione fissa', p: 'Ogni mezzo è affidato sempre alla stessa persona: più cura, meno guasti, responsabilità chiara.' },
    { t: 'Giri calcolati per camion', tag: 'Meno chilometri', p: 'Percorsi che tengono conto di altezze, pesi e ZTL: meno chilometri, meno gasolio, consegne più puntuali.' },
  ]), '', 'padding-top:0'));

// ======================= AZIENDA =======================
P2('azienda', 'Chi siamo', 'Messina Autotrasporti: azienda di famiglia fondata nel 2000 a Lacchiarella, oggi alla seconda generazione.',
  intest([[null, 'Azienda']], 'Un\'azienda di famiglia, dal 2000.', 'Messina Autotrasporti nasce nel 2000 da Sara Messina e Tiziano Costa. Oggi in azienda lavora anche la seconda generazione, Matteo e Pierpaolo Costa.') +
  `<section><div class="wrap"><div class="storia glass">
    <div><b>2000</b><span>Sara Messina e Tiziano Costa fondano l'azienda a Lacchiarella.</span></div>
    <div><b>2021</b><span>Tra le aziende europee a crescita più rapida nella classifica FT 1000 del Financial Times.</span></div>
    <div><b>2023</b><span>Nasce Messina Corporation per dare una seconda vita ai dispositivi aziendali.</span></div>
    <div><b>Oggi</b><span>Circa 30 mezzi, un polo logistico a Lacchiarella e un sistema digitale nuovo per ogni passaggio.</span></div>
  </div></div></section>` +
  sezione('In cosa crediamo.', '', righe([
    { t: 'Il cliente al centro', p: 'Ogni cliente ha esigenze diverse: tariffe, accessori e regole di consegna sono scritte nel suo contratto e rispettate a ogni bolla.' },
    { t: 'Persone', p: 'Autisti e magazzinieri sono il nostro servizio. Mezzi in ordine, strumenti semplici, formazione continua.' },
    { t: 'Sostenibilità', p: 'Giri più corti, mezzi seguiti dal nostro meccanico e, con Messina Corporation, dispositivi che tornano a essere usati invece di diventare rifiuti.' },
    { t: 'Innovazione', p: 'Prova di consegna digitale, magazzino a scanner e portale clienti dal vivo: la tecnologia serve a sbagliare meno.' },
  ]), '', 'padding-top:0') +
  sezione('La nostra sede.', '', `<div class="mag" style="align-items:start">${dati([['Indirizzo', 'Via Cascina Nuova 1, 20084 Lacchiarella (MI), località Villamaggiore'], ['Magazzino', 'Dalle 6 del mattino fino a notte, dal lunedì al venerdì; sabato su richiesta'], ['Società sorella', '<a href="#" data-link="corporationUrl">Messina Corporation</a>, nello stesso polo'], ['Documenti', `<a href="${href('documenti')}">Iscrizioni, DURC e polizze</a>`]])}<p><a class="btn ghost" href="${MAPPA_URL}" target="_blank" rel="noopener">Apri in Google Maps</a></p></div>`, '', 'padding-top:0'));

P2('documenti', 'Documenti', 'Documenti di qualifica fornitore di Messina Autotrasporti: iscrizioni, regolarità contributiva, polizze.',
  intest([['azienda', 'Azienda'], [null, 'Documenti']], 'Documenti', 'Quello che serve al vostro ufficio acquisti per qualificarci come fornitore. Ve lo mandiamo su richiesta, sempre aggiornato.') +
  sezione('', '', `${dati([
    ['Albo degli autotrasportatori', 'Iscrizione all\'Albo nazionale delle persone fisiche e giuridiche che esercitano l\'autotrasporto di cose per conto di terzi [numero da inserire]'],
    ['Albo gestori ambientali', 'Iscrizione n. MI/062921 per il trasporto di rifiuti non pericolosi'],
    ['Regolarità', 'Il committente può verificare la nostra regolarità contributiva e fiscale online sul Portale dell\'automobilista, come previsto per l\'autotrasporto conto terzi: così è sollevato dalla responsabilità solidale'],
    ['Assicurazione', 'Polizza di responsabilità civile del vettore [compagnia e massimale da inserire]; assicurazione aggiuntiva della merce su richiesta'],
    ['Visura e certificati', 'Visura camerale, DURC e certificato di iscrizione all\'Albo, inviati su richiesta'],
  ])}<p style="margin-top:22px"><a class="btn" href="${href('contatti')}#modulo">Chiedi i documenti</a></p>`));

// ======================= LAVORA CON NOI =======================
P2('lavora-con-noi', 'Lavora con noi', 'Posizioni aperte in Messina Autotrasporti: autisti con patente C e CE, magazzinieri, mulettisti, impiegati.',
  intest([[null, 'Lavora con noi']], 'Lavora con noi', 'Cerchiamo persone affidabili che vogliono lavorare in una squadra seria, con mezzi in ordine e strumenti nuovi.') +
  sezione('Chi cerchiamo.', '', righe([
    { t: 'Autisti', tag: 'Patente C o CE', p: 'Distribuzione nel Nord Italia con rientro in giornata. Servono patente C o CE e carta di qualificazione del conducente (CQC merci).' },
    { t: 'Magazzinieri', tag: 'Lacchiarella', p: 'Ricevimento, preparazione e carico con lo scanner. Turni tra le 6 del mattino e la sera.' },
    { t: 'Mulettisti', tag: 'Patentino', p: 'Movimentazione bancali a scaffale. Serve l\'abilitazione all\'uso del carrello elevatore.' },
    { t: 'Ufficio', tag: 'Bolle e traffico', p: 'Gestione ordini, bolle e giri insieme al nostro ufficio traffico.' },
  ])) +
  sezione('Cosa trovate da noi.', '', passi([['Un mezzo vostro', 'Assegnato alla persona, curato dal meccanico interno.'], ['App semplice', 'Consegne, firme e foto dal telefono, senza carta.'], ['Rientro a casa', 'Il giro si chiude dall\'app, niente ore in ufficio a fine giornata.'], ['Crescita', 'Formazione e possibilità di cambiare ruolo.']]), '', 'padding-top:0') +
  `<section id="modulo" style="padding-top:0"><div class="wrap prev"><div><h2>Candidatevi.</h2><p class="lead">Lasciate i vostri dati: vi chiamiamo noi. Il curriculum potete mandarlo a ${MAIL('lavoro')}.</p></div>
    ${modulo('trasporti', 'candidatura', scelta('Posizione', 'Posizione', ['Autista', 'Magazziniere', 'Mulettista', 'Ufficio', 'Altro'], true) + chips('Patenti', 'Patenti e abilitazioni', ['B', 'C', 'CE', 'CQC merci', 'Muletto']) + dett('Zona', 'Dove abitate', 'placeholder="Comune" maxlength="120"', true), 'Invia la candidatura', 'Esperienze precedenti, disponibilità, quando potete iniziare')}
  </div></section>`);

// ======================= SUPPORTO =======================
P2('traccia', 'Traccia una spedizione', 'Dove si trova la vostra spedizione: inserite il numero della bolla.',
  intest([[null, 'Traccia']], 'Traccia una spedizione', 'Inserite il numero della bolla che trovate sul documento di trasporto o nella mail di conferma.') +
  `<section style="padding-top:0"><div class="wrap traccia">
    <form class="cerca-sped panel glass" data-traccia novalidate>
      <label class="f">Numero della bolla<input name="numero" required maxlength="30" placeholder="Per esempio 26-000043" autocomplete="off"></label>
      <label class="f">CAP di consegna<input name="cap" inputmode="numeric" maxlength="5" placeholder="20100"></label>
      <button class="btn" type="submit">Traccia</button>
      <div class="traccia-esito" role="status" tabindex="-1" hidden></div>
    </form>
    <div><h2 class="h3">Avete molte spedizioni?</h2><p class="muted" style="margin-top:8px">Nell'area clienti le vedete tutte insieme, con la prova di consegna di ognuna.</p><p style="margin-top:16px"><a class="btn ghost" href="#" data-link="portaleUrl">Area clienti</a></p></div>
  </div></section>`);

P2('preventivo', 'Chiedi un preventivo', 'Richiesta di preventivo per trasporto, magazzino o logistica IT: risponde il nostro commerciale.',
  intest([[null, 'Preventivo']], 'Chiedi un preventivo', 'Diteci cosa spedite, da dove a dove e ogni quanto. La richiesta arriva direttamente al nostro commerciale.') +
  `<section id="modulo" style="padding-top:0"><div class="wrap prev"><div>${recapiti(sito)}<p class="muted" style="margin-top:24px;max-width:36ch">Più dettagli ci date (quantità, misure, accessori), più il preventivo è preciso.</p></div>
    ${modulo('trasporti', 'preventivo', chips('Servizio', 'Cosa vi serve', ['Trasporto bancali', 'Trasporto colli', 'Magazzino', 'Logistica IT', 'Consegne a domicilio']) + dett('Da', 'Da', 'placeholder="Città di ritiro" maxlength="120"') + dett('A', 'A', 'placeholder="Città di consegna" maxlength="120"') + scelta('Frequenza', 'Ogni quanto', ['Una volta', 'Ogni settimana', 'Ogni giorno', 'Da definire']) + dett('Quantità', 'Quantità indicativa', 'placeholder="Per esempio 6 bancali" maxlength="120"') + chips('Accessori', 'Servizi accessori', ['Sponda', 'Al piano', 'Fascia oraria', 'Sabato', 'Assicurazione']), 'Chiedi un preventivo', 'Misure, pesi, date, tipo di merce')}
  </div></section>`);

P2('ritiro', 'Prenota un ritiro', 'Prenotazione di un ritiro per i clienti di Messina Autotrasporti.',
  intest([[null, 'Ritiro']], 'Prenota un ritiro', 'Per i clienti già attivi. Vi confermiamo per mail giorno e fascia oraria del ritiro.') +
  `<section id="modulo" style="padding-top:0"><div class="wrap prev"><div>${recapiti(sito, [['Ordini e ritiri', MAIL('ordini')], ['Telefono', TEL]])}<p class="muted" style="margin-top:24px;max-width:36ch">Non siete ancora clienti? <a href="${href('preventivo')}">Chiedete prima un preventivo</a>.</p></div>
    ${modulo('trasporti', 'ritiro', dett('Indirizzo', 'Indirizzo di ritiro', 'required maxlength="160" placeholder="Via, numero, città"', true) + dett('Data', 'Giorno preferito', 'type="date"') + dett('Colli', 'Colli o bancali', 'placeholder="Per esempio 4 bancali" maxlength="80"') + dett('Destinazione', 'Destinazione', 'placeholder="Città o magazzino Lacchiarella" maxlength="120"', true) + chips('Accessori', 'Serve', ['Sponda', 'Transpallet', 'Orario preciso']), 'Prenota il ritiro', 'Orari di apertura, persona di riferimento, peso indicativo')}
  </div></section>`);

P2('contatti', 'Contatti', 'Contatti di Messina Autotrasporti: sede di Lacchiarella, telefono, email per ufficio, orari.',
  intest([[null, 'Contatti']], 'Contatti', 'Scriveteci all\'ufficio giusto: vi risponde chi segue davvero la vostra richiesta.') +
  sezione('', '', `<div class="uffici">${[
    ['Informazioni', MAIL('info'), 'Domande generali e nuovi clienti'], ['Ordini e ritiri', MAIL('ordini'), 'Bolle, ritiri, consegne del giorno'], ['Commerciale', MAIL('commerciale'), 'Preventivi e tariffe'],
    ['Amministrazione', MAIL('amministrazione'), 'Fatture e pagamenti'], ['Lavoro', MAIL('lavoro'), 'Candidature e curriculum'], ['Telefono', TEL, 'Dal lunedì al venerdì, [orari uffici]'],
  ].map(([t, v, s]) => `<div class="glass"><b>${t}</b>${v}<span class="muted">${s}</span></div>`).join('')}</div>`) +
  `<section id="modulo" style="padding-top:0"><div class="wrap prev"><div><h2>Scriveteci.</h2>${recapiti(sito)}</div>${modulo('trasporti', 'contatto', scelta('Argomento', 'Argomento', ['Informazioni', 'Documenti', 'Reclamo', 'Fornitori', 'Altro'], true), 'Invia il messaggio', 'Scrivete qui la vostra richiesta')}</div></section>`);

P2('domande', 'Domande frequenti', 'Risposte alle domande più frequenti su spedizioni, giacenze, danni, assicurazione e fatture.',
  intest([[null, 'Domande']], 'Domande frequenti', 'Le risposte che chiedete più spesso al nostro ufficio.') +
  sezione('Spedizioni', '', faq([
    ['Come chiedo un preventivo?', `Dalla pagina <a href="${href('preventivo')}">Preventivo</a> o scrivendo a ${MAIL('commerciale')}. Vi risponde il nostro commerciale.`],
    ['Come mando un ordine?', 'Per mail a ordini, con indirizzo, colli e accessori. Gli accordi presi al telefono ve li confermiamo sempre per mail, così tutto resta scritto.'],
    ['Posso sapere dov\'è la mia spedizione?', `Sì, con il numero della bolla nella pagina <a href="${href('traccia')}">Traccia</a> o dall'area clienti.`],
    ['Consegnate di sabato o di sera?', 'Il sabato mattina sì, su richiesta. Le consegne serali le valutiamo caso per caso.'],
  ])) +
  sezione('Problemi', '', faq([
    ['Cosa succede se il destinatario non c\'è?', `La merce va in giacenza nel nostro magazzino e vi avvisiamo il giorno stesso. Vedete la pagina <a href="${href('servizi/giacenze-resi')}">Giacenze e resi</a>.`],
    ['Come segnalo un danno?', 'Se il danno si vede alla consegna, scrivetelo sul documento dell\'autista prima di firmare. Se scoprite un danno non visibile all\'apertura dell\'imballo, segnalatelo per iscritto entro 8 giorni dal ricevimento, come prevede il codice civile, con foto della merce e dell\'imballo.'],
    ['La merce è assicurata?', 'Per legge, nei trasporti nazionali il vettore risponde fino a 1 euro per chilogrammo di peso lordo della merce persa o danneggiata (art. 1696 del codice civile). Per merce di valore potete chiederci un\'assicurazione aggiuntiva sul valore dichiarato.'],
  ]), '', 'padding-top:0') +
  sezione('Fatture e documenti', '', faq([
    ['Come ricevo le fatture?', 'Elettroniche tramite SdI, con il dettaglio di ogni consegna e degli accessori. Nell\'area clienti trovate anche il PDF.'],
    ['Mi servono DURC e iscrizioni per qualificarvi come fornitore.', `Trovate l'elenco nella pagina <a href="${href('documenti')}">Documenti</a>: ve li mandiamo su richiesta.`],
  ]), '', 'padding-top:0'));

// ======================= LEGALE =======================
const legale = (path, titolo, corpo) => P2(path, titolo, titolo + ' di Messina Autotrasporti.', intest([[null, titolo]], titolo, '') + `<section style="padding-top:0"><div class="wrap prosa">${bozza()}${corpo}</div></section>`);
legale('condizioni', 'Condizioni di trasporto', `
  <h2>Oggetto</h2><p>Queste condizioni valgono per i trasporti di merci su strada per conto terzi affidati a Messina Autotrasporti S.r.l., salvo quanto diversamente previsto nel contratto con il singolo cliente.</p>
  <h2>Ordini</h2><p>Gli ordini si inviano per iscritto, anche per mail, con indirizzo, numero di colli, peso indicativo, accessori richiesti ed eventuali vincoli di orario. Gli accordi telefonici sono confermati per mail.</p>
  <h2>Responsabilità</h2><p>Nei trasporti nazionali la responsabilità del vettore per perdita o avaria è limitata a 1 euro per chilogrammo di peso lordo (art. 1696 c.c.); nei trasporti internazionali si applica la Convenzione CMR. Su richiesta scritta è possibile assicurare la merce per il valore dichiarato.</p>
  <h2>Reclami</h2><p>Le riserve per danni visibili vanno scritte sul documento di trasporto alla consegna. I danni non riconoscibili al momento della consegna vanno segnalati per iscritto entro 8 giorni dal ricevimento (art. 1698 c.c.).</p>
  <h2>Giacenze</h2><p>In caso di mancata consegna non imputabile al vettore, la merce resta in giacenza a Lacchiarella con i costi di deposito e riconsegna previsti dal contratto.</p>
  <h2>Merci escluse</h2><p>Non trasportiamo merci pericolose soggette ad ADR, denaro e valori, animali vivi [elenco da confermare].</p>`);
legale('privacy', 'Privacy', `
  <h2>Titolare</h2><p>Messina Autotrasporti S.r.l., Via Cascina Nuova 1, 20084 Lacchiarella (MI), P.IVA 09420230964, ${MAIL('info')}.</p>
  <h2>Quali dati e perché</h2><p>I dati che scrivete nei moduli (nome, azienda, email, telefono e i dettagli della richiesta) servono solo a rispondervi e a preparare un'offerta o organizzare un ritiro. Base giuridica: misure precontrattuali richieste da voi (art. 6.1.b GDPR). Per le candidature: la valutazione del profilo per un'eventuale assunzione.</p>
  <h2>Per quanto tempo</h2><p>Fino a 24 mesi dall'ultima comunicazione; le candidature per 12 mesi. Se la richiesta diventa un contratto, per i tempi previsti dalla legge.</p>
  <h2>Chi li vede</h2><p>Solo il personale incaricato. I dati sono conservati su server nell'Unione europea con fornitori che agiscono come responsabili del trattamento.</p>
  <h2>I vostri diritti</h2><p>Potete chiedere di vedere, correggere o cancellare i vostri dati, o opporvi al trattamento, scrivendo a ${MAIL('info')}. Potete rivolgervi al Garante per la protezione dei dati personali.</p>`);
legale('cookie', 'Cookie', `<p>Questo sito non usa cookie di profilazione né strumenti di statistica di terze parti. Usa solo la memoria tecnica del browser necessaria al funzionamento delle pagine, che non richiede consenso.</p><p>Il carattere tipografico è caricato da Google Fonts [da sostituire con una copia ospitata sul sito].</p>`);
legale('note-legali', 'Note legali', dati([['Ragione sociale', 'Messina Autotrasporti S.r.l.'], ['Sede legale', 'Via Cascina Nuova 1, 20084 Lacchiarella (MI)'], ['Partita IVA', '09420230964'], ['REA', '[da inserire]'], ['PEC', '[da inserire]'], ['Codice destinatario SdI', '[da inserire]'], ['Albo gestori ambientali', 'n. MI/062921']]));

export default sito;
