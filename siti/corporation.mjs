// Sito pubblico di Messina Corporation: tutte le pagine.
// Fonti: Matteo e Pier (stage da 60 postazioni, Certus, marchi, gradi, canali di vendita, "usati, non ricondizionati"),
// registro imprese (P.IVA 12767280964, sede), articolo Italia Daily News 24 del 3/5/2023 (nascita nel 2023, economia circolare).
import { href, intest, sezione, righe, passi, faq, dati, azioni, modulo, dett, scelta, chips, recapiti, bozza } from './parti.mjs';

const TEL = '<a href="tel:+390292270155">02 9227 0155</a>';
const MAIL = (u) => `<a href="mailto:${u}@[dominio]">${u}@[dominio]</a>`;
const MAPPA_URL = 'https://www.google.com/maps/search/?api=1&query=Via+Cascina+Nuova+1+20084+Lacchiarella+MI';

const pc = () => `<figure class="pc" aria-label="Un portatile che mostra la cancellazione certificata dei dati completata al 100%">
  <div class="schermo"><div class="vetro">
    <div class="riga"><span>Seriale <b>5CG1427XQ8</b></span><span>EliteBook 840 G8</span></div>
    <div class="titolo">Cancellazione certificata</div>
    <div class="perc" aria-hidden="true"></div>
    <div class="barra"><i></i></div>
    <div class="fatto"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>Rapporto pronto per il cliente</div>
  </div></div>
  <div class="base"></div>
</figure>`;

const gradi = () => `<div class="gradi glass">
  <div class="grado"><div class="l">A</div><h3>Ottimo</h3><p>Quasi impossibile distinguerlo da nuovo. Al massimo micro-segni visibili da vicino.</p></div>
  <div class="grado"><div class="l">B</div><h3>Buono</h3><p>Leggeri segni d'uso sulla scocca. Schermo e tastiera in ordine.</p></div>
  <div class="grado"><div class="l">C</div><h3>Discreto</h3><p>Segni evidenti d'uso, possibile piccola ammaccatura.</p></div>
</div>`;

const postazioni = () => `<figure class="postazioni glass" style="margin:0" aria-label="Schema delle 60 postazioni dello stage">${'<i></i>'.repeat(60)}<figcaption><span>In lavorazione</span><span>Libere</span></figcaption></figure>`;

const MARKET = [['Back Market', 'https://www.backmarket.it'], ['Refurbed', 'https://www.refurbed.it'], ['eBay', 'https://www.ebay.it'], ['Subito', 'https://www.subito.it'], ['Amazon', 'https://www.amazon.it']];

const AZIENDE = [
  { t: 'Ritiro', link: 'aziende/ritiro', tag: 'Con i nostri mezzi', p: 'Passiamo a prendere PC, portatili, telefoni, tablet e monitor, anche in più sedi. Ogni pezzo è registrato con il suo numero di serie.' },
  { t: 'Cancellazione dei dati', link: 'aziende/cancellazione-dati', tag: 'Rapporto per seriale', p: 'Dati cancellati con software certificato. Per ogni dispositivo ricevete un rapporto con seriale, metodo ed esito.' },
  { t: 'Valutazione dei lotti', link: 'aziende/valutazione-lotti', tag: 'Offerta scritta', p: 'Diamo un valore ai dispositivi che possono essere riusati: quello che vale si paga, quello che non vale si smaltisce in regola.' },
  { t: 'Stage di formattazione', link: 'aziende/stage', tag: '60 postazioni', p: 'Formattazione e test di grandi quantità di PC e telefoni per fornitori IT e aziende, con riscontro ogni giorno.' },
];

const sito = {
  id: 'corporation',
  nome: 'Messina Corporation',
  logo: ['Messina', 'Corporation'],
  titoloBase: 'Messina Corporation',
  menu: [['aziende', 'Aziende'], ['aziende/cancellazione-dati', 'Dati'], ['gradi', 'Gradi'], ['azienda', 'Chi siamo'], ['contatti', 'Contatti']],
  utilita: [['valuta', 'Valuta un lotto']],
  cta: ['', 'Negozio', 'negozioUrl'],
  indirizzo: 'Via Cascina Nuova 1, 20084 Lacchiarella (MI)',
  contattiBrevi: `Tel. ${TEL}`,
  recapiti: [['Sede', `Via Cascina Nuova 1, 20084 Lacchiarella (MI)<br><a href="${MAPPA_URL}" target="_blank" rel="noopener">Apri in Google Maps</a>`], ['Telefono', TEL], ['Email', MAIL('info')]],
  piede: [
    ['Aziende', [['aziende/ritiro', 'Ritiro'], ['aziende/cancellazione-dati', 'Cancellazione dei dati'], ['aziende/valutazione-lotti', 'Valutazione dei lotti'], ['aziende/stage', 'Stage'], ['valuta', 'Valuta un lotto']]],
    ['Acquisti', [['', 'Negozio', 'negozioUrl'], ['gradi', 'Gradi'], ['dove-comprare', 'Dove comprare'], ['garanzia', 'Garanzia e resi'], ['domande', 'Domande']]],
    ['Azienda', [['azienda', 'Chi siamo'], ['contatti', 'Contatti'], ['', 'Messina Autotrasporti', 'trasportiUrl']]],
    ['Legale', [['condizioni', 'Condizioni di vendita'], ['privacy', 'Privacy'], ['cookie', 'Cookie'], ['note-legali', 'Note legali']]],
  ],
  legale: 'Messina Corporation S.r.l., Via Cascina Nuova 1, 20084 Lacchiarella (MI). P.IVA 12767280964.',
  pagine: [],
};
const P2 = (path, titolo, descrizione, html) => sito.pagine.push({ path, titolo, descrizione, html });

// ======================= HOME =======================
P2('', 'Messina Corporation', 'Ritiro di computer e telefoni aziendali dismessi, cancellazione certificata dei dati, valutazione dei lotti e vendita di dispositivi usati garantiti.', `
<div class="hero"><div class="wrap g">
  <div>
    <h1>Dati cancellati. Dispositivi rimessi in vita.</h1>
    <p class="sub">Ritiriamo i computer e i telefoni che la vostra azienda dismette, cancelliamo i dati con un rapporto per ogni numero di serie e li rimettiamo in vendita, testati e garantiti.</p>
    <div class="cta"><a class="btn" href="${href('valuta')}">Valuta un lotto</a><a class="btn ghost" href="#" data-link="negozioUrl">Vai al negozio</a></div>
  </div>
  ${pc()}
</div></div>
<div class="wrap">${azioni([['valuta', 'Valuta un lotto', 'Offerta per i vostri dispositivi'], ['aziende/ritiro', 'Organizza un ritiro', 'Anche in più sedi'], ['aziende/cancellazione-dati', 'Cancellazione dei dati', 'Come funziona il rapporto'], ['', 'Compra un dispositivo', 'Nel nostro negozio', 'negozioUrl']])}</div>
${sezione('Per le aziende che rinnovano il parco IT.', 'Vi liberiamo dei dispositivi vecchi senza rischi sui dati, e vi diamo un valore per quelli che possono avere una seconda vita.', `<div class="servizi glass">${AZIENDE.map((r) => `<div class="srv"><h3><a href="${href(r.link)}">${r.t}</a></h3><div><p>${r.p}</p><p class="vai"><a href="${href(r.link)}">Scopri di più</a></p></div><span class="tag">${r.tag}</span></div>`).join('')}</div>`, 'aziende')}
${sezione('Il percorso di ogni dispositivo.', 'Cinque passaggi, tracciati per numero di serie. In qualsiasi momento sappiamo dov\'è e cosa gli è stato fatto.', passi([['Ritiro', 'Registrato con il seriale.'], ['Cancellazione', 'Certificata, con rapporto.'], ['Test e grado', 'A, B o C secondo lo stato.'], ['Pronto', 'Pulito, testato, imballato.'], ['In vendita', 'Nel nostro negozio e online.']]), 'percorso', 'padding-top:0')}
${sezione('Tre gradi, descritti senza giri di parole.', 'Il grado riguarda solo l\'aspetto. Tutti i dispositivi funzionano al 100% e hanno i dati cancellati.', gradi() + `<p class="vai" style="margin-top:18px"><a href="${href('gradi')}">Come assegniamo il grado</a></p>`, 'gradi', 'padding-top:0')}
<section style="padding-top:0"><div class="wrap"><div class="compra">
  <div><h2>Portatili usati, testati e garantiti.</h2><p>Nel nostro negozio trovate i dispositivi usciti dal percorso, con grado, foto e garanzia. Pagamento sicuro e spedizione con Messina Autotrasporti.</p><p style="margin-top:24px"><a class="btn" href="#" data-link="negozioUrl">Vai al negozio</a></p></div>
  <div class="anche"><b>Ci trovate anche su</b>${MARKET.map(([n]) => n).join(', ').replace(/, ([^,]*)$/, ' e $1')}. <a href="${href('dove-comprare')}" style="color:#fff">Dove comprare</a></div>
</div></div></section>
<section id="stage"><div class="wrap stage">
  <div><h2 class="h2">60 postazioni per formattare e testare.</h2><p class="muted" style="margin-top:16px;max-width:46ch">Per i rinnovi grandi lavoriamo in parallelo: cancellazione, test, etichetta e riscontro al cliente ogni giorno.</p><p style="margin-top:22px"><a class="btn ghost" href="${href('aziende/stage')}">Lo stage</a></p></div>
  ${postazioni()}
</div></section>`);

// ======================= AZIENDE =======================
P2('aziende', 'Per le aziende', 'Servizi di Messina Corporation per le aziende: ritiro, cancellazione certificata dei dati, valutazione dei lotti, stage di formattazione.',
  intest([[null, 'Aziende']], 'Per le aziende', 'Un solo fornitore per tutto il fine vita dei dispositivi aziendali: dal ritiro al rapporto di cancellazione, fino al valore di quello che si può rivendere.') +
  sezione('', '', righe(AZIENDE.map((a) => ({ ...a, vai: 'Apri ' + a.t.toLowerCase() })))) +
  sezione('Quali dispositivi.', 'Lavoriamo soprattutto con i grandi marchi aziendali, di cui conosciamo modelli, test e ricambi.', `<div class="settori-strip">${['Portatili', 'PC fissi', 'Telefoni', 'Tablet', 'Monitor', 'Lenovo', 'HP', 'Dell', 'Apple'].map((s) => `<span>${s}</span>`).join('')}</div>`, '', 'padding-top:0'));

P2('aziende/ritiro', 'Ritiro dei dispositivi', 'Ritiro di PC, telefoni e monitor aziendali dismessi con i mezzi di Messina Autotrasporti, inventario per seriale al ritiro.',
  intest([['aziende', 'Aziende'], [null, 'Ritiro']], 'Ritiro dei dispositivi', 'Passiamo noi, con i mezzi di Messina Autotrasporti. Dal momento del ritiro ogni dispositivo è registrato e non si perde di vista.') +
  sezione('Come funziona.', '', passi([['Elenco', 'Ci mandate cosa ritirare e dove.'], ['Data', 'Concordiamo giorno e sedi.'], ['Ritiro', 'Imballo e carico con i nostri autisti.'], ['Ingresso', 'Ogni pezzo registrato per seriale a Lacchiarella.'], ['Riscontro', 'Vi mandiamo l\'elenco di quello che è arrivato.']])) +
  sezione('Perché conta.', '', righe([
    { t: 'Catena di custodia', tag: 'Tracciata', p: 'Dal vostro ufficio al nostro magazzino il dispositivo passa solo da persone e mezzi nostri, ogni passaggio è registrato.' },
    { t: 'Confronto con il vostro elenco', tag: 'Seriale per seriale', p: 'Se manca qualcosa o arriva qualcosa in più, ve lo segnaliamo subito, prima di qualsiasi lavorazione.' },
    { t: 'Smaltimento in regola', tag: 'RAEE', p: 'I dispositivi non recuperabili vanno a impianti autorizzati per il riciclo, con i documenti previsti dalla legge.' },
  ]), '', 'padding-top:0'));

P2('aziende/cancellazione-dati', 'Cancellazione certificata dei dati', 'Cancellazione dei dati con software certificato, rapporto per ogni numero di serie, interruzioni documentate.',
  intest([['aziende', 'Aziende'], [null, 'Cancellazione dei dati']], 'Cancellazione certificata dei dati', 'Un PC dismesso con i dati dentro è un rischio per la vostra azienda. Noi lo chiudiamo con un documento per ogni dispositivo.') +
  `<section><div class="wrap stage"><div><h2 class="h2">Un rapporto per ogni seriale.</h2><p class="muted" style="margin-top:16px;max-width:46ch">La cancellazione si fa con software certificato (Certus), che sovrascrive tutto il disco e verifica il risultato. Per ogni dispositivo esce un rapporto con seriale, modello, disco, metodo, data ed esito.</p></div>${pc()}</div></section>` +
  sezione('Cosa ricevete.', '', righe([
    { t: 'Rapporto di cancellazione', tag: 'PDF per seriale', p: 'Il documento da conservare per dimostrare che i dati sono stati distrutti, come richiede il GDPR.' },
    { t: 'Elenco delle interruzioni', tag: 'Nessuna sorpresa', p: 'Se una cancellazione si interrompe (per esempio per un calo di corrente) ve lo segnaliamo e la ripetiamo: nessun dispositivo esce senza esito positivo.' },
    { t: 'Dischi non cancellabili', tag: 'Distruzione', p: 'I dischi guasti che non si possono sovrascrivere non vengono rivenduti: vengono distrutti [modalità da confermare].' },
    { t: 'Accordo sul trattamento dei dati', tag: 'Art. 28 GDPR', p: 'Su richiesta firmiamo la nomina a responsabile del trattamento, così il passaggio dei dispositivi è in regola anche sulla carta.' },
  ]), '', 'padding-top:0') +
  sezione('Domande frequenti.', '', faq([
    ['Che metodo usate?', 'Sovrascrittura completa del disco con software certificato e verifica finale. Il metodo usato è scritto nel rapporto di ogni dispositivo.'],
    ['Posso avere i rapporti anche di dispositivi che non vendete?', 'Sì: il rapporto lo ricevete per tutti i dispositivi lavorati, indipendentemente da cosa succede dopo.'],
    ['Lavorate anche i telefoni?', 'Sì: ripristino, uscita dagli account aziendali e verifica, con lo stesso rendiconto per IMEI.'],
  ]), '', 'padding-top:0'));

P2('aziende/valutazione-lotti', 'Valutazione dei lotti', 'Valutazione e acquisto di lotti di dispositivi aziendali usati: offerta scritta, ritiro, pagamento.',
  intest([['aziende', 'Aziende'], [null, 'Valutazione dei lotti']], 'Valutazione dei lotti', 'I dispositivi aziendali di pochi anni hanno ancora valore. Ve lo riconosciamo con un\'offerta scritta.') +
  sezione('Come valutiamo.', '', passi([['Elenco', 'Modelli, quantità, anni e stato.'], ['Offerta', 'Un prezzo per il lotto, per iscritto.'], ['Ritiro', 'Con i nostri mezzi, quando volete.'], ['Verifica', 'Controllo dei seriali con il vostro elenco.'], ['Pagamento', 'Secondo l\'accordo, con fattura.']])) +
  sezione('Cosa fa salire il valore.', '', righe([
    { t: 'Modelli aziendali recenti', p: 'Lenovo ThinkPad, HP EliteBook, Dell Latitude e MacBook degli ultimi anni hanno mercato.' },
    { t: 'Accessori e alimentatori', p: 'Un portatile con il suo alimentatore vale di più e si vende prima.' },
    { t: 'Nessun blocco', p: 'Dispositivi senza password del BIOS e fuori dagli account aziendali (per esempio Apple ID o gestione remota) si possono riusare subito.' },
  ]), '', 'padding-top:0') +
  `<section style="padding-top:0"><div class="wrap"><div class="banda"><div><h2>Partecipate a gare o aste?</h2><p>Partecipiamo anche ai bandi per l'acquisto di lotti di dispositivi dismessi. Mandateci l'invito.</p></div><a class="btn" href="${href('valuta')}">Valuta un lotto</a></div></div></section>`);

P2('aziende/stage', 'Stage di formattazione', 'Stage da 60 postazioni in rete per formattare e testare PC e telefoni aziendali in grandi quantità.',
  intest([['aziende', 'Aziende'], [null, 'Stage']], 'Stage di formattazione', 'Sessanta postazioni cablate in rete, a Lacchiarella, per lavorare in parallelo grandi quantità di PC e telefoni.') +
  `<section><div class="wrap stage"><div><h2 class="h2">Banchi pronti, riscontro ogni giorno.</h2><p class="muted" style="margin-top:16px;max-width:46ch">Lavoriamo per fornitori IT e aziende: ricevimento, cancellazione, test hardware, catalogazione e deposito. Ogni giorno mandiamo al cliente il riepilogo di quello che è stato lavorato.</p></div>${postazioni()}</div></section>` +
  sezione('Cosa facciamo sui banchi.', '', righe([
    { t: 'PC e portatili', tag: 'Certus', p: 'Cancellazione certificata, test dei componenti, rilevazione di modello, memoria e disco, grado estetico.' },
    { t: 'Telefoni', tag: 'IMEI', p: 'Ripristino, uscita dagli account aziendali, verifica e catalogazione per IMEI.' },
    { t: 'Rendiconto', tag: 'Ogni giorno', p: 'File con seriali, esiti e interruzioni, nel formato del vostro sistema.' },
  ]), '', 'padding-top:0'));

// ======================= ACQUISTI =======================
P2('gradi', 'Gradi', 'Come assegniamo il grado A, B o C ai dispositivi usati di Messina Corporation e cosa controlliamo su ognuno.',
  intest([[null, 'Gradi']], 'Gradi', 'Il grado dice com\'è fuori. Dentro, tutti i dispositivi hanno superato gli stessi controlli.') +
  sezione('', '', gradi()) +
  sezione('Cosa controlliamo su ogni dispositivo.', 'Sono dispositivi usati, non ricondizionati: non montiamo pezzi presi da altri computer.', `<div class="tabella glass"><table><thead><tr><th>Controllo</th><th>Cosa verifichiamo</th></tr></thead><tbody>
    <tr><td>Dati</td><td>Cancellazione certificata, con rapporto</td></tr>
    <tr><td>Batteria</td><td>Capacità residua, scritta nella scheda del prodotto</td></tr>
    <tr><td>Schermo</td><td>Pixel, macchie, luminosità</td></tr>
    <tr><td>Tastiera e touchpad</td><td>Ogni tasto e il clic</td></tr>
    <tr><td>Porte e rete</td><td>USB, video, audio, wifi, Bluetooth</td></tr>
    <tr><td>Avvio</td><td>Nessuna password di BIOS né blocchi aziendali</td></tr>
  </tbody></table></div>`, '', 'padding-top:0'));

P2('dove-comprare', 'Dove comprare', 'Dove comprare i dispositivi usati di Messina Corporation: il nostro negozio e i marketplace.',
  intest([[null, 'Dove comprare']], 'Dove comprare', 'Il modo più diretto è il nostro negozio. Vendiamo anche sui principali marketplace, con gli stessi gradi e la stessa garanzia.') +
  `<section style="padding-top:0"><div class="wrap"><div class="compra"><div><h2>Il nostro negozio.</h2><p>Tutto l'inventario, un prezzo per ogni grado, spedizione con Messina Autotrasporti.</p><p style="margin-top:24px"><a class="btn" href="#" data-link="negozioUrl">Vai al negozio</a></p></div><div class="anche"><b>Ritiro di persona</b>Su appuntamento a Lacchiarella.</div></div></div></section>` +
  sezione('Sui marketplace.', '', `<div class="uffici">${MARKET.map(([n, u]) => `<a class="glass" href="${u}" target="_blank" rel="noopener"><b>${n}</b><span class="muted">Cercate «Messina Corporation»</span></a>`).join('')}</div>`, '', 'padding-top:0'));

P2('garanzia', 'Garanzia e resi', 'Garanzia, diritto di recesso e resi sui dispositivi usati acquistati da Messina Corporation.',
  intest([[null, 'Garanzia e resi']], 'Garanzia e resi', 'Regole semplici, scritte prima dell\'acquisto.') +
  sezione('', '', faq([
    ['Quanto dura la garanzia?', 'Sui dispositivi usati la garanzia legale per i consumatori è di 12 mesi dalla consegna [durata da confermare: per l\'usato la legge consente da 12 a 24 mesi, se indicato nel contratto].'],
    ['Posso restituire un dispositivo?', 'Sì: se comprate online come privati avete 14 giorni dalla consegna per ripensarci, senza dover dare spiegazioni. Il dispositivo va restituito completo e nelle stesse condizioni.'],
    ['Come apro una richiesta?', `Scrivete a ${MAIL('assistenza')} con numero d'ordine e descrizione del problema. Vi rispondiamo con le istruzioni per la spedizione.`],
    ['Chi paga la spedizione del reso?', '[Da definire: di solito il cliente in caso di ripensamento, noi in caso di difetto.]'],
  ])));

// ======================= AZIENDA =======================
P2('azienda', 'Chi siamo', 'Messina Corporation nasce nel 2023 dalla famiglia di Messina Autotrasporti per dare una seconda vita ai dispositivi aziendali.',
  intest([[null, 'Chi siamo']], 'Una seconda vita per i dispositivi aziendali.', 'Messina Corporation nasce nel 2023, a Lacchiarella, dalla stessa famiglia di Messina Autotrasporti.') +
  sezione('Da dove veniamo.', '', `<div class="prosa"><p>Per anni Messina Autotrasporti ha formattato e ridistribuito computer aziendali per conto di grandi fornitori IT. Da quel lavoro è nata un'idea semplice: molti di quei dispositivi funzionano ancora bene, e buttarli è uno spreco.</p><p>Messina Corporation li ritira, ne cancella i dati in modo certificato e li rimette in vendita. Ogni anno nel mondo si producono circa 62 milioni di tonnellate di rifiuti elettronici e meno di un quarto viene riciclato in modo documentato (<a href="https://ewastemonitor.info" target="_blank" rel="noopener">Global E-waste Monitor 2024</a>): ogni portatile che torna a essere usato è uno in meno in quel conto.</p></div>`) +
  sezione('Lo stesso polo, due società.', '', righe([
    { t: 'Messina Autotrasporti', tag: 'Dal 2000', p: 'Ritiri e consegne con mezzi propri, magazzino e logistica IT.', },
    { t: 'Messina Corporation', tag: 'Dal 2023', p: 'Cancellazione dei dati, valutazione e vendita dei dispositivi usati.' },
  ]) + `<p style="margin-top:22px"><a class="btn ghost" href="#" data-link="trasportiUrl">Messina Autotrasporti</a></p>`, '', 'padding-top:0'));

// ======================= SUPPORTO =======================
P2('valuta', 'Valuta un lotto', 'Richiesta di valutazione di un lotto di dispositivi aziendali dismessi.',
  intest([[null, 'Valuta un lotto']], 'Valuta un lotto', 'Diteci cosa avete e quanti pezzi sono. Vi rispondiamo con una proposta per ritiro, cancellazione e valore.') +
  `<section id="modulo" style="padding-top:0"><div class="wrap prev"><div>${recapiti(sito)}<p class="muted" style="margin-top:24px;max-width:36ch">Se avete un elenco con seriali e modelli, scriveteci che ce l'avete: ve lo chiediamo per mail.</p></div>
    ${modulo('corporation', 'lotto', chips('Dispositivi', 'Cosa avete', ['Portatili', 'Fissi', 'Telefoni', 'Tablet', 'Monitor']) + scelta('Quantità', 'Quanti pezzi', ['Meno di 20', 'Da 20 a 100', 'Da 100 a 500', 'Più di 500']) + dett('Dove', 'Dove sono', 'placeholder="Città" maxlength="120"') + chips('Servizi', 'Vi serve anche', ['Ritiro', 'Rapporto di cancellazione', 'Nomina GDPR']), 'Valuta il lotto', 'Marchi, modelli, anni, stato, quando possiamo passare')}
  </div></section>`);

P2('contatti', 'Contatti', 'Contatti di Messina Corporation: sede di Lacchiarella, telefono, email.',
  intest([[null, 'Contatti']], 'Contatti', 'Per aziende, acquirenti e fornitori.') +
  sezione('', '', `<div class="uffici">${[['Aziende e lotti', MAIL('lotti'), 'Ritiri, cancellazione, valutazioni'], ['Vendite', MAIL('vendite'), 'Disponibilità e ordini'], ['Assistenza', MAIL('assistenza'), 'Garanzia e resi'], ['Telefono', TEL, 'Dal lunedì al venerdì, [orari]']].map(([t, v, s]) => `<div class="glass"><b>${t}</b>${v}<span class="muted">${s}</span></div>`).join('')}</div>`) +
  `<section id="modulo" style="padding-top:0"><div class="wrap prev"><div><h2>Scriveteci.</h2>${recapiti(sito)}</div>${modulo('corporation', 'contatto', scelta('Argomento', 'Argomento', ['Aziende', 'Acquisto', 'Garanzia', 'Fornitori', 'Altro'], true), 'Invia il messaggio', 'Scrivete qui la vostra richiesta')}</div></section>`);

P2('domande', 'Domande frequenti', 'Domande frequenti su cancellazione dei dati, lotti, gradi, garanzia e spedizioni.',
  intest([[null, 'Domande']], 'Domande frequenti', '') +
  sezione('Per le aziende', '', faq([
    ['I dati sono davvero irrecuperabili?', `Sì: il disco viene sovrascritto per intero e verificato, e ricevete un rapporto per ogni seriale. Vedete <a href="${href('aziende/cancellazione-dati')}">Cancellazione dei dati</a>.`],
    ['Ritirate anche pochi pezzi?', 'Sì, valutiamo anche lotti piccoli: per pochi pezzi conviene portarli a Lacchiarella o unirli a un ritiro già in programma.'],
    ['Pagate i dispositivi?', 'Quelli che hanno un mercato sì, con un\'offerta scritta per il lotto. Quelli senza valore li smaltiamo in regola.'],
  ])) +
  sezione('Per chi compra', '', faq([
    ['Sono ricondizionati?', 'No: sono dispositivi usati, testati e puliti, senza pezzi presi da altri computer.'],
    ['Cosa c\'è nella confezione?', 'Il dispositivo e, salvo diversa indicazione nella scheda, l\'alimentatore.'],
    ['Come spedite?', 'Con Messina Autotrasporti o con corriere espresso, imballato e assicurato.'],
    ['Fate fattura?', 'Sì, anche ad aziende e professionisti.'],
  ]), '', 'padding-top:0'));

// ======================= LEGALE =======================
const legale = (path, titolo, corpo) => P2(path, titolo, titolo + ' di Messina Corporation.', intest([[null, titolo]], titolo, '') + `<section style="padding-top:0"><div class="wrap prosa">${bozza()}${corpo}</div></section>`);
legale('condizioni', 'Condizioni di vendita', `
  <h2>Prodotti</h2><p>Messina Corporation vende dispositivi elettronici usati, descritti con grado estetico (A, B, C), caratteristiche tecniche e foto.</p>
  <h2>Garanzia</h2><p>Per i consumatori vale la garanzia legale di conformità prevista dal Codice del consumo; per i beni usati la durata concordata è di 12 mesi dalla consegna [da confermare].</p>
  <h2>Recesso</h2><p>Il consumatore che acquista online può recedere entro 14 giorni dalla consegna, restituendo il prodotto completo.</p>
  <h2>Spedizione</h2><p>Tempi e costi sono indicati prima del pagamento.</p>`);
legale('privacy', 'Privacy', `
  <h2>Titolare</h2><p>Messina Corporation S.r.l., Via Cascina Nuova 1, 20084 Lacchiarella (MI), P.IVA 12767280964.</p>
  <h2>Quali dati e perché</h2><p>I dati dei moduli servono solo a rispondervi e a preparare un'offerta (art. 6.1.b GDPR). I dati degli ordini servono a eseguire la vendita e agli obblighi fiscali.</p>
  <h2>Per quanto tempo</h2><p>Fino a 24 mesi dall'ultima comunicazione; i dati di fatturazione per 10 anni, come prevede la legge.</p>
  <h2>I vostri diritti</h2><p>Accesso, correzione, cancellazione e opposizione scrivendo a ${MAIL('info')}. Potete rivolgervi al Garante per la protezione dei dati personali.</p>`);
legale('cookie', 'Cookie', `<p>Questo sito non usa cookie di profilazione né strumenti di statistica di terze parti. Il negozio online usa solo i cookie tecnici necessari al carrello e al pagamento.</p>`);
legale('note-legali', 'Note legali', dati([['Ragione sociale', 'Messina Corporation S.r.l.'], ['Sede legale', 'Via Cascina Nuova 1, 20084 Lacchiarella (MI)'], ['Partita IVA', '12767280964'], ['REA', '[da inserire]'], ['PEC', '[da inserire]']]));

export default sito;
