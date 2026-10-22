// Dati di PROVA (finti) per vedere tutte le schermate senza Supabase.
// Sono gli stessi esempi del mockup approvato, messi nella forma delle tabelle vere.
import { motoreProva, type Tabelle, type Relazioni, type RpcProva, type FunzioniProva, type RegoleProva, type FiltriProva } from './index';

const ora = (h: number, m = 0, giorni = 0) => { const d = new Date(); d.setDate(d.getDate() - giorni); d.setHours(h, m, 0, 0); return d.toISOString(); };
const oreFa = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
const g = (n = 0) => { const d = new Date(); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const id = (p: string, n: number) => `${p}-${String(n).padStart(4, '0')}`;

export const UTENTI_PROVA: Record<string, string> = {
  'direzione@prova.messina': 'u-dir', 'amministrazione@prova.messina': 'u-amm', 'bolle@prova.messina': 'u-bol',
  'traffico@prova.messina': 'u-tra', 'magazzino@prova.messina': 'u-mag', 'autista@prova.messina': 'u-aut',
  'commerciale@prova.messina': 'u-com', 'studio@prova.messina': 'u-cms', 'vendite@prova.messina': 'u-ven', 'stage@prova.messina': 'u-sta', 'snam@prova.messina': 'u-snam', 'econocom@prova.messina': 'u-eco',
};
export const ELENCO_PROVA: { email: string; nome: string; dove: string }[] = [
  { email: 'direzione@prova.messina', nome: 'Direzione', dove: 'Autotrasporti' },
  { email: 'amministrazione@prova.messina', nome: 'Angela', dove: 'Amministrazione' },
  { email: 'bolle@prova.messina', nome: 'Gabriele', dove: 'Ufficio bolle' },
  { email: 'traffico@prova.messina', nome: 'Mauro', dove: 'Traffico' },
  { email: 'commerciale@prova.messina', nome: 'Gianluca', dove: 'Commerciale' },
  { email: 'studio@prova.messina', nome: 'Commercialista', dove: 'Studio' },
  { email: 'magazzino@prova.messina', nome: 'Magazziniere 1', dove: 'Magazzino' },
  { email: 'autista@prova.messina', nome: 'Autista 1', dove: 'Autisti' },
  { email: 'vendite@prova.messina', nome: 'Vendite', dove: 'Corporation' },
  { email: 'stage@prova.messina', nome: 'Manuel', dove: 'Stage' },
  { email: 'snam@prova.messina', nome: 'Snam', dove: 'Cliente' },
  { email: 'econocom@prova.messina', nome: 'Econocom', dove: 'Cliente' },
];

function dati(): Tabelle {
  const t: Tabelle = {};
  t.profili = [
    { id: 'u-dir', azienda: 'trasporti', ruolo: 'direzione', nome: 'Direzione', cliente_id: null },
    { id: 'u-amm', azienda: 'trasporti', ruolo: 'amministrazione', nome: 'Angela', cliente_id: null },
    { id: 'u-bol', azienda: 'trasporti', ruolo: 'bolle', nome: 'Gabriele', cliente_id: null },
    { id: 'u-tra', azienda: 'trasporti', ruolo: 'traffico', nome: 'Mauro', cliente_id: null },
    { id: 'u-com', azienda: 'trasporti', ruolo: 'commerciale', nome: 'Gianluca', cliente_id: null },
    { id: 'u-cms', azienda: 'trasporti', ruolo: 'commercialista', nome: 'Commercialista', cliente_id: null },
    { id: 'u-mag', azienda: 'trasporti', ruolo: 'magazzino', nome: 'Magazziniere 1', cliente_id: null },
    { id: 'u-aut', azienda: 'trasporti', ruolo: 'autista', nome: 'Autista 1', cliente_id: null },
    { id: 'u-ven', azienda: 'corporation', ruolo: 'vendite', nome: 'Vendite', cliente_id: null },
    { id: 'u-sta', azienda: 'corporation', ruolo: 'stage', nome: 'Manuel', cliente_id: null },
    { id: 'u-snam', azienda: 'trasporti', ruolo: 'cliente', nome: 'Referente Snam', cliente_id: 'c-snam' },
    { id: 'u-eco', azienda: 'trasporti', ruolo: 'cliente', nome: 'Referente Econocom', cliente_id: 'c-eco' },
  ];
  t.clienti = [
    { id: 'c-snam', nome: 'Snam', portale_live: true, tramite: null, azienda_collegata: null, cosa_spedisce: 'Bancali di materiale tecnico', referente_interno: 'Gabriele', contratto_al: g(300), fatturazione: 'Mensile', esigenze: 'Vede il magazzino in tempo reale con i seriali; consegna entro le 12.', eccezioni: null },
    { id: 'c-apple', nome: 'Apple', portale_live: false, tramite: null, azienda_collegata: null, cosa_spedisce: 'Colli per i negozi del Nord', referente_interno: 'Alberto', contratto_al: g(200), fatturazione: 'Mensile', esigenze: 'Consegne con fascia oraria; sabato su richiesta.', eccezioni: null },
    { id: 'c-lux', nome: 'Luxiona', portale_live: false, tramite: null, azienda_collegata: null, cosa_spedisce: 'Ordini di magazzino', referente_interno: 'Anna', contratto_al: g(150), fatturazione: 'Mensile', esigenze: 'Ordini giornalieri per mail.', eccezioni: null },
    { id: 'c-eco', nome: 'Econocom', portale_live: true, tramite: null, azienda_collegata: null, cosa_spedisce: 'PC e telefoni aziendali', referente_interno: 'Pier', contratto_al: g(365), fatturazione: 'Mensile', esigenze: 'Tutti i seriali visibili a ogni sparo, carico e scarico.', eccezioni: null },
    { id: 'c-uni', nome: 'UniCredit', portale_live: true, tramite: 'c-eco', azienda_collegata: null, cosa_spedisce: 'Telefoni per i dipendenti', referente_interno: 'Pier', contratto_al: g(365), fatturazione: 'Tramite Econocom', esigenze: 'Doppio cespite e busta di reso.', eccezioni: null },
    { id: 'c-corp', nome: 'Messina Corporation', portale_live: false, tramite: null, azienda_collegata: 'corporation', cosa_spedisce: 'PC usati', referente_interno: 'Matteo', contratto_al: null, fatturazione: '—', esigenze: 'Società del gruppo.', eccezioni: null },
    { id: 'c-vel', nome: 'Velier', portale_live: false, tramite: null, azienda_collegata: null, cosa_spedisce: 'Bevande', referente_interno: 'Christian', contratto_al: g(90), fatturazione: 'A spedizione', esigenze: 'Consegna in cantina.', eccezioni: null },
    { id: 'c-acc', nome: 'Accenture', portale_live: false, tramite: null, azienda_collegata: null, cosa_spedisce: 'Telefoni da lavorare', referente_interno: 'Manuel', contratto_al: null, fatturazione: 'Mensile', esigenze: 'Ticket sul loro portale.', eccezioni: null },
  ];
  const tar = (c: string, voce: string, unita: string, prezzo: number, quando: string | null = null) => ({ id: crypto.randomUUID(), cliente_id: c, voce, unita, prezzo, zona: null, quando, valida_dal: g(-200), valida_al: null, stato: 'Attiva', minimo: null, scaglione_su: null, scaglione_da: null, scaglione_a: null });
  t.tariffe = [
    tar('c-snam', 'Base', 'spedizione', 85), tar('c-snam', 'Sponda', 'spedizione', 18, 'Dalla bolla o aggiunta dall’autista'),
    tar('c-snam', 'Giacenza', 'giorno', 5, 'La merce non consegnata resta in deposito'), tar('c-snam', 'Riconsegna', 'spedizione', 85, 'Nuova consegna dopo la giacenza'),
    tar('c-apple', 'Base', 'collo', 9), tar('c-apple', 'Sabato', 'spedizione', 40, 'Consegne di sabato'),
    tar('c-lux', 'Base', 'bancale', 35), tar('c-lux', 'Attesa', 'ora', 30, 'Oltre 30 minuti allo scarico'),
    tar('c-eco', 'Base', 'spedizione', 9), tar('c-eco', 'Entrata merce', 'pezzo', 0.22, 'A ogni device sparato in entrata'),
  ];
  t.dipendenti = [
    { id: 'd-a1', azienda: 'trasporti', nome: 'Autista 1', mansione: 'Autista', reparto: 'Strada', ore_settimana: 39, inizio: '06:00', fine: '15:00', patente_scadenza: g(400), cqc_scadenza: g(400), profilo_id: 'u-aut', contratto: 'CCNL Logistica' },
    { id: 'd-a2', azienda: 'trasporti', nome: 'Autista 2', mansione: 'Autista', reparto: 'Strada', ore_settimana: 39, inizio: '06:00', fine: '15:00', patente_scadenza: g(700), cqc_scadenza: g(25), profilo_id: null, contratto: 'CCNL Logistica' },
    { id: 'd-a3', azienda: 'trasporti', nome: 'Autista 3', mansione: 'Autista', reparto: 'Strada', ore_settimana: 39, inizio: '05:45', fine: '14:45', patente_scadenza: g(500), cqc_scadenza: g(600), profilo_id: null, contratto: 'CCNL Logistica' },
    { id: 'd-a4', azienda: 'trasporti', nome: 'Autista 4', mansione: 'Autista', reparto: 'Strada', ore_settimana: 39, inizio: '06:00', fine: '15:00', patente_scadenza: g(300), cqc_scadenza: g(300), profilo_id: null, contratto: 'CCNL Logistica' },
    { id: 'd-ch', azienda: 'trasporti', nome: 'Christian', mansione: 'Ufficio bolle', reparto: 'Ufficio bolle', ore_settimana: 40, inizio: '08:00', fine: '17:00', profilo_id: null, contratto: 'CCNL Commercio' },
    { id: 'd-ga', azienda: 'trasporti', nome: 'Gabriele', mansione: 'Ufficio bolle', reparto: 'Ufficio bolle', ore_settimana: 40, inizio: '08:00', fine: '17:00', profilo_id: 'u-bol', contratto: 'CCNL Commercio' },
    { id: 'd-al', azienda: 'trasporti', nome: 'Alberto', mansione: 'Ufficio bolle', reparto: 'Ufficio bolle', ore_settimana: 40, inizio: '08:00', fine: '17:00', profilo_id: null, contratto: 'CCNL Commercio' },
    { id: 'd-ma', azienda: 'trasporti', nome: 'Mauro', mansione: 'Traffico', reparto: 'Traffico', ore_settimana: 40, inizio: '06:00', fine: '15:00', profilo_id: 'u-tra', contratto: 'CCNL Commercio' },
    { id: 'd-an', azienda: 'trasporti', nome: 'Angela', mansione: 'Amministrazione', reparto: 'Amministrazione', ore_settimana: 40, inizio: '08:30', fine: '17:30', profilo_id: 'u-amm', contratto: 'CCNL Commercio' },
    { id: 'd-m1', azienda: 'trasporti', nome: 'Magazziniere 1', mansione: 'Magazzino', reparto: 'Magazzino', ore_settimana: 40, inizio: '06:00', fine: '14:00', profilo_id: 'u-mag', contratto: 'CCNL Logistica' },
    { id: 'd-mn', azienda: 'corporation', nome: 'Manuel', mansione: 'Stage', reparto: 'Stage', ore_settimana: 40, inizio: '08:00', fine: '17:00', profilo_id: 'u-sta', contratto: 'CCNL Commercio' },
  ];
  t.mezzi = [
    { id: 'm1', targa: 'GA001AA', tipo: 'Furgone', sponda: true, autista_id: 'd-a1', telepass: 'TP-01', revisione: g(40), stato: 'Attivo' },
    { id: 'm2', targa: 'GA002BB', tipo: 'Motrice', sponda: true, autista_id: 'd-a2', telepass: 'TP-02', revisione: g(200), stato: 'Attivo' },
    { id: 'm3', targa: 'GA003CC', tipo: 'Bilico', sponda: true, autista_id: 'd-a3', telepass: 'TP-03', revisione: g(12), stato: 'Attivo' },
    { id: 'm4', targa: 'GA004DD', tipo: 'Furgone', sponda: true, autista_id: null, telepass: 'TP-04', revisione: g(90), stato: 'Officina' },
    { id: 'm5', targa: 'GA005EE', tipo: 'Tre assi', sponda: true, autista_id: null, telepass: 'TP-05', revisione: g(150), stato: 'Fermo' },
  ];
  const b = (n: number, c: string, x: Record<string, any>) => ({ id: id('b', n), numero: null, cliente_id: c, tipo: 'Consegna', data_consegna: g(1), fascia: null, destinatario: null,
    indirizzo: 'Via [indirizzo]', citta: null, colli_previsti: 1, accessori: [], dati_mancanti: [], stato: 'Nuova', operatore_id: 'u-bol', creata_il: oreFa(3), note: null, mail_id: null, ...x });
  t.bolle = [
    b(1, 'c-snam', { fascia: 'Entro le 12:00', destinatario: 'Snam', citta: 'Milano', colli_previsti: 4, accessori: ['Sponda'], dati_mancanti: ['Piano di consegna'], creata_il: ora(8, 12), tipo: 'Ritiro' }),
    b(2, 'c-apple', { fascia: '10:00–12:00', destinatario: 'Apple Store', citta: 'Rozzano', colli_previsti: 32, creata_il: ora(8, 5) }),
    b(3, 'c-lux', { fascia: '9:00–13:00', destinatario: 'Luxiona', citta: 'Assago', colli_previsti: 3, accessori: ['Piano terra'], creata_il: ora(7, 58) }),
    b(4, 'c-vel', { data_consegna: g(2), fascia: null, destinatario: '[Cliente]', citta: 'Torino', colli_previsti: 2, creata_il: ora(7, 41) }),
    b(5, 'c-vel', { data_consegna: g(5), fascia: null, destinatario: '[Cliente]', indirizzo: null, colli_previsti: 1, accessori: ['Sabato'], dati_mancanti: ['Indirizzo', 'Fascia oraria'], creata_il: ora(7, 30) }),
    b(6, 'c-snam', { numero: '26-000038', data_consegna: g(0), fascia: 'Entro le 12', destinatario: 'Snam', citta: 'Milano', colli_previsti: 4, accessori: ['Sponda'], stato: 'In giro' }),
    b(7, 'c-lux', { numero: '26-000039', data_consegna: g(0), fascia: '9–13', destinatario: 'Luxiona', citta: 'Assago', colli_previsti: 3, accessori: ['Piano terra'], stato: 'In giro' }),
    b(8, 'c-apple', { numero: '26-000040', data_consegna: g(0), fascia: '10–12', destinatario: 'Apple', citta: 'Rozzano', colli_previsti: 12, stato: 'In giro' }),
    b(9, 'c-vel', { numero: '26-000041', data_consegna: g(0), fascia: '14–17', destinatario: '[Cliente]', citta: 'Opera', colli_previsti: 1, stato: 'In giro' }),
    b(10, 'c-apple', { numero: '26-000042', data_consegna: g(0), fascia: '15–18', destinatario: 'Apple', citta: 'Pieve Emanuele', colli_previsti: 8, accessori: ['Sponda'], stato: 'In giro' }),
    b(11, 'c-apple', { numero: '26-000035', tipo: 'Magazzino', data_consegna: g(0), destinatario: 'Messina', citta: 'Lacchiarella', colli_previsti: 32, stato: 'Confermata' }),
    b(12, 'c-apple', { numero: '26-000030', data_consegna: g(-3), destinatario: 'Apple', citta: 'Rozzano', colli_previsti: 2, stato: 'Giacenza' }),
    b(13, 'c-snam', { numero: '26-000031', data_consegna: g(-4), destinatario: 'Snam', citta: 'Milano', colli_previsti: 1, stato: 'Giacenza' }),
    b(14, 'c-apple', { numero: '26-000043', data_consegna: g(1), fascia: '10–12', destinatario: 'Apple', citta: 'Rho', colli_previsti: 6, stato: 'Confermata' }),
    b(15, 'c-apple', { numero: '26-000044', data_consegna: g(1), fascia: '14–17', destinatario: 'Apple', citta: 'Pero', colli_previsti: 4, stato: 'Confermata' }),
    b(16, 'c-lux', { numero: '26-000045', data_consegna: g(1), fascia: '9–13', destinatario: 'Luxiona', citta: 'Assago', colli_previsti: 3, accessori: ['Piano terra'], stato: 'Confermata' }),
    b(17, 'c-vel', { numero: '26-000046', data_consegna: g(1), destinatario: '[Cliente]', citta: 'Opera', colli_previsti: 1, accessori: ['Sabato'], stato: 'Confermata' }),
  ];
  t.colli = [];
  for (const bb of t.bolle) for (let k = 1; k <= bb.colli_previsti; k++)
    t.colli.push({ id: crypto.randomUUID(), bolla_id: bb.id, codice: `C${bb.id.slice(-2)}-${String(k).padStart(3, '0')}`,
      letto_entrata: bb.tipo === 'Magazzino' && k < 32 ? oreFa(2) : null, letto_carico: bb.stato === 'In giro' ? oreFa(3) : null, letto_consegna: null });
  // i giri di oggi li ha confermati il traffico ieri pomeriggio
  const ieri16 = (() => { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(16, 10, 0, 0); return d.toISOString(); })();
  t.giri = [{ id: 'giro1', data: g(0), mezzo_id: 'm1', autista_id: 'd-a1', zona: 'Milano Sud', stato: 'Partito', confermato_il: ieri16, confermato_da: 'u-tra', da_confermare: [] }];
  t.fermate = ['b-0006', 'b-0007', 'b-0008', 'b-0009', 'b-0010'].map((bid, i) => ({ id: id('f', i + 1), giro_id: 'giro1', bolla_id: bid, ordine: i + 1, esito: 'Da fare', motivo: null, dopo: null, firmata: false, foto_bolla: null, nitidezza: null, chiusa_il: null }));
  t.accessori_extra = [];
  t.giacenze = [
    { id: 'gi1', bolla_id: 'b-0012', motivo: 'Destinatario assente', dal: g(-3), riconsegna_il: null, chiusa_il: null },
    { id: 'gi2', bolla_id: 'b-0013', motivo: 'Chiuso o fuori orario', dal: g(-4), riconsegna_il: null, chiusa_il: null },
  ];
  // le fatture del mese le prepara «Chiudi mese» dalle bolle consegnate: qui solo quelle del mese scorso, già inviate
  t.fatture = [
    { id: 'fa1', azienda: 'trasporti', tipo: 'Fattura', cliente_id: 'c-apple', periodo: g(-35).slice(0, 7), imponibile: 1240, iva: 272.8, totale: 1512.8, split_payment: false, stato: 'Pagata', problema: null,
      numero: 'FT 2026/112', data: g(-10), creata_il: oreFa(260), inviata_il: oreFa(250), pagata_il: g(-2), sdi_esito: 'Consegnata', fic_id: 'FIC-311208', sdi_inviata_il: oreFa(250) },
    { id: 'fa3', azienda: 'trasporti', tipo: 'Fattura', cliente_id: 'c-lux', periodo: g(-35).slice(0, 7), imponibile: 480, iva: 105.6, totale: 585.6, split_payment: false, stato: 'Inviata', problema: null,
      numero: 'FT 2026/113', data: g(-10), creata_il: oreFa(260), inviata_il: oreFa(250), pagata_il: null, sdi_esito: 'Consegnata', fic_id: 'FIC-311209', sdi_inviata_il: oreFa(250) },
  ];
  t.righe_fattura = [
    { id: 'r1', fattura_id: 'fa1', voce: 'Base · consegne', quantita: 120, prezzo: 9, totale: 1080, iva_aliquota: 22, iva_natura: null, margine: false },
    { id: 'r2', fattura_id: 'fa1', voce: 'Sabato · consegne', quantita: 4, prezzo: 40, totale: 160, iva_aliquota: 22, iva_natura: null, margine: false },
    { id: 'r5', fattura_id: 'fa3', voce: 'Base · consegne', quantita: 12, prezzo: 35, totale: 420, iva_aliquota: 22, iva_natura: null, margine: false },
    { id: 'r6', fattura_id: 'fa3', voce: 'Attesa · consegne', quantita: 2, prezzo: 30, totale: 60, iva_aliquota: 22, iva_natura: null, margine: false },
  ];
  t.telepass = [
    { id: 'tp1', mezzo_id: 'm2', quando: ora(7, 12), entrata: 'Milano Sud', uscita: 'Bergamo', importo: 14.2 },
    { id: 'tp2', mezzo_id: 'm2', quando: ora(11, 48), entrata: 'Bergamo', uscita: 'Brescia Ovest', importo: 8.6 },
    { id: 'tp3', mezzo_id: 'm3', quando: ora(16, 35, 2), entrata: 'Milano Sud', uscita: 'Piacenza', importo: 7.9 },
    { id: 'tp4', mezzo_id: 'm3', quando: ora(21, 52, 4), entrata: 'Agrate', uscita: 'Milano Est', importo: 2.7 },
    { id: 'tp5', mezzo_id: 'm1', quando: ora(10, 20, 1), entrata: 'Pavia', uscita: 'Milano Sud', importo: 3.4 },
  ];
  // magazzino
  t.posti = [];
  for (let s = 1; s <= 12; s++) for (let p = 1; p <= 6; p++) for (let n = 1; n <= 3; n++)
    t.posti.push({ id: `p${s}-${p}-${n}`, codice: `S${String(s).padStart(2, '0')}-${p}-${n}`, scaffale: s, piano: p, numero: n, zona: 'Scaffale', attivo: true });
  const SC_CLI = ['c-apple', 'c-snam', 'c-snam', 'c-snam', 'c-lux', 'c-lux', 'c-eco', 'c-eco', 'c-apple', 'c-snam', 'c-corp', 'c-corp'];
  t.bancali = []; t.contenuto = [];
  let nb = 100;
  for (let s = 1; s <= 12; s++) for (let p = 1; p <= 6; p++) for (let n = 1; n <= 3; n++) {
    if ((s * 7 + p * 3 + n) % 4 === 0) continue;  // qualche posto libero
    const bid = `k${s}-${p}-${n}`, cli = SC_CLI[s - 1];
    t.bancali.push({ id: bid, codice: 'B-0' + nb++, cliente_id: cli, posto_id: `p${s}-${p}-${n}`, creato_il: oreFa(24 * ((s + p + n) % 9 + 1)), uscito_il: null });
    const art = { 'c-apple': 'Colli consegne Nord', 'c-snam': 'Bancale materiale con seriali', 'c-lux': 'Bancale ordine magazzino', 'c-eco': 'Notebook aziendali', 'c-corp': 'PC ricondizionati' }[cli]!;
    t.contenuto.push({ id: crypto.randomUUID(), bancale_id: bid, articolo: art, quantita: (s + p + n) % 20 + 4,
      codici: cli === 'c-eco' || cli === 'c-snam' ? [`SN${s}${p}${n}01`, `SN${s}${p}${n}02`] : [], inserito: (s + p) % 11 === 0 ? 'Manuale' : 'Pistola', da: 'u-mag', il: oreFa(20 + s) });
  }
  t.missioni = [{ id: 'mi1', ambito: 'Scaffale', filtro: 'S07', stato: 'Aperta', creata_il: oreFa(5) }];
  t.missioni_posti = t.posti.filter((p) => p.scaffale === 7).map((p, i) => {
    const att = t.contenuto.filter((c) => t.bancali.some((k) => k.id === c.bancale_id && k.posto_id === p.id)).flatMap((c) => c.codici.map((cod: string) => ({ articolo: c.articolo, codice: cod })));
    const stato = i < 4 ? 'Fatto' : i === 4 ? 'Bloccato' : 'Da fare';
    const letti = stato === 'Fatto' ? att.map((a) => a.codice) : stato === 'Bloccato' ? [...att.slice(1).map((a) => a.codice), 'HP9X099'] : [];
    return { id: id('mp', i + 1), missione_id: 'mi1', posto_id: p.id, attesi: att, letti, mancanti: stato === 'Bloccato' ? att.slice(0, 1) : [], extra: stato === 'Bloccato' ? ['HP9X099'] : [], stato, motivo: null, aggiornato_il: oreFa(1.5) };
  });
  t.storico = [
    { id: 9, quando: oreFa(1.5), azienda: 'trasporti', chi_nome: 'Magazziniere 1', operazione: 'Blocco', cosa: 'Mancano 1, in più 1', dove: 'S07-1-2', come: 'Sistema' },
    { id: 8, quando: oreFa(2), azienda: 'trasporti', chi_nome: 'Magazziniere 2', operazione: 'Entrata', cosa: 'Apple · 31 colli su 32', dove: 'RIC', come: 'Pistola' },
    { id: 7, quando: oreFa(3), azienda: 'trasporti', chi_nome: 'Magazziniere 3', operazione: 'Uscita', cosa: 'Snam · 4 bancali sul mezzo GA002BB', dove: 'S03-2-1', come: 'Pistola' },
    { id: 6, quando: oreFa(20), azienda: 'trasporti', chi_nome: 'Magazziniere 2', operazione: 'Modifica', cosa: 'Notebook aziendali · 2 pz (prima 3)', dove: 'S07-2-1', come: 'Manuale' },
    { id: 5, quando: oreFa(22), azienda: 'trasporti', chi_nome: 'Magazziniere 1', operazione: 'Trasferimento', cosa: 'B-0155', dove: 'S05-1-2 → S06-3-1', come: 'Pistola' },
    { id: 4, quando: oreFa(26), azienda: 'trasporti', chi_nome: 'Magazziniere 1', operazione: 'Entrata', cosa: 'Econocom · 1.000 device', dove: 'RIC', come: 'Pistola' },
  ];
  // corporation
  t.lotti = [
    { id: 'l15', codice: 'L-015', fornitore: 'Fornitore A', acquistato_il: g(-20), pezzi: 612, costo: 36700 },
    { id: 'l14', codice: 'L-014', fornitore: 'Fornitore B', acquistato_il: g(-50), pezzi: 480, costo: 28800 },
    { id: 'l13', codice: 'L-013', fornitore: 'Fornitore A', acquistato_il: g(-80), pezzi: 320, costo: 19500 },
  ];
  const dv = (n: number, x: Record<string, any>) => ({ id: id('dv', n), tipo: 'PC', difetti: [], costo: 61, prezzo_minimo: null, prezzo_confermato_da: 'u-ven', foto: [], caricato_il: oreFa(24 * (x.gg ?? 5)), ...x });
  t.device = [
    dv(1, { seriale: 'PF3XXXXX', marca: 'Lenovo', modello: 'ThinkPad T14 Gen 2', cpu: 'i5-1135G7', gpu: 'Intel Iris Xe', ram: '16 GB', disco: '256 GB SSD', schermo: '14"', grado: 'B', difetti: ['Graffi sul coperchio'], lotto_id: 'l14', bancale_id: 'k11-2-1', prezzo: 249, stato: 'Disponibile', siti: ['Back Market', 'Refurbed', 'eBay', 'Subito', 'Sito'], gg: 9 }),
    dv(2, { seriale: '5CGXXXXX', marca: 'HP', modello: 'EliteBook 840 G8', cpu: 'i7-1165G7', gpu: 'Intel Iris Xe', ram: '16 GB', disco: '512 GB SSD', schermo: '14"', grado: 'A', lotto_id: 'l14', bancale_id: 'k11-3-2', prezzo: 329, stato: 'Venduto', siti: ['eBay'], gg: 3 }),
    dv(3, { seriale: 'JXXXXXX', marca: 'Dell', modello: 'Latitude 5420', cpu: 'i5-1145G7', gpu: 'Intel Iris Xe', ram: '8 GB', disco: '256 GB SSD', schermo: '14"', grado: 'C', difetti: ['Ammaccatura', 'Tastiera lucida'], lotto_id: 'l13', bancale_id: 'k12-1-1', prezzo: 179, stato: 'Fermo', siti: ['Back Market', 'eBay', 'Subito'], gg: 64 }),
    dv(4, { seriale: 'C02XXXXX', marca: 'Apple', modello: 'MacBook Air M1', cpu: 'Apple M1', gpu: 'Apple M1 7 core', ram: '8 GB', disco: '256 GB SSD', schermo: '13,3"', grado: 'B', difetti: ['Segni sullo schermo'], lotto_id: 'l15', bancale_id: 'k11-1-3', prezzo: 449, stato: 'Disponibile', siti: ['Back Market', 'Refurbed', 'Sito'], gg: 12 }),
    dv(5, { seriale: 'PF2XXXXX', marca: 'Lenovo', modello: 'ThinkPad X1 Carbon', cpu: 'i7-1185G7', gpu: 'Intel Iris Xe', ram: '16 GB', disco: '512 GB SSD', schermo: '14"', grado: 'A', lotto_id: 'l15', bancale_id: 'k11-2-3', prezzo: 399, stato: 'Disponibile', siti: ['Back Market', 'Refurbed', 'eBay', 'Amazon', 'Sito'], gg: 5 }),
    dv(6, { seriale: '5CDXXXXX', marca: 'HP', modello: 'ProBook 450 G8', cpu: 'i5-1135G7', gpu: 'Intel UHD', ram: '8 GB', disco: '256 GB SSD', schermo: '15,6"', grado: 'B', difetti: ['Batteria sotto 80%'], lotto_id: 'l15', bancale_id: 'k11-1-1', prezzo: 219, stato: 'Reso', siti: [], gg: 1 }),
    dv(7, { seriale: 'PF3XXXX2', marca: 'Lenovo', modello: 'ThinkPad T14 Gen 2', cpu: 'i5-1135G7', gpu: 'Intel Iris Xe', ram: '16 GB', disco: '256 GB SSD', schermo: '14"', grado: 'A', lotto_id: 'l14', bancale_id: 'k11-2-1', prezzo: 289, stato: 'Disponibile', siti: ['Back Market', 'Sito'], gg: 4 }),
    dv(8, { seriale: 'PF3XXXX3', marca: 'Lenovo', modello: 'ThinkPad T14 Gen 2', cpu: 'i5-1135G7', gpu: 'Intel Iris Xe', ram: '16 GB', disco: '256 GB SSD', schermo: '14"', grado: 'C', lotto_id: 'l14', bancale_id: 'k11-2-1', prezzo: 209, stato: 'Disponibile', siti: ['Sito', 'Subito'], gg: 7 }),
  ];
  t.vendite = [
    { id: 've1', device_id: 'dv-0002', canale: 'eBay', prezzo: 329, commissione: 33, incassato: 296, venduto_il: oreFa(2) },
  ];
  t.ordini = [
    { id: 'o1', canale: 'Back Market', riferimento: 'BM-48213', device_id: 'dv-0001', stato: 'Da preparare', creato_il: ora(9, 14), entro: ora(16) },
    { id: 'o2', canale: 'eBay', riferimento: 'EB-99120', device_id: 'dv-0002', stato: 'Da preparare', creato_il: ora(8, 52), entro: ora(16) },
    { id: 'o3', canale: 'Subito', riferimento: 'SU-2210', device_id: 'dv-0003', stato: 'Spedito', creato_il: ora(8, 10), entro: null },
    { id: 'o4', canale: 'Refurbed', riferimento: 'RF-7781', device_id: 'dv-0004', stato: 'Annullato', creato_il: oreFa(26), entro: null },
  ];
  t.stage_pc = Array.from({ length: 60 }, (_, k) => {
    const i = k + 1; const esito = i === 23 || i === 47 ? 'Fallito' : i % 9 === 0 ? 'Ricevuto' : i % 4 === 0 || i % 7 === 0 ? 'In corso' : 'Formattato';
    return { id: id('st', i), seriale: `ST${String(i).padStart(5, '0')}`, cliente_id: 'c-acc', postazione: i, esito, iniziato_il: oreFa(5), finito_il: esito === 'Formattato' || esito === 'Fallito' ? oreFa(1) : null, errore: esito === 'Fallito' ? 'Cancellazione interrotta' : null };
  });
  const tel = (n: number, marca: string, modello: string, ticket: string, r: boolean, s: boolean, tk: boolean, op: string | null) =>
    ({ id: id('tel', n), imei: `35XXXXXXXXXXXX${n}`, marca, modello, cliente_id: 'c-acc', ticket, reset_fatto: r, sblocco_fatto: s, ticket_chiuso: tk, operatore: op,
      stato: !r ? 'Reset' : !s ? 'Sblocco' : !tk ? 'Ticket' : 'Chiuso', ricevuto_il: oreFa(4) });
  t.stage_telefoni = [tel(1, 'Apple', 'iPhone 13', '[n. ticket]', true, true, true, 'u-sta'), tel(2, 'Samsung', 'Galaxy S21', '[n. ticket]', true, false, false, 'u-sta'),
    tel(3, 'Apple', 'iPhone 12', '[n. ticket]', false, false, false, null), tel(4, 'Apple', 'iPhone SE', 'Aperto', true, true, false, 'u-sta'), tel(5, 'Samsung', 'Galaxy A52', '[n. ticket]', true, true, true, 'u-sta')];
  // presenze
  t.badge = [{ id: 'bg1', dipendente_id: 'd-a1', dispositivo: 'iphone-autista-1', attivo: true }];
  t.timbrature = [];
  let tid = 1;
  const timb = (dip: string, h: number, m: number, verso: string, giorni = 0) => t.timbrature.push({ id: tid++, dipendente_id: dip, quando: ora(h, m, giorni), verso, esito: 'Valida', motivo: null, lettore: 'Ingresso' });
  timb('d-ch', 8, 2, 'Entrata'); timb('d-ga', 7, 58, 'Entrata'); timb('d-al', 8, 31, 'Entrata'); timb('d-ma', 6, 0, 'Entrata'); timb('d-an', 8, 30, 'Entrata');
  timb('d-a1', 6, 2, 'Entrata'); timb('d-a2', 6, 15, 'Entrata'); timb('d-a3', 5, 58, 'Entrata'); timb('d-m1', 5, 55, 'Entrata'); timb('d-mn', 8, 4, 'Entrata');
  for (const d of ['d-ch', 'd-ga', 'd-ma', 'd-an', 'd-a2', 'd-mn']) { timb(d, 8, 5, 'Entrata', 1); timb(d, 17, 2, 'Uscita', 1); }
  timb('d-a1', 6, 4, 'Entrata', 1); timb('d-m1', 5, 50, 'Entrata', 1); timb('d-al', 8, 40, 'Entrata', 1);
  t.timbrature.push({ id: tid++, dipendente_id: 'd-al', quando: ora(7, 49), verso: null, esito: 'Rifiutata', motivo: 'Telefono non registrato (iPhone)', lettore: 'Ingresso uffici' });
  t.timbrature.push({ id: tid++, dipendente_id: 'd-ch', quando: ora(18, 3, 2), verso: null, esito: 'Rifiutata', motivo: 'Codice scaduto (foto o screenshot?)', lettore: 'Ingresso magazzino' });
  t.correzioni = []; t.allarmi_gestiti = [];
  t.ferie = t.dipendenti.map((d, i) => ({ dipendente_id: d.id, anno: new Date().getFullYear(), ferie_maturate: 21.7, ferie_godute: [12, 8, 4, 15, 2, 10, 6, 20, 9, 3, 5][i] ?? 5, permessi_spettanti: 72, permessi_usati: [20, 8, 40, 16, 2, 30, 12, 60, 4, 10, 6][i] ?? 8 }));
  // mail
  t.mail = [
    { id: 'ma1', azienda: 'trasporti', casella: 'ordini@', cartella: 'Ordini', etichetta: 'Ordine', da_nome: 'Snam', da_indirizzo: 'logistica@[dominio]', oggetto: 'Ritiro 4 bancali domani', anteprima: 'Domani mattina ritirare 4 bancali…', ricevuta_il: ora(8, 12), allegati: [], stato: 'Da leggere',
      testo: 'Buongiorno,\ndomani mattina ritirare 4 bancali dal nostro magazzino e consegnare in via [indirizzo], Milano, entro le 12. Serve la sponda.\nGrazie', bozza: 'Buongiorno, confermato il ritiro di domani. Ci indicate il piano di consegna?\nGrazie', bolla_id: null },
    { id: 'ma2', azienda: 'trasporti', casella: 'ordini@', cartella: 'Ordini', etichetta: 'Ordine', da_nome: 'Apple', da_indirizzo: 'ordini@[dominio]', oggetto: 'Consegne zona Nord del ' + new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }), anteprima: 'In allegato l’elenco delle 32 consegne…', ricevuta_il: ora(8, 5), allegati: [{ nome: 'consegne.xlsx' }], stato: 'Letta',
      testo: 'Buongiorno,\nin allegato l’elenco delle 32 consegne.\nCordiali saluti', bozza: 'Buongiorno, ricevuto: le consegne sono nei giri.\nGrazie', bolla_id: 'b-0002' },
    { id: 'ma3', azienda: 'trasporti', casella: 'ordini@', cartella: 'Ordini', etichetta: 'Ordine', da_nome: 'Luxiona', da_indirizzo: 'magazzino@[dominio]', oggetto: 'Ordine magazzino', anteprima: 'Vi giriamo l’ordine di oggi…', ricevuta_il: ora(7, 58), allegati: [{ nome: 'ordine_luxiona.pdf' }], stato: 'Letta',
      testo: 'Ciao Anna,\nvi giriamo l’ordine di oggi, 3 bancali.\nGrazie', bozza: 'Ciao, ricevuto, grazie. Anna', bolla_id: 'b-0003' },
    { id: 'ma4', azienda: 'trasporti', casella: 'info@', cartella: 'Clienti', etichetta: 'Preventivo', da_nome: '[Cliente]', da_indirizzo: 'info@[dominio]', oggetto: 'Richiesta preventivo', anteprima: 'Vorremmo un preventivo per…', ricevuta_il: ora(7, 41), allegati: [], stato: 'Da leggere',
      testo: 'Buongiorno,\nvorremmo un preventivo per 10 bancali al mese verso Torino.\nGrazie', bozza: 'Buongiorno, grazie della richiesta. Vi giro a Gianluca che vi preparerà il preventivo.', bolla_id: null },
    { id: 'ma5', azienda: 'trasporti', casella: 'info@', cartella: 'In arrivo', etichetta: 'Mezzi', da_nome: 'Officina [nome]', da_indirizzo: 'officina@[dominio]', oggetto: 'Tagliando motrice', anteprima: 'La motrice è pronta da giovedì…', ricevuta_il: oreFa(20), allegati: [], stato: 'Letta',
      testo: 'Buongiorno,\nla motrice è pronta da giovedì.\nSaluti', bozza: 'Grazie, passiamo giovedì mattina.', bolla_id: null },
    { id: 'mc1', azienda: 'corporation', casella: 'vendite@', cartella: 'Vendite', etichetta: 'Vendite', da_nome: 'Acquirente eBay', da_indirizzo: 'tramite eBay', oggetto: 'Domanda su EliteBook 840 G8', anteprima: 'La batteria com’è messa?…', ricevuta_il: ora(9, 20), allegati: [], stato: 'Da leggere',
      testo: 'Ciao,\nla batteria com’è messa? Riuscite a spedire entro venerdì?', bozza: 'Ciao, la batteria è all’88% dal test. Spediamo entro domani.', bolla_id: null },
    { id: 'mc2', azienda: 'corporation', casella: 'stage@', cartella: 'Stage', etichetta: 'Stage', da_nome: 'Econocom', da_indirizzo: 'referente@[dominio]', oggetto: 'Riscontro giornaliero', anteprima: 'Ci mandate il riepilogo di ieri?…', ricevuta_il: ora(8, 40), allegati: [], stato: 'Letta',
      testo: 'Buongiorno Simone,\nci mandate il riepilogo dei PC lavorati ieri?\nGrazie', bozza: 'Buongiorno, in allegato il riepilogo di ieri: 412 PC formattati, 2 interrotti con il report.', bolla_id: null },
    { id: 'mc3', azienda: 'corporation', casella: 'acquisti@', cartella: 'Lotti', etichetta: 'Lotti', da_nome: '[Fornitore lotto]', da_indirizzo: 'aste@[dominio]', oggetto: 'DDT lotto L-015', anteprima: 'In allegato il DDT di uscita…', ricevuta_il: ora(8, 2), allegati: [{ nome: 'DDT_L-015.pdf' }], stato: 'Letta',
      testo: 'Buongiorno,\nin allegato il DDT di uscita del lotto aggiudicato.\nCordiali saluti', bozza: 'Buongiorno, ricevuto, grazie.', bolla_id: null },
  ];
  t.mail_uscita = [];
  // colonne con un valore predefinito nel database
  t.clienti.forEach((c) => Object.assign(c, { azienda: c.azienda ?? 'trasporti', attivo: true, email: c.email ?? `logistica@${c.nome.toLowerCase().replace(/[^a-z]/g, '')}.example`, piva: c.piva ?? null, contratto_dal: c.contratto_dal ?? g(-300) }));
  t.dipendenti.forEach((d) => Object.assign(d, { attivo: true }));
  t.telepass_controllati = [];
  t.resoconti = [{ id: 'rs1', azienda: 'trasporti', giorno: g(0), creato_il: ora(7), testo: 'Ieri 1.198 consegne, costo medio per consegna in linea con la settimana. Due mezzi della zona Est hanno consumato più gasolio del solito: conviene guardare i loro giri.' },
    { id: 'rs2', azienda: 'corporation', giorno: g(0), creato_il: ora(7), testo: 'Ieri 14 computer venduti, incasso in linea con la settimana. Il lotto L-013 ha recuperato il costo: i Dell grado C fermi da più di 60 giorni conviene abbassarli.' }];
  return t;
}

const REL: Relazioni = {
  bolle: { clienti: 'cliente_id', profili: 'operatore_id', colli: ['bolla_id', 'molti'] },
  fermate: { bolle: 'bolla_id', giri: 'giro_id' },
  giri: { mezzi: 'mezzo_id', dipendenti: 'autista_id', fermate: ['giro_id', 'molti'] },
  mezzi: { dipendenti: 'autista_id' },
  fatture: { clienti: 'cliente_id', righe_fattura: ['fattura_id', 'molti'] },
  bancali: { clienti: 'cliente_id', posti: 'posto_id', contenuto: ['bancale_id', 'molti'] },
  posti: { bancali: ['posto_id', 'molti'] },
  device: { lotti: 'lotto_id', bancali: 'bancale_id' },
  ordini: { device: 'device_id' },
  contenuto: { profili: 'da', bancali: 'bancale_id' },
  storico: {},
  vendite: { device: 'device_id' },
  stage_telefoni: { clienti: 'cliente_id', profili: 'operatore' },
  stage_pc: { clienti: 'cliente_id' },
  timbrature: { dipendenti: 'dipendente_id' },
  ferie: { dipendenti: 'dipendente_id' },
  telepass: { mezzi: 'mezzo_id' },
  missioni_posti: { posti: 'posto_id' },
  profili: { clienti: 'cliente_id' },
  giacenze: { bolle: 'bolla_id' },
};

const gLoc = (iso: string) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };   // giorno italiano (il browser è in Italia)
const oggi = () => gLoc(new Date().toISOString());
const mese = () => oggi().slice(0, 7);

/** le viste del database, ricalcolate in memoria */
function viste(t: Tabelle) {
  const cli = (i: string) => t.clienti.find((c) => c.id === i)?.nome ?? '—';
  const tarCli = (c: string) => t.tariffe.filter((x) => x.cliente_id === c);
  const valore = (b: any) => { const tt = tarCli(b.cliente_id); const base = (tt.find((x) => x.voce === 'Base' && x.unita === 'spedizione')?.prezzo ?? 0) + (tt.find((x) => x.voce === 'Base' && (x.unita === 'collo' || x.unita === 'bancale'))?.prezzo ?? 0) * (b.colli_previsti ?? 0);
    const acc = b.accessori.reduce((s: number, a: string) => s + (tt.find((x) => x.voce === a)?.prezzo ?? 0), 0);
    const extra = t.accessori_extra.filter((a) => t.fermate.some((f) => f.id === a.fermata_id && f.bolla_id === b.id)).reduce((s, a) => s + (tt.find((x) => x.voce === a.voce)?.prezzo ?? 0), 0);
    return base + acc + extra; };
  t.controllo_colli = t.bolle.filter((b) => ['Confermata', 'In giro'].includes(b.stato)).map((b) => {
    const c = t.colli.filter((k) => k.bolla_id === b.id);
    const mag = b.tipo === 'Magazzino' || b.tipo === 'Ritiro';
    const letti = c.filter((k) => mag ? k.letto_entrata : k.letto_carico);
    return { bolla_id: b.id, numero: b.numero, cliente: cli(b.cliente_id), tipo: b.tipo, attesi: b.colli_previsti, letti: letti.length,
      ultima_lettura: letti.map((k) => k.letto_entrata ?? k.letto_carico).sort().pop() ?? null };
  });
  const chiuse = t.bolle.filter((b) => ['Consegnata', 'Giacenza', 'Non consegnata', 'Fatturata'].includes(b.stato));
  t.incassi_trasporti = [{
    fatturato_oggi: chiuse.filter((b) => b.data_consegna === oggi()).reduce((s, b) => s + valore(b), 0),
    fatturato_mese: chiuse.filter((b) => (b.data_consegna ?? '').startsWith(mese())).reduce((s, b) => s + valore(b), 0) + 18240,
    incassato_mese: t.fatture.filter((f) => f.stato === 'Pagata').reduce((s, f) => s + f.imponibile, 0) + 9600,
  }];
  t.incassi_corporation = [{
    incassato_oggi: t.vendite.filter((v) => gLoc(v.venduto_il) === oggi()).reduce((s, v) => s + v.incassato, 0),
    incassato_mese: t.vendite.reduce((s, v) => s + v.incassato, 0) + 14820,
  }];
  t.lotti_conti = t.lotti.map((l) => {
    const dev = t.device.filter((d) => d.lotto_id === l.id).map((d) => d.id);
    const v = t.vendite.filter((x) => dev.includes(x.device_id));
    const extra = { l15: [12, 2202], l14: [131, 20736], l13: [298, 31980] }[l.id as 'l15'] ?? [0, 0];
    const inc = v.reduce((s, x) => s + x.incassato, 0) + extra[1];
    return { ...l, venduti: v.length + extra[0], incassato: inc, recuperato_pct: Math.round(inc / l.costo * 1000) / 10 };
  });
  t.giacenze_aperte = t.giacenze.filter((x) => !x.chiusa_il).map((x) => { const b = t.bolle.find((y) => y.id === x.bolla_id)!;
    return { id: x.id, bolla_id: b.id, numero: b.numero, cliente: cli(b.cliente_id), destinatario: b.destinatario, indirizzo: b.indirizzo, citta: b.citta, motivo: x.motivo, dal: x.dal,
      giorni: Math.round((Date.now() - new Date(x.dal).getTime()) / 86400000), riconsegna_il: x.riconsegna_il }; });
  t.telepass_passaggi = t.telepass.map((p) => { const m = t.mezzi.find((x) => x.id === p.mezzo_id)!; const giro = t.giri.find((x) => x.mezzo_id === m.id && x.data === gLoc(p.quando));
    const aut = t.dipendenti.find((d) => d.id === (giro?.autista_id ?? m.autista_id))?.nome ?? '—'; const h = new Date(p.quando).getHours();
    return { ...p, targa: m.targa, tipo: m.tipo, autista: aut, controllo: !giro && gLoc(p.quando) !== oggi() ? 'Giorno senza giro' : (h < 5 || h >= 21 ? 'Fuori orario' : null) }; });
  t.presenze_oggi = t.dipendenti.map((d) => { const tt = t.timbrature.filter((x) => x.dipendente_id === d.id && x.esito === 'Valida' && gLoc(x.quando) === oggi());
    const e = tt.filter((x) => x.verso === 'Entrata').map((x) => x.quando).sort()[0] ?? null; const u = tt.filter((x) => x.verso === 'Uscita').map((x) => x.quando).sort().pop() ?? null;
    let stato = 'Presente'; if (!e) stato = d.nome === 'Autista 4' ? 'Ferie' : 'Assente';
    else if (d.inizio) { const [hh, mm] = d.inizio.split(':').map(Number); const min = (new Date(e).getHours() * 60 + new Date(e).getMinutes()) - (hh * 60 + mm); if (min > 5) stato = `Ritardo · ${min} min`; }
    return { dipendente_id: d.id, azienda: d.azienda, nome: d.nome, reparto: d.reparto, ore_settimana: d.ore_settimana, inizio: d.inizio, entrata: e, uscita: u, stato }; });
  t.presenze_mese = t.dipendenti.map((d, i) => ({ dipendente_id: d.id, azienda: d.azienda, nome: d.nome, contratto: d.contratto, ore_settimana: d.ore_settimana,
    ore: [168, 152, 160, 158, 164, 160, 161, 170, 160, 166, 160][i] ?? 160, ritardi: [0, 1, 4, 0, 0, 0, 2, 0, 0, 1, 0][i] ?? 0, minuti_ritardo: [0, 3, 74, 0, 0, 0, 22, 0, 0, 5, 0][i] ?? 0,
    uscite_anticipate: [0, 0, 1, 2, 0, 0, 0, 0, 0, 0, 0][i] ?? 0, minuti_in_meno: [0, 0, 15, 40, 0, 0, 0, 0, 0, 0, 0][i] ?? 0,
    uscite_mancanti: t.timbrature.filter((x) => x.dipendente_id === d.id && x.verso === 'Entrata' && gLoc(x.quando) < oggi()
      && !t.timbrature.some((u) => u.dipendente_id === d.id && u.verso === 'Uscita' && gLoc(u.quando) === gLoc(x.quando))
      && !t.correzioni.some((k) => k.dipendente_id === d.id && k.giorno === gLoc(x.quando))).length }));
  const st = t.stage_pc;
  t.stage_oggi = [{ ricevuti: 430, formattati: st.filter((x) => x.esito === 'Formattato').length + 370, in_corso: st.filter((x) => x.esito === 'In corso').length, falliti: st.filter((x) => x.esito === 'Fallito').length, in_vendita: 38,
    ricevuti_mese: 8640, formattati_mese: 8512, falliti_mese: 41, in_vendita_mese: 612 }];
  t.missioni_posti_app = t.missioni_posti.map((mp) => { const p = t.posti.find((x) => x.id === mp.posto_id)!;
    const gruppi: Record<string, { pezzi: number; letti: number }> = {};
    for (const a of mp.attesi) { gruppi[a.articolo] ??= { pezzi: 0, letti: 0 }; gruppi[a.articolo].pezzi++; if (mp.letti.includes(a.codice)) gruppi[a.articolo].letti++; }
    return { id: mp.id, missione_id: mp.missione_id, posto: p.codice, stato: mp.stato, elenco: Object.entries(gruppi).map(([articolo, v]) => ({ articolo, ...v })),
      pezzi: mp.attesi.length, letti: mp.letti.length, extra: mp.letti.filter((c: string) => !mp.attesi.some((a: any) => a.codice === c)).length }; });
  // anomalie
  const A: any[] = [];
  t.controllo_colli.filter((r) => r.letti > 0 && r.letti !== r.attesi).forEach((r) => A.push({ sezione: 'Magazzino', cosa: `${r.cliente} · ${r.tipo === 'Magazzino' ? 'entrata' : 'uscita'} ${r.letti} di ${r.attesi} colli`, chi: 'Magazzino', da: r.ultima_lettura, dove: 'magazzino/controllo', rif: r.bolla_id }));
  t.missioni_posti.filter((m) => m.stato === 'Bloccato').forEach((m) => A.push({ sezione: 'Missioni', cosa: `${t.posti.find((p) => p.id === m.posto_id)!.codice} bloccato: ${m.mancanti.length + m.extra.length} pezzi non tornano`, chi: 'Ufficio', da: m.aggiornato_il, dove: 'magazzino/missioni', rif: m.id }));
  t.bolle.filter((b) => b.stato === 'Nuova' && b.dati_mancanti.length).forEach((b) => A.push({ sezione: 'Bolle', cosa: `${cli(b.cliente_id)} · manca ${b.dati_mancanti.join(', ').toLowerCase()}`, chi: t.profili.find((p) => p.id === b.operatore_id)?.nome ?? 'Ufficio bolle', da: b.creata_il, dove: 'bolle', rif: b.id }));
  t.timbrature.filter((x) => x.esito === 'Rifiutata' && !t.allarmi_gestiti.some((a) => a.timbratura_id === x.id)).forEach((x) => A.push({ sezione: 'Presenze', cosa: `${t.dipendenti.find((d) => d.id === x.dipendente_id)?.nome ?? 'Sconosciuto'} · ${x.motivo}`, chi: 'Direzione', da: x.quando, dove: 'presenze/allarmi', rif: String(x.id) }));
  t.timbrature.filter((e) => e.esito === 'Valida' && e.verso === 'Entrata' && gLoc(e.quando) < oggi()
    && !t.timbrature.some((u) => u.dipendente_id === e.dipendente_id && u.verso === 'Uscita' && gLoc(u.quando) === gLoc(e.quando))
    && !t.correzioni.some((k) => k.dipendente_id === e.dipendente_id && k.giorno === gLoc(e.quando)))
    .forEach((e) => A.push({ sezione: 'Presenze', cosa: `${t.dipendenti.find((d) => d.id === e.dipendente_id)?.nome} · uscita non timbrata il ${e.quando.slice(8, 10)}/${e.quando.slice(5, 7)}`, chi: 'Amministrazione', da: e.quando, dove: 'presenze/correzioni', rif: String(e.id) }));
  t.fatture.filter((f) => f.stato === 'Da controllare').forEach((f) => A.push({ sezione: 'Fatturazione', cosa: `${cli(f.cliente_id)} · fattura da controllare: ${f.problema}`, chi: 'Amministrazione', da: f.creata_il, dove: 'fatture', rif: f.id }));
  t.telepass_passaggi.filter((p) => p.controllo && !t.telepass_controllati.some((k) => k.telepass_id === p.id)).forEach((p) => A.push({ sezione: 'Telepass', cosa: `${p.autista} · ${p.entrata} → ${p.uscita} · ${p.controllo.toLowerCase()}`, chi: 'Direzione', da: p.quando, dove: 'telepass', rif: p.id }));
  t.anomalie = A;
}

const RPC: RpcProva = {
  lancia_missione: (a, t) => { t.missioni_posti.forEach((m) => { if (m.stato !== 'Bloccato') { m.stato = 'Da fare'; m.letti = []; } }); return 'mi1'; },
  sblocca_posto: (a, t) => { const m = t.missioni_posti.find((x) => x.id === a.p_posto)!; if (!String(a.p_motivo).trim()) throw new Error('Per sbloccare scrivi cosa è successo'); m.stato = 'Sbloccato'; m.motivo = a.p_motivo;
    t.storico.unshift({ id: Date.now(), quando: new Date().toISOString(), chi_nome: 'Tu', operazione: 'Sblocco', cosa: a.p_motivo, dove: t.posti.find((p) => p.id === m.posto_id)!.codice, come: 'Sistema' }); },
  proponi_giri: (a, t) => { const da = t.bolle.filter((b) => b.stato === 'Confermata' && b.data_consegna === a.p_data && b.tipo !== 'Magazzino'); let n = 0;
    for (const b of da) { let giro = t.giri.find((x) => x.data === a.p_data && x.zona === (b.citta ?? '—'));
      if (!giro) { const m = t.mezzi.filter((x) => x.stato === 'Attivo' && x.autista_id)[t.giri.filter((x) => x.data === a.p_data).length % 3]; giro = { id: crypto.randomUUID(), data: a.p_data, mezzo_id: m.id, autista_id: m.autista_id, zona: b.citta ?? '—', stato: 'Preparato' }; t.giri.push(giro); }
      t.fermate.push({ id: crypto.randomUUID(), giro_id: giro.id, bolla_id: b.id, ordine: t.fermate.filter((f) => f.giro_id === giro!.id).length + 1, esito: 'Da fare' }); n++; }
    return n; },
  prenota_riconsegna: (a, t) => { const gi = t.giacenze.find((x) => x.id === a.p_giacenza)!; gi.riconsegna_il = a.p_data; gi.chiusa_il = new Date().toISOString(); const b = t.bolle.find((x) => x.id === gi.bolla_id)!; b.stato = 'Confermata'; b.data_consegna = a.p_data; },
  correggi_uscita: (a, t) => { if (!String(a.p_motivo).trim()) throw new Error('Scrivi il motivo della correzione'); t.correzioni.push({ id: crypto.randomUUID(), dipendente_id: a.p_dipendente, giorno: a.p_giorno, verso: 'Uscita', ora: a.p_ora, motivo: a.p_motivo }); },
  catalogo: (a, t) => { const m: Record<string, any> = {}; for (const d of t.device.filter((x) => x.stato === 'Disponibile' && x.siti.includes('Sito'))) { const k = d.modello + d.grado; m[k] ??= { modello: d.modello, marca: d.marca, cpu: d.cpu, ram: d.ram, disco: d.disco, schermo: d.schermo, gpu: d.gpu, grado: d.grado, prezzo: d.prezzo, disponibili: 0 }; m[k].disponibili++; m[k].prezzo = Math.min(m[k].prezzo, d.prezzo); } return Object.values(m); },
  valore_bolla: (a, t) => { const b = t.bolle.find((x) => x.id === a.p_bolla); if (!b) return 0; const tt = t.tariffe.filter((x) => x.cliente_id === b.cliente_id);
    return (tt.find((x) => x.voce === 'Base' && x.unita === 'spedizione')?.prezzo ?? 0) + (tt.find((x) => x.voce === 'Base' && x.unita !== 'spedizione')?.prezzo ?? 0) * b.colli_previsti + b.accessori.reduce((s: number, v: string) => s + (tt.find((x) => x.voce === v)?.prezzo ?? 0), 0); },
};

// Ogni app può aggiungere i suoi dati, le sue funzioni e le sue relazioni di prova
// con estendiProva(...) in un file suo (es. prova-app.ts), importato prima di motoreDiProva().
type Estensione = (x: { t: Tabelle; rpc: RpcProva; rel: Relazioni; funzioni: FunzioniProva; viste: ((t: Tabelle) => void)[]; regole: RegoleProva; filtri: FiltriProva }) => void;
const estensioni: Estensione[] = [];
export function estendiProva(f: Estensione) { estensioni.push(f); }

/** Edge Functions simulate in prova (quelle vere sono in supabase/functions) */
const FUNZIONI: FunzioniProva = {
  'crea-bolla': (c, t, u) => {
    const m = t.mail.find((x) => x.id === c.mail_id); if (!m) throw new Error('Mail non trovata');
    if (m.bolla_id) return { bolla_id: m.bolla_id };
    const cli = t.clienti.find((x) => x.azienda === 'trasporti' && (x.nome === m.da_nome || (x.email && x.email.toLowerCase() === String(m.da_indirizzo).toLowerCase())));
    if (!cli) throw new Error('Non riconosco il cliente: crea prima la sua scheda in Clienti');
    const id = crypto.randomUUID();
    t.bolle.unshift({ id, numero: null, cliente_id: cli.id, tipo: /ritir/i.test(m.oggetto) ? 'Ritiro' : 'Consegna', data_consegna: g(1), fascia: /entro le 12/i.test(m.testo ?? '') ? 'Entro le 12:00' : null,
      destinatario: cli.nome, indirizzo: 'Via [indirizzo]', citta: 'Milano', colli_previsti: Number((m.testo ?? '').match(/(\d+) (bancal|coll)/)?.[1] ?? 1), accessori: /sponda/i.test(m.testo ?? '') ? ['Sponda'] : [],
      dati_mancanti: ['Piano di consegna'], stato: 'Nuova', operatore_id: u, creata_il: new Date().toISOString(), note: null, mail_id: m.id });
    m.bolla_id = id; return { bolla_id: id };
  },
  'fatture-in-cloud': (c, t) => { const f = t.fatture.find((x) => x.id === c.fattura_id);
    if (!f || !['Pronta', 'Inviata'].includes(f.stato)) throw new Error(`Fattura «${f?.stato}»: si invia solo quando è Pronta`);
    if (f.stato === 'Pronta') { f.stato = 'Inviata'; f.inviata_il = new Date().toISOString(); }
    if (!f.numero) f.numero = 'FPR ' + (100 + t.fatture.filter((x) => x.numero).length) + '/' + new Date().getFullYear().toString().slice(2);
    f.data ??= oggi(); f.iva = Math.round(Number(f.imponibile ?? 0) * 22) / 100;   // IVA 22% calcolata da Fatture in Cloud
    f.fic_id ??= 'FIC-' + Math.floor(Math.random() * 900000 + 100000); f.sdi_inviata_il ??= new Date().toISOString();   // come la funzione vera: documento creato e mandato allo SdI
    return { numero: f?.numero }; },
  'mail-outlook': (c, t) => {
    const m = c.mail_id ? t.mail.find((x) => x.id === c.mail_id) : null;
    t.mail_uscita.unshift({ id: crypto.randomUUID(), azienda: c.azienda ?? m?.azienda ?? 'trasporti', risposta_a: m?.id ?? null, a: c.a ?? m?.da_indirizzo, oggetto: c.oggetto ?? ('Re: ' + (m?.oggetto ?? '')),
      testo: c.testo, creata_il: new Date().toISOString(), inviata_il: new Date().toISOString(), errore: null });
    if (m) m.stato = 'Risposta';
    return { ok: true };
  },
  // moduli dei siti: stessa cartella, etichetta e testo della funzione vera (supabase/functions/richiesta-sito)
  'richiesta-sito': (c, t) => {
    const SITI: Record<string, { azienda: string; tipi: Record<string, [string, string, string]> }> = {
      trasporti: { azienda: 'trasporti', tipi: { preventivo: ['Clienti', 'Preventivo', 'Richiesta di preventivo dal sito'], ritiro: ['Ordini', 'Ordine', 'Richiesta di ritiro dal sito'],
        candidatura: ['In arrivo', 'Personale', 'Candidatura dal sito'], contatto: ['In arrivo', 'Sito', 'Messaggio dal sito'] } },
      corporation: { azienda: 'corporation', tipi: { lotto: ['Lotti', 'Lotti', 'Lotto da valutare dal sito'], contatto: ['In arrivo', 'Sito', 'Messaggio dal sito'], aziende: ['Clienti', 'Aziende', 'Richiesta di un\'azienda dal negozio'] } },
    };
    const s0 = SITI[c?.sito]; if (!s0) throw new Error('Sito sconosciuto');
    const [cartella, etichetta, oggetto] = s0.tipi[c.tipo] ?? Object.values(s0.tipi)[0];
    const testo = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    if (testo(c.sito_web, 200)) return { ok: true };
    const nome = testo(c.nome, 80), azienda = testo(c.azienda, 120), email = testo(c.email, 200).toLowerCase(), telefono = testo(c.telefono, 40);
    if (!nome) throw new Error('Scrivi il tuo nome');
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,24}$/i.test(email)) throw new Error("Controlla l'indirizzo email");
    const campi = Object.entries(c.dettagli ?? {}).slice(0, 12).map(([k, v]) => [testo(k, 40), Array.isArray(v) ? v.join(', ') : testo(v, 300)]).filter(([, v]) => v);
    const note = testo(c.note, 3000);
    const righe = [`Nome: ${nome}`, azienda && `Azienda: ${azienda}`, `Email: ${email}`, telefono && `Telefono: ${telefono}`, ...campi.map(([k, v]) => `${k}: ${v}`), note && `\n${note}`].filter(Boolean).join('\n');
    t.mail.unshift({ id: crypto.randomUUID(), azienda: s0.azienda, casella: 'sito', cartella, etichetta, stato: 'Da leggere', da_nome: azienda ? `${nome} (${azienda})` : nome, da_indirizzo: email,
      oggetto, testo: righe, anteprima: (note || campi.map(([k, v]) => `${k}: ${v}`).join(', ')).slice(0, 160), ricevuta_il: new Date().toISOString(), allegati: [], bozza: null, bolla_id: null });
    return { ok: true };
  },
};

/** le regole di chiusura del database (trigger) rifatte in prova, con gli stessi messaggi */
const REGOLE: RegoleProva = {
  contenuto: (a, b, t, u) => {
    b.il = new Date().toISOString(); b.da ??= u;
    const k = t.bancali.find((x) => x.id === b.bancale_id); const p = t.posti.find((x) => x.id === k?.posto_id);
    t.storico.unshift({ id: Date.now(), quando: b.il, azienda: 'trasporti', chi_nome: t.profili.find((x) => x.id === u)?.nome ?? 'Tu', operazione: a ? 'Modifica' : 'Entrata',
      cosa: `${b.articolo} · ${b.quantita} pz${a ? ` (prima ${a.quantita})` : ''}`, dove: p?.codice ?? '—', come: b.inserito });
  },
  bolle: (a, b, t) => {
    if (!a) { if (b.stato && b.stato !== 'Nuova') throw new Error('Una bolla nasce Nuova e senza numero'); b.stato = 'Nuova'; b.accessori ??= []; b.dati_mancanti ??= []; b.creata_il ??= new Date().toISOString(); return; }
    if (a.stato === 'Nuova' && b.stato === 'Confermata') {
      if (b.dati_mancanti?.length) throw new Error('Bolla bloccata: manca ' + b.dati_mancanti.join(', '));
      if (!b.data_consegna || !b.indirizzo || !b.colli_previsti) throw new Error('Bolla bloccata: servono data, indirizzo e colli');
      const anno = new Date().toISOString().slice(2, 4);   // come la sequenza del database: il numero dopo il più alto già dato
      const ultimo = Math.max(0, ...t.bolle.map((x) => String(x.numero ?? '').startsWith(anno + '-') ? Number(String(x.numero).slice(3)) : 0));
      b.numero = anno + '-' + String(ultimo + 1).padStart(6, '0'); b.confermata_il = new Date().toISOString();
    }
  },
  device: (a, b) => {   // valori predefiniti del database per un computer appena caricato
    if (a) return;
    b.caricato_il ??= new Date().toISOString(); b.stato ??= 'Disponibile'; b.siti ??= []; b.difetti ??= []; b.foto ??= [];
  },
  fatture: (a, b, t) => {
    if (!a) { b.iva ??= 0; b.imponibile ??= 0; b.stato ??= 'Bozza'; b.creata_il ??= new Date().toISOString(); return; }   // valori predefiniti del database
    if (a.stato === b.stato) return;
    if (b.stato === 'Inviata' && a.stato !== 'Pronta') throw new Error('Si invia solo una fattura Pronta');
    if (b.stato === 'Pagata' && a.stato !== 'Inviata') throw new Error('Pagata solo dopo l’invio');
    if (b.stato === 'Pronta' && !t.righe_fattura.some((r) => r.fattura_id === b.id)) throw new Error('Fattura senza righe');
    if (b.stato === 'Pronta' && b.problema) throw new Error('Fattura da controllare: ' + b.problema);
    if (b.stato === 'Inviata') b.inviata_il = new Date().toISOString();
    if (b.stato === 'Pagata') b.pagata_il ??= oggi();
  },
};

export function motoreDiProva() {
  const t = dati(); const rpc = { ...RPC }; const rel = { ...REL }; const funzioni = { ...FUNZIONI }; const regole = { ...REGOLE }; const altre: ((t: Tabelle) => void)[] = []; const filtri: FiltriProva = {};
  for (const e of estensioni) e({ t, rpc, rel, funzioni, viste: altre, regole, filtri });
  return motoreProva(t, rel, rpc, UTENTI_PROVA, (x) => { viste(x); altre.forEach((f) => f(x)); }, funzioni, regole, filtri);
}
export { dati as datiDiProva, RPC as rpcDiProva };
