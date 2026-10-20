// Modalità Prova: stessi dati di supabase/seed.sql, in memoria, con le stesse
// regole del database (bolla bloccata se manca un dato, fattura pagata solo dopo
// l'invio, posto della missione sbloccato solo con il motivo).
// Serve per provare il gestionale prima di collegare Supabase.
import type {
  Api, Utente, Anomalia, Bolla, Bancale, Cliente, Contenuto, ControlloRiga, Device, Fattura,
  LottoConti, Posto, PostoMissione, Storico, Tariffa, Telefono, Ruolo, Azienda,
} from './types';

const adesso = () => new Date().toISOString();
const oreFa = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
const oggi = new Date().toISOString().slice(0, 10);
const domani = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const pausa = () => new Promise((r) => setTimeout(r, 120));

export const UTENTI_PROVA: { email: string; nome: string; ruolo: Ruolo; azienda: Azienda }[] = [
  { email: 'direzione@prova.messina', nome: 'Direzione', ruolo: 'direzione', azienda: 'trasporti' },
  { email: 'amministrazione@prova.messina', nome: 'Angela', ruolo: 'amministrazione', azienda: 'trasporti' },
  { email: 'bolle@prova.messina', nome: 'Gabriele', ruolo: 'bolle', azienda: 'trasporti' },
  { email: 'magazzino@prova.messina', nome: 'Magazziniere 1', ruolo: 'magazzino', azienda: 'trasporti' },
  { email: 'vendite@prova.messina', nome: 'Vendite', ruolo: 'vendite', azienda: 'corporation' },
];

export function creaApiProva(): Api {
  let io: Utente | null = null;

  const clienti: Cliente[] = [
    { id: 'c1', nome: 'Snam', portale_live: true, tramite: null, azienda_collegata: null },
    { id: 'c2', nome: 'Apple', portale_live: false, tramite: null, azienda_collegata: null },
    { id: 'c3', nome: 'Luxiona', portale_live: false, tramite: null, azienda_collegata: null },
    { id: 'c4', nome: 'Econocom', portale_live: true, tramite: null, azienda_collegata: null },
    { id: 'c5', nome: 'UniCredit', portale_live: true, tramite: 'c4', azienda_collegata: null },
    { id: 'c6', nome: 'Messina Corporation', portale_live: false, tramite: null, azienda_collegata: 'corporation' },
    { id: 'c7', nome: 'Velier', portale_live: false, tramite: null, azienda_collegata: null },
  ];
  const tariffe: Tariffa[] = [
    { id: 't1', cliente_id: 'c1', voce: 'Base', unita: 'spedizione', prezzo: 85 },
    { id: 't2', cliente_id: 'c1', voce: 'Sponda', unita: 'spedizione', prezzo: 18 },
    { id: 't3', cliente_id: 'c1', voce: 'Giacenza', unita: 'giorno', prezzo: 5 },
    { id: 't4', cliente_id: 'c1', voce: 'Riconsegna', unita: 'spedizione', prezzo: 85 },
    { id: 't5', cliente_id: 'c2', voce: 'Base', unita: 'collo', prezzo: 9 },
    { id: 't6', cliente_id: 'c2', voce: 'Sabato', unita: 'spedizione', prezzo: 40 },
    { id: 't7', cliente_id: 'c3', voce: 'Base', unita: 'bancale', prezzo: 35 },
    { id: 't8', cliente_id: 'c3', voce: 'Attesa', unita: 'ora', prezzo: 30 },
    { id: 't9', cliente_id: 'c4', voce: 'Base', unita: 'spedizione', prezzo: 9 },
    { id: 't10', cliente_id: 'c4', voce: 'Entrata merce', unita: 'pezzo', prezzo: 0.22 },
  ];
  const nomeCliente = (id: string) => clienti.find((c) => c.id === id)!.nome;
  let numero = 41;
  const bolla = (id: string, cliente_id: string, x: Partial<Bolla>): Bolla => ({
    id, numero: null, cliente_id, cliente: nomeCliente(cliente_id), tipo: 'Consegna', data_consegna: domani, fascia: null,
    destinatario: null, indirizzo: 'Via [indirizzo]', citta: null, colli_previsti: 1, accessori: [], dati_mancanti: [],
    stato: 'Nuova', operatore: 'Gabriele', creata_il: oreFa(3), ...x,
  });
  const bolle: Bolla[] = [
    bolla('b1', 'c1', { fascia: 'Entro le 12', destinatario: 'Snam', citta: 'Milano', colli_previsti: 4, accessori: ['Sponda'], dati_mancanti: ['Piano di consegna'], creata_il: oreFa(5) }),
    bolla('b2', 'c2', { fascia: '10–12', destinatario: 'Apple Store', citta: 'Rozzano', colli_previsti: 12, operatore: 'Alberto' }),
    bolla('b3', 'c3', { fascia: '9–13', destinatario: 'Luxiona', citta: 'Assago', colli_previsti: 3, operatore: 'Christian' }),
    bolla('b7', 'c7', { fascia: null, destinatario: '[Cliente]', indirizzo: null, citta: 'Torino', colli_previsti: 1, accessori: ['Sabato'], dati_mancanti: ['Indirizzo', 'Fascia oraria'], operatore: 'Christian', creata_il: oreFa(6) }),
    bolla('b4', 'c1', { numero: '26-000038', data_consegna: oggi, fascia: 'Entro le 12', destinatario: 'Snam', citta: 'Milano', colli_previsti: 4, accessori: ['Sponda'], stato: 'Consegnata' }),
    bolla('b5', 'c2', { numero: '26-000039', data_consegna: oggi, fascia: '10–12', destinatario: 'Apple', citta: 'Pieve Emanuele', colli_previsti: 8, stato: 'In giro' }),
    bolla('b6', 'c2', { numero: '26-000040', tipo: 'Magazzino', data_consegna: oggi, destinatario: 'Messina', citta: 'Lacchiarella', colli_previsti: 32, stato: 'Confermata' }),
  ];
  const controllo: ControlloRiga[] = [
    { bolla_id: 'b6', numero: '26-000040', cliente: 'Apple', tipo: 'Magazzino', attesi: 32, letti: 31, ultima_lettura: oreFa(2) },
    { bolla_id: 'b5', numero: '26-000039', cliente: 'Apple', tipo: 'Consegna', attesi: 8, letti: 8, ultima_lettura: oreFa(3) },
    { bolla_id: 'x1', numero: '26-000035', cliente: 'Snam', tipo: 'Magazzino', attesi: 40, letti: 40, ultima_lettura: oreFa(4) },
    { bolla_id: 'x2', numero: '26-000036', cliente: 'Econocom', tipo: 'Magazzino', attesi: 1000, letti: 1000, ultima_lettura: oreFa(4) },
  ];
  const posti: Posto[] = [];
  for (let s = 1; s <= 12; s++) for (let p = 1; p <= 6; p++) for (let n = 1; n <= 3; n++)
    posti.push({ id: `p${s}-${p}-${n}`, codice: `S${String(s).padStart(2, '0')}-${p}-${n}`, scaffale: s, piano: p, numero: n, zona: 'Scaffale' });
  const bancali: Bancale[] = [
    { id: 'k1', codice: 'B-0101', cliente: 'Econocom', posto: 'S07-1-1' },
    { id: 'k2', codice: 'B-0102', cliente: 'Econocom', posto: 'S07-1-2' },
    { id: 'k3', codice: 'B-0103', cliente: 'Econocom', posto: 'S07-2-1' },
    { id: 'k4', codice: 'B-0104', cliente: 'Econocom', posto: 'S07-2-2' },
    { id: 'k5', codice: 'B-0105', cliente: 'Messina Corporation', posto: 'S11-2-1' },
    { id: 'k6', codice: 'B-0106', cliente: 'Messina Corporation', posto: 'S11-2-2' },
    { id: 'k7', codice: 'B-0107', cliente: 'Snam', posto: 'S03-2-1' },
    { id: 'k8', codice: 'B-0108', cliente: 'Luxiona', posto: 'S05-1-2' },
  ];
  const contenuto: Contenuto[] = [
    { id: 'q1', bancale_id: 'k1', articolo: 'Notebook Lenovo T14', quantita: 2, codici: ['PF1A001', 'PF1A002'], inserito: 'Pistola', il: oreFa(30) },
    { id: 'q2', bancale_id: 'k1', articolo: 'Docking Lenovo', quantita: 1, codici: ['DK1A001'], inserito: 'Pistola', il: oreFa(30) },
    { id: 'q3', bancale_id: 'k2', articolo: 'Monitor Dell 24', quantita: 3, codici: ['MN2B001', 'MN2B002', 'MN2B003'], inserito: 'Pistola', il: oreFa(28) },
    { id: 'q4', bancale_id: 'k3', articolo: 'Notebook HP EliteBook', quantita: 2, codici: ['HP3C001', 'HP3C002'], inserito: 'Manuale', il: oreFa(20) },
    { id: 'q5', bancale_id: 'k4', articolo: 'Notebook Dell Latitude', quantita: 3, codici: ['DL4D001', 'DL4D002', 'DL4D003'], inserito: 'Pistola', il: oreFa(26) },
    { id: 'q6', bancale_id: 'k4', articolo: 'Docking Dell', quantita: 1, codici: ['DK4D001'], inserito: 'Pistola', il: oreFa(26) },
    { id: 'q7', bancale_id: 'k5', articolo: 'ThinkPad T14 Gen 2', quantita: 14, codici: [], inserito: 'Pistola', il: oreFa(50) },
    { id: 'q8', bancale_id: 'k7', articolo: 'Bancale Snam', quantita: 4, codici: [], inserito: 'Pistola', il: oreFa(8) },
  ];
  const att = (bid: string) => contenuto.filter((c) => c.bancale_id === bid).flatMap((c) => c.codici.map((codice) => ({ articolo: c.articolo, codice })));
  const missione: PostoMissione[] = [
    { id: 'm1', posto: 'S07-1-1', stato: 'Fatto', attesi: att('k1'), letti: att('k1').map((a) => a.codice), mancanti: [], extra: [], motivo: null },
    { id: 'm2', posto: 'S07-1-2', stato: 'Fatto', attesi: att('k2'), letti: att('k2').map((a) => a.codice), mancanti: [], extra: [], motivo: null },
    { id: 'm3', posto: 'S07-2-1', stato: 'Da fare', attesi: att('k3'), letti: [], mancanti: [], extra: [], motivo: null },
    { id: 'm4', posto: 'S07-2-2', stato: 'Bloccato', attesi: att('k4'), letti: ['DL4D001', 'DL4D002', 'DL4D003', 'HP9X099'],
      mancanti: [{ articolo: 'Docking Dell', codice: 'DK4D001' }], extra: ['HP9X099'], motivo: null },
    { id: 'm5', posto: 'S07-3-1', stato: 'Da fare', attesi: [], letti: [], mancanti: [], extra: [], motivo: null },
    { id: 'm6', posto: 'S07-3-2', stato: 'Da fare', attesi: [], letti: [], mancanti: [], extra: [], motivo: null },
  ];
  let sid = 100;
  const storico: Storico[] = [
    { id: 9, quando: oreFa(1.5), chi_nome: 'Magazziniere 1', operazione: 'Blocco', cosa: 'Mancano 1, in più 1', dove: 'S07-2-2', come: 'Sistema' },
    { id: 8, quando: oreFa(2), chi_nome: 'Magazziniere 2', operazione: 'Entrata', cosa: 'Apple · 31 colli su 32', dove: 'RIC', come: 'Pistola' },
    { id: 7, quando: oreFa(3), chi_nome: 'Magazziniere 3', operazione: 'Uscita', cosa: 'Apple · 8 colli caricati', dove: 'Motrice GA001AA', come: 'Pistola' },
    { id: 6, quando: oreFa(20), chi_nome: 'Magazziniere 2', operazione: 'Modifica', cosa: 'Notebook HP EliteBook · 2 pz (prima 3)', dove: 'S07-2-1', come: 'Manuale' },
    { id: 5, quando: oreFa(26), chi_nome: 'Magazziniere 1', operazione: 'Aggiunta', cosa: 'Notebook Dell Latitude · 3 pz', dove: 'S07-2-2', come: 'Pistola' },
  ];
  const fatture: Fattura[] = [
    { id: 'f1', cliente: 'Apple', periodo: oggi.slice(0, 7), imponibile: 1240, stato: 'Pronta', problema: null, numero: null },
    { id: 'f2', cliente: 'Snam', periodo: oggi.slice(0, 7), imponibile: 2310, stato: 'Da controllare', problema: 'Sponda ×12 senza tariffa concordata', numero: null },
    { id: 'f3', cliente: 'Luxiona', periodo: oggi.slice(0, 7), imponibile: 480, stato: 'Pronta', problema: null, numero: null },
  ];
  const presenze: Anomalia[] = [
    { sezione: 'Presenze', cosa: 'Magazziniere 1 · uscita non timbrata ieri', chi: 'Amministrazione', da: oreFa(24), dove: 'presenze', rif: 'pr1' },
    { sezione: 'Presenze', cosa: 'Gabriele · codice scaduto (foto o screenshot?)', chi: 'Direzione', da: oreFa(3), dove: 'presenze', rif: 'pr2' },
  ];

  const device: Device[] = [
    { id: 'd1', seriale: 'PF3XXXX1', tipo: 'PC', marca: 'Lenovo', modello: 'ThinkPad T14 Gen 2', cpu: 'i5-1145G7', gpu: 'Intel Iris Xe', ram: '16 GB', disco: '256 GB SSD', schermo: '14"', grado: 'B', difetti: ['Graffi coperchio'], lotto: 'L-015', bancale: 'B-0105', posto: 'S11-2-1', costo: 160, prezzo: 249, stato: 'Disponibile', siti: ['Back Market', 'Refurbed', 'eBay', 'Subito'], giorni: 9 },
    { id: 'd2', seriale: 'PF3XXXX2', tipo: 'PC', marca: 'Lenovo', modello: 'ThinkPad T14 Gen 2', cpu: 'i5-1145G7', gpu: 'Intel Iris Xe', ram: '16 GB', disco: '256 GB SSD', schermo: '14"', grado: 'A', difetti: [], lotto: 'L-015', bancale: 'B-0105', posto: 'S11-2-1', costo: 160, prezzo: 289, stato: 'Disponibile', siti: ['Back Market', 'eBay'], giorni: 5 },
    { id: 'd3', seriale: 'C02XXXX3', tipo: 'PC', marca: 'Apple', modello: 'MacBook Air M1', cpu: 'Apple M1', gpu: 'Apple M1 7 core', ram: '8 GB', disco: '256 GB SSD', schermo: '13"', grado: 'B', difetti: [], lotto: 'L-014', bancale: 'B-0106', posto: 'S11-2-2', costo: 300, prezzo: 519, stato: 'Disponibile', siti: ['Back Market', 'Refurbed', 'Sito'], giorni: 12 },
    { id: 'd4', seriale: '5CGXXXX4', tipo: 'PC', marca: 'HP', modello: 'EliteBook 840 G8', cpu: 'i5-1135G7', gpu: 'Intel Iris Xe', ram: '16 GB', disco: '512 GB SSD', schermo: '14"', grado: 'C', difetti: ['Tastiera lucida'], lotto: 'L-014', bancale: 'B-0106', posto: 'S11-2-2', costo: 140, prezzo: 229, stato: 'Venduto', siti: ['eBay'], giorni: 3 },
    { id: 'd5', seriale: 'PF2XXXX5', tipo: 'PC', marca: 'Lenovo', modello: 'ThinkPad X1 Carbon', cpu: 'i7-8650U', gpu: 'Intel UHD 620', ram: '16 GB', disco: '512 GB SSD', schermo: '14"', grado: 'B', difetti: [], lotto: 'L-014', bancale: 'B-0106', posto: 'S11-2-2', costo: 180, prezzo: 329, stato: 'Fermo', siti: ['Back Market', 'eBay', 'Subito'], giorni: 64 },
  ];
  const lotti: LottoConti[] = [
    { id: 'l2', codice: 'L-015', acquistato_il: new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10), pezzi: 80, costo: 12800, venduti: 0, incassato: 0, recuperato_pct: 0 },
    { id: 'l1', codice: 'L-014', acquistato_il: new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10), pezzi: 120, costo: 18000, venduti: 1, incassato: 206, recuperato_pct: 1.1 },
  ];
  const telefoni: Telefono[] = [
    { id: 'h1', imei: '35XXXXXXXXXXXX1', marca: 'Apple', modello: 'iPhone 13', cliente: 'Accenture', ticket: '[n. ticket]', operatore: 'Manuel', stato: 'Chiuso' },
    { id: 'h2', imei: '35XXXXXXXXXXXX2', marca: 'Samsung', modello: 'Galaxy S21', cliente: 'Accenture', ticket: '[n. ticket]', operatore: 'Manuel', stato: 'Sblocco' },
    { id: 'h3', imei: '35XXXXXXXXXXXX3', marca: 'Apple', modello: 'iPhone 12', cliente: 'Accenture', ticket: '[n. ticket]', operatore: null, stato: 'Reset' },
    { id: 'h4', imei: '35XXXXXXXXXXXX4', marca: 'Apple', modello: 'iPhone SE', cliente: 'Accenture', ticket: 'Aperto', operatore: 'Manuel', stato: 'Ticket' },
    { id: 'h5', imei: '35XXXXXXXXXXXX5', marca: 'Samsung', modello: 'Galaxy A52', cliente: 'Accenture', ticket: '[n. ticket]', operatore: 'Manuel', stato: 'Chiuso' },
  ];
  const valoreBolla = (b: Bolla) => {
    const t = tariffe.filter((x) => x.cliente_id === b.cliente_id);
    const base = (t.find((x) => x.voce === 'Base' && x.unita === 'spedizione')?.prezzo ?? 0)
      + (t.find((x) => x.voce === 'Base' && (x.unita === 'collo' || x.unita === 'bancale'))?.prezzo ?? 0) * (b.colli_previsti ?? 0);
    return base + b.accessori.reduce((s, a) => s + (t.find((x) => x.voce === a)?.prezzo ?? 0), 0);
  };
  const scrivi = (operazione: string, cosa: string, dove: string | null) =>
    storico.unshift({ id: sid++, quando: adesso(), chi_nome: io?.nome ?? null, operazione, cosa, dove, come: 'Sistema' });

  const api: Api = {
    modo: 'prova',
    async login(email) {
      await pausa();
      const u = UTENTI_PROVA.find((x) => x.email === email.trim().toLowerCase());
      if (!u) throw new Error('Utente di prova sconosciuto');
      io = { id: u.email, nome: u.nome, ruolo: u.ruolo, azienda: u.azienda, cliente_id: null };
      return io;
    },
    async logout() { io = null; },
    async utente() { return io; },

    async anomalie() {
      await pausa();
      const a: Anomalia[] = [];
      controllo.filter((r) => r.letti > 0 && r.letti !== r.attesi).forEach((r) =>
        a.push({ sezione: 'Magazzino', cosa: `${r.cliente} · ${r.tipo === 'Magazzino' ? 'entrata' : 'uscita'} ${r.letti} di ${r.attesi} colli`, chi: 'Magazzino', da: r.ultima_lettura, dove: 'magazzino/controllo', rif: r.bolla_id }));
      missione.filter((m) => m.stato === 'Bloccato').forEach((m) =>
        a.push({ sezione: 'Missioni', cosa: `${m.posto} bloccato: ${m.mancanti.length + m.extra.length} pezzi non tornano`, chi: 'Ufficio', da: oreFa(1.5), dove: 'magazzino/missioni', rif: m.id }));
      bolle.filter((b) => b.stato === 'Nuova' && b.dati_mancanti.length).forEach((b) =>
        a.push({ sezione: 'Bolle', cosa: `${b.cliente} · manca ${b.dati_mancanti.join(', ').toLowerCase()}`, chi: b.operatore ?? 'Ufficio bolle', da: b.creata_il, dove: 'bolle', rif: b.id }));
      a.push(...presenze);
      fatture.filter((f) => f.stato === 'Da controllare').forEach((f) =>
        a.push({ sezione: 'Fatturazione', cosa: `${f.cliente} · ${f.problema}`, chi: 'Amministrazione', da: oreFa(5), dove: 'fatture', rif: f.id }));
      return a;
    },
    async incassiTrasporti() {
      const chiuse = bolle.filter((b) => ['Consegnata', 'Giacenza', 'Non consegnata', 'Fatturata'].includes(b.stato));
      return {
        fatturato_oggi: chiuse.filter((b) => b.data_consegna === oggi).reduce((s, b) => s + valoreBolla(b), 0),
        fatturato_mese: chiuse.reduce((s, b) => s + valoreBolla(b), 0) + 18240,
        incassato_mese: fatture.filter((f) => f.stato === 'Pagata').reduce((s, f) => s + f.imponibile, 0) + 9600,
      };
    },
    async bolle() { await pausa(); return bolle.map((b) => ({ ...b })); },
    async completaBolla(id, campo, valore) {
      const b = bolle.find((x) => x.id === id)!;
      if (campo === 'Indirizzo') b.indirizzo = valore;
      if (campo === 'Fascia oraria') b.fascia = valore;
      b.dati_mancanti = b.dati_mancanti.filter((d) => d !== campo);
      scrivi('Modifica', `${b.cliente} · ${campo}: ${valore}`, 'Bolle');
    },
    async confermaBolla(id) {
      const b = bolle.find((x) => x.id === id)!;
      if (b.dati_mancanti.length) throw new Error('Bolla bloccata: manca ' + b.dati_mancanti.join(', '));
      if (!b.indirizzo || !b.colli_previsti) throw new Error('Bolla bloccata: servono indirizzo e colli');
      b.stato = 'Confermata'; b.numero = `26-0000${numero++}`;
      scrivi('Conferma', `Bolla ${b.numero} · ${b.cliente}`, 'Bolle');
    },
    async controllo() { await pausa(); return controllo.map((r) => ({ ...r })); },
    async posti() { return posti; },
    async bancali() { return bancali; },
    async contenuto(id) { return contenuto.filter((c) => c.bancale_id === id); },
    async missione() { await pausa(); return missione.map((m) => ({ ...m })); },
    async lanciaMissione(ambito, filtro) {
      scrivi('Missione', `Lanciata: ${ambito} ${filtro}`, filtro);
      missione.forEach((m) => { if (m.stato !== 'Bloccato') { m.stato = 'Da fare'; m.letti = []; } });
    },
    async sbloccaPosto(id, motivo) {
      if (!motivo.trim()) throw new Error('Per sbloccare scrivi cosa è successo');
      const m = missione.find((x) => x.id === id)!;
      if (m.stato !== 'Bloccato') throw new Error('Si sblocca solo un posto bloccato');
      m.stato = 'Sbloccato'; m.motivo = motivo;
      scrivi('Sblocco', motivo, m.posto);
    },
    async storico() { await pausa(); return storico.map((s) => ({ ...s })); },
    async clienti() { return clienti; },
    async tariffe(id) { return tariffe.filter((t) => t.cliente_id === id); },
    async fatture() { await pausa(); return fatture.map((f) => ({ ...f })); },
    async inviaPronte() {
      const pronte = fatture.filter((f) => f.stato === 'Pronta');
      pronte.forEach((f, i) => { f.stato = 'Inviata'; f.numero = `FT ${120 + i}/2026`; scrivi('Invio', `Fattura ${f.cliente} a Fatture in Cloud`, 'Fatturazione'); });
      return pronte.length;
    },
    async segnaPagata(id) {
      const f = fatture.find((x) => x.id === id)!;
      if (f.stato !== 'Inviata') throw new Error('Pagata solo dopo l\'invio');
      f.stato = 'Pagata'; scrivi('Incasso', `Fattura ${f.cliente} pagata`, 'Fatturazione');
    },

    async incassiCorporation() { return { incassato_oggi: 206, incassato_mese: 14820 }; },
    async device() { await pausa(); return device; },
    async lotti() { return lotti; },
    async telefoni() { return telefoni; },
  };
  return api;
}
