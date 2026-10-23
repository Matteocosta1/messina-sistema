// Prova: tariffe a regole, chiusura del mese, fatture (IVA, invio, esito SdI, note di credito),
// preventivi dei Trasporti e richieste delle aziende per la Corporation.
// Stessa logica delle migrazioni 20261022000200 e 20261022000300, con gli stessi messaggi.
import { estendiProva, operatoreBolle } from './prova';

type R = Record<string, any>;
const giorno = (n = 0) => { const d = new Date(); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const ora = () => new Date().toISOString();
const oreFa = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
const r2 = (n: number) => Math.round(n * 100) / 100;
const APERTE = ['Bozza', 'Da controllare', 'Pronta'];

estendiProva(({ t, rpc, rel, funzioni, viste, regole }) => {
  // ------------------------------------------------------------------ dati di esempio
  const anag: Record<string, R> = {
    'c-apple': { piva: '00000000001', indirizzo: 'Via [indirizzo] 1', cap: '20089', citta: 'Rozzano', provincia: 'MI', codice_destinatario: 'M5UXCR1' },
    'c-lux': { piva: '00000000002', indirizzo: 'Via [indirizzo] 2', cap: '20090', citta: 'Assago', provincia: 'MI', codice_destinatario: 'T04ZHR3' },
    'c-eco': { piva: '00000000003', indirizzo: 'Via [indirizzo] 3', cap: '20123', citta: 'Milano', provincia: 'MI', pec: 'amministrazione@pec.[dominio]' },
    'c-vel': { piva: '00000000004', indirizzo: 'Via [indirizzo] 4', cap: '16121', citta: 'Genova', provincia: 'GE', codice_destinatario: 'KRRH6B9' },
    'c-snam': { piva: '00000000005', indirizzo: 'Via [indirizzo] 5', citta: 'San Donato Milanese' },   // mancano CAP e provincia: la fattura lo dice
  };
  for (const c of t.clienti) Object.assign(c, { stato: 'Attivo', iva_aliquota: 22, iva_natura: null, split_payment: false, cap: null, provincia: null, codice_destinatario: null, pec: null, codice_fiscale: null, ...anag[c.id] });
  t.listino = [
    { id: 'l1', voce: 'Base', unita: 'spedizione', prezzo: 80, zona: null, minimo: null, scaglione_su: null }, { id: 'l2', voce: 'Base', unita: 'collo', prezzo: 8, zona: null, minimo: null, scaglione_su: null },
    { id: 'l3', voce: 'Base', unita: 'bancale', prezzo: 30, zona: null, minimo: null, scaglione_su: null }, { id: 'l4', voce: 'Sponda', unita: 'spedizione', prezzo: 15, zona: null, minimo: null, scaglione_su: null },
    { id: 'l5', voce: 'Giacenza', unita: 'giorno', prezzo: 5, zona: null, minimo: null, scaglione_su: null }, { id: 'l6', voce: 'Riconsegna', unita: 'spedizione', prezzo: 60, zona: null, minimo: null, scaglione_su: null },
  ];
  const tar = (c: string, voce: string, unita: string, prezzo: number, x: R = {}) => ({ id: crypto.randomUUID(), cliente_id: c, voce, unita, prezzo, zona: null, quando: null, valida_dal: giorno(-200), valida_al: null,
    stato: 'Attiva', minimo: null, scaglione_su: null, scaglione_da: null, scaglione_a: null, motivo: null, ...x });
  t.tariffe.push(tar('c-apple', 'Sponda', 'spedizione', 18), tar('c-lux', 'Base', 'bancale', 28, { stato: 'Da approvare', valida_dal: giorno(1), motivo: 'Sotto il listino (30 €)', creata_da: 'u-com' }));
  // bolle del mese scorso consegnate e non ancora fatturate: «Chiudi mese» le mette in fattura (Velier non ha tariffe: resta da controllare)
  const bm = (n: number, c: string, x: R) => ({ id: 'b-m' + n, numero: '26-0000' + (10 + n), cliente_id: c, tipo: 'Consegna', data_consegna: giorno(-30 + n), fascia: null, destinatario: null, indirizzo: 'Via [indirizzo]',
    citta: 'Milano', provincia: 'MI', colli_previsti: 1, peso_kg: null, accessori: [], dati_mancanti: [], stato: 'Consegnata', creata_il: oreFa(24 * (32 - n)), ...x });
  t.bolle.push(bm(1, 'c-apple', { citta: 'Rozzano', colli_previsti: 12, accessori: ['Sabato'] }), bm(2, 'c-apple', { citta: 'Rho', colli_previsti: 6, accessori: ['Sponda'] }),
    bm(3, 'c-lux', { citta: 'Assago', colli_previsti: 4 }), bm(4, 'c-vel', { citta: 'Genova', provincia: 'GE', colli_previsti: 2 }));
  t.fatture_bolle = [];
  for (const f of t.fatture) Object.assign(f, { tipo: f.tipo ?? 'Fattura', totale: f.totale ?? r2(Number(f.imponibile) + Number(f.iva ?? 0)), split_payment: !!f.split_payment, sdi_esito: f.sdi_esito ?? (f.stato === 'Inviata' || f.stato === 'Pagata' ? 'Consegnata' : null) });
  for (const r of t.righe_fattura) Object.assign(r, { iva_aliquota: r.iva_aliquota ?? 22, iva_natura: r.iva_natura ?? null, margine: !!r.margine });
  // preventivi: uno dal sito da preparare, uno sotto listino che aspetta la Direzione
  t.clienti.push(
    { id: 'c-pot1', nome: 'Logistica Bianchi', email: 'acquisti@bianchi.example', telefono: '02 0000000', stato: 'Potenziale', portale_live: false, cosa_spedisce: null, iva_aliquota: 22, split_payment: false },
    { id: 'c-pot2', nome: 'Farmacie Lombarde', email: 'ordini@farmacie.example', stato: 'Potenziale', portale_live: false, cosa_spedisce: null, iva_aliquota: 22, split_payment: false });
  t.preventivi = [
    { id: 'pv1', numero: 'P26-0007', cliente_id: 'c-pot1', modello: 'Distribuzione', origine: 'Sito', stato: 'Bozza', richiesta: 'Nome: Marco Bianchi\nAzienda: Logistica Bianchi\nEmail: acquisti@bianchi.example\nCosa: 40 bancali al mese, Milano e provincia, con sponda', creato_il: oreFa(3), motivo: null, valido_fino: null },
    { id: 'pv2', numero: 'P26-0006', cliente_id: 'c-pot2', modello: 'Spedizioni a peso', origine: 'Mail', stato: 'Da approvare', richiesta: 'Consegne alle farmacie, colli piccoli, 300 spedizioni al mese', creato_il: oreFa(26), creato_da: 'u-com',
      motivo: 'Cliente nuovo; Sotto il listino: Base 70.00 € (listino 80.00 €)', valido_fino: null },
  ];
  t.preventivi_righe = [
    { id: 'pr1', preventivo_id: 'pv1', voce: 'Base', unita: 'bancale', prezzo: 0 }, { id: 'pr2', preventivo_id: 'pv1', voce: 'Sponda', unita: 'spedizione', prezzo: 0 },
    { id: 'pr3', preventivo_id: 'pv2', voce: 'Base', unita: 'spedizione', prezzo: 70, scaglione_su: 'peso', scaglione_da: 0, scaglione_a: 30 },
    { id: 'pr4', preventivo_id: 'pv2', voce: 'Base', unita: 'spedizione', prezzo: 95, scaglione_su: 'peso', scaglione_da: 30, scaglione_a: null },
    { id: 'pr5', preventivo_id: 'pv2', voce: 'Contrassegno', unita: 'percentuale', prezzo: 2, minimo: 5 },
  ];
  t.richieste_aziende = [
    { id: 'ra1', numero: 'R26-0012', azienda_cliente: 'Studio Rossi', referente: 'Anna Rossi', email: 'anna@rossi.example', telefono: null, modello: 'Dell Latitude 5420', grado: 'A', quantita: 12,
      note: 'Consegna entro fine mese', origine: 'Negozio', stato: 'Aperta', assegnata_a: 'u-ven', creata_il: oreFa(6) },
    { id: 'ra2', numero: 'R26-0013', azienda_cliente: 'Bar Centrale', referente: null, email: null, telefono: '333 0000000', modello: 'iPhone 13', grado: 'Indifferente', quantita: 2,
      note: null, origine: 'WhatsApp', stato: 'Aperta', assegnata_a: 'u-ven', creata_il: oreFa(1) },
  ];
  rel.fatture = { ...rel.fatture, fatture_bolle: ['fattura_id', 'molti'] };
  rel.preventivi = { clienti: 'cliente_id', preventivi_righe: ['preventivo_id', 'molti'] };
  rel.richieste_aziende = { profili: 'assegnata_a' };
  rel.tariffe = { clienti: 'cliente_id' };

  // ------------------------------------------------------------------ calcolo di una bolla
  const ruolo = (u: string | null) => t.profili.find((p) => p.id === u)?.ruolo;
  const cliNome = (id: string) => t.clienti.find((c) => c.id === id)?.nome ?? '—';
  const storico = (azienda: string, operazione: string, cosa: string, u: string | null) =>
    t.storico.unshift({ id: Date.now() + Math.random(), quando: ora(), azienda, chi_nome: t.profili.find((p) => p.id === u)?.nome ?? 'Sistema', operazione, cosa, dove: '—', come: u ? 'Manuale' : 'Sistema' });
  const misura = (su: string, peso: number | null, colli: number, km: number | null) => su === 'peso' ? peso : su === 'colli' ? colli : km;
  const valida = (cli: string, voce: string, g: string, zone: (string | null)[], peso: number | null, colli: number, km: number | null) => t.tariffe
    .filter((x) => x.cliente_id === cli && x.voce === voce && (x.stato ?? 'Attiva') === 'Attiva' && x.valida_dal <= g && (!x.valida_al || x.valida_al >= g)
      && (!x.zona || zone.some((z) => z && z.toLowerCase() === String(x.zona).toLowerCase()))
      && (!x.scaglione_su || ((misura(x.scaglione_su, peso, colli, km) ?? -1) >= Number(x.scaglione_da) && (x.scaglione_a == null || (misura(x.scaglione_su, peso, colli, km) ?? -1) < Number(x.scaglione_a)))))
    .sort((a, b) => (+!!b.zona - +!!a.zona) || (+!!b.scaglione_su - +!!a.scaglione_su) || String(b.valida_dal).localeCompare(a.valida_dal))[0];
  const quanti = (u: string, colli: number, bancali: number | null, peso: number | null, km: number | null) =>
    u === 'collo' || u === 'pezzo' ? colli : u === 'bancale' ? (bancali ?? colli) : u === 'kg' ? (peso ?? 0) : u === 'km' ? (km ?? 0) : 1;
  const calcola = (b: R): R[] => {
    const out: R[] = []; const g = b.data_consegna ?? giorno(); const zone = [b.citta, b.provincia];
    const fer = t.fermate.filter((f) => f.bolla_id === b.id);
    const ok = fer.filter((f) => f.esito === 'Consegnata').pop();
    const colli = Number(ok?.colli_ritirati ?? ok?.colli_consegnati ?? b.colli_previsti ?? 0);
    const tentativi = fer.filter((f) => f.esito !== 'Da fare').length;
    const peso = b.peso_kg == null ? null : Number(b.peso_kg), km = b.km == null ? null : Number(b.km);
    const riga = (voce: string, quantita: number, prezzo: number, problema: string | null = null) => out.push({ voce, quantita, prezzo, totale: problema ? 0 : r2(quantita * prezzo), problema });
    const base = valida(b.cliente_id, 'Base', g, zone, peso, colli, km);
    if (!base) riga('Base', 1, 0, 'manca la tariffa Base');
    else if (base.unita === 'kg' && peso == null) riga('Base', 0, base.prezzo, 'manca il peso');
    else if (base.unita === 'km' && km == null) riga('Base', 0, base.prezzo, 'mancano i km');
    else if (base.unita === 'percentuale') { if (b.valore_merce == null) riga('Base', 0, base.prezzo, 'manca il valore della merce'); else riga('Base', 1, r2(Number(b.valore_merce) * base.prezzo / 100)); }
    else { const q = quanti(base.unita, colli, b.bancali ?? null, peso, km); const tot = r2(q * base.prezzo);
      if (base.minimo != null && tot < Number(base.minimo)) riga('Base (minimo)', 1, Number(base.minimo)); else riga('Base', q, Number(base.prezzo)); }
    const acc: Record<string, number> = {};
    for (const a of b.accessori ?? []) acc[a] = Math.max(acc[a] ?? 0, 1);
    const extra: Record<string, number> = {};
    for (const x of t.accessori_extra.filter((x) => fer.some((f) => f.id === x.fermata_id))) extra[x.voce] = (extra[x.voce] ?? 0) + Number(x.quantita ?? 1);
    for (const [v, q] of Object.entries(extra)) acc[v] = Math.max(acc[v] ?? 0, q);
    for (const v of Object.keys(acc).filter((v) => v !== 'Riconsegna').sort()) {
      const x = valida(b.cliente_id, v, g, zone, peso, colli, km);
      if (!x) riga(v, 1, 0, 'manca la tariffa ' + v);
      else { const q = x.unita === 'ora' ? acc[v] : quanti(x.unita, colli, b.bancali ?? null, peso, km); riga(v, q, Number(x.prezzo)); }
    }
    if (tentativi > 1) { const x = valida(b.cliente_id, 'Riconsegna', g, zone, peso, colli, km); riga('Riconsegna', tentativi - 1, Number(x?.prezzo ?? 0), x ? null : 'manca la tariffa Riconsegna'); }
    for (const gi of t.giacenze.filter((x) => x.bolla_id === b.id)) {
      const x = valida(b.cliente_id, 'Giacenza', g, zone, peso, colli, km);
      const al = gi.chiusa_il ? gi.chiusa_il.slice(0, 10) : giorno();
      const q = x?.unita === 'giorno' ? Math.max(1, Math.round((new Date(al).getTime() - new Date(gi.dal).getTime()) / 86400000)) : 1;
      riga('Giacenza', q, Number(x?.prezzo ?? 0), x ? null : 'manca la tariffa Giacenza');
    }
    if (Number(b.contrassegno ?? 0) > 0) { const x = valida(b.cliente_id, 'Contrassegno', g, zone, peso, colli, km);
      riga('Contrassegno', 1, !x ? 0 : x.unita === 'percentuale' ? Math.max(r2(Number(b.contrassegno) * x.prezzo / 100), Number(x.minimo ?? 0)) : Number(x.prezzo), x ? null : 'manca la tariffa Contrassegno'); }
    if (Number(b.valore_merce ?? 0) > 0) { const x = valida(b.cliente_id, 'Assicurazione', g, zone, peso, colli, km);
      if (x) riga('Assicurazione', 1, x.unita === 'percentuale' ? Math.max(r2(Number(b.valore_merce) * x.prezzo / 100), Number(x.minimo ?? 0)) : Number(x.prezzo)); }
    return out;
  };
  const bolla = (id: string) => t.bolle.find((x) => x.id === id);
  rpc.righe_bolla = (a) => { const b = bolla(a.p_bolla); return b ? calcola(b) : []; };
  rpc.valore_bolla = (a) => { const b = bolla(a.p_bolla); return b ? r2(calcola(b).reduce((s, r) => s + r.totale, 0)) : 0; };
  const manca = (cid: string) => { const c = t.clienti.find((x) => x.id === cid) ?? {}; const m: string[] = [];
    if (!String(c.piva ?? '').trim() && !String(c.codice_fiscale ?? '').trim()) m.push('partita IVA o codice fiscale');
    if (!String(c.indirizzo ?? '').trim()) m.push('indirizzo');
    if (!/^\d{5}$/.test(String(c.cap ?? '').trim())) m.push('CAP');
    if (!String(c.citta ?? '').trim()) m.push('città');
    if (!/^[A-Za-z]{2}$/.test(String(c.provincia ?? '').trim())) m.push('provincia');
    if (!String(c.codice_destinatario ?? '').trim() && !String(c.pec ?? '').trim()) m.push('codice destinatario o PEC');
    return m; };
  rpc.anagrafica_mancante = (a) => manca(a.p_cliente);

  // ------------------------------------------------------------------ tariffe: salvare e approvare
  const stessa = (x: R, y: R) => x.cliente_id === y.cliente_id && x.voce === y.voce && (x.zona ?? '') === (y.zona ?? '') && (x.scaglione_su ?? '') === (y.scaglione_su ?? '') && Number(x.scaglione_da ?? -1) === Number(y.scaglione_da ?? -1);
  const attiva = (n: R) => {
    for (const x of t.tariffe.filter((x) => x !== n && stessa(x, n) && x.stato === 'Attiva')) {
      if (x.valida_dal < n.valida_dal && (!x.valida_al || x.valida_al >= n.valida_dal)) x.valida_al = giorno(Math.round((new Date(n.valida_dal).getTime() - new Date(giorno()).getTime()) / 86400000) - 1);
      else if (x.valida_dal >= n.valida_dal) { x.stato = 'Rifiutata'; x.motivo = 'Sostituita'; }
    }
    n.stato = 'Attiva';
  };
  rpc.salva_tariffe = (a, _t, u) => {
    const r = ruolo(u); if (r !== 'commerciale' && r !== 'direzione') throw new Error('Le tariffe le cambia il commerciale');
    const dal = a.p_dal ?? giorno();
    if (dal < giorno() && t.fatture_bolle.some((fb) => fb.valida && ['Inviata', 'Pagata'].includes(t.fatture.find((f) => f.id === fb.fattura_id)?.stato) && bolla(fb.bolla_id)?.cliente_id === a.p_cliente && (bolla(fb.bolla_id)?.data_consegna ?? '') >= dal))
      throw new Error(`Dal ${dal.slice(8)}/${dal.slice(5, 7)} ci sono bolle già fatturate: la tariffa nuova può valere solo da dopo l'ultima fattura inviata`);
    const nuovo = !t.tariffe.some((x) => x.cliente_id === a.p_cliente && x.stato === 'Attiva'); let n = 0;
    for (const x of a.p_righe as R[]) {
      const prima = x.id ? t.tariffe.find((y) => y.id === x.id) : null;
      const voce = String(x.voce ?? prima?.voce ?? '').trim(); if (!voce) throw new Error('Ogni tariffa ha una voce');
      if (x.prezzo == null || Number(x.prezzo) < 0) throw new Error('Prezzo mancante per ' + voce);
      const v: R = { id: crypto.randomUUID(), cliente_id: a.p_cliente, voce, unita: x.unita ?? prima?.unita ?? 'spedizione', prezzo: Number(x.prezzo), minimo: 'minimo' in x ? x.minimo : prima?.minimo ?? null,
        zona: x.zona || prima?.zona || null, quando: x.quando || prima?.quando || null, scaglione_su: x.scaglione_su || prima?.scaglione_su || null,
        scaglione_da: x.scaglione_da ?? prima?.scaglione_da ?? null, scaglione_a: x.scaglione_a ?? prima?.scaglione_a ?? null, valida_dal: dal, valida_al: null, creata_da: u, stato: 'Da approvare' };
      if (prima && Number(prima.prezzo) === v.prezzo && (prima.minimo ?? null) === (v.minimo ?? null)) continue;
      const l = t.listino.filter((y) => y.voce === v.voce && y.unita === v.unita && (!y.zona || String(y.zona).toLowerCase() === String(v.zona ?? '').toLowerCase()) && Number(y.scaglione_da ?? -1) === Number(v.scaglione_da ?? -1))[0];
      v.motivo = dal < giorno() ? `Vale all'indietro, dal ${dal.slice(8)}/${dal.slice(5, 7)}` : nuovo ? 'Cliente nuovo' : l && v.prezzo < l.prezzo ? `Sotto il listino (${l.prezzo} €)` : null;
      const doppia = t.tariffe.find((y) => stessa(y, v) && y.valida_dal === dal && y.stato === 'Da approvare');
      const w = doppia ? Object.assign(doppia, { prezzo: v.prezzo, minimo: v.minimo, motivo: v.motivo }) : (t.tariffe.push(v), v);
      if (r === 'direzione' || !w.motivo) { w.approvata_da = u; w.motivo = null; attiva(w); }
      storico('trasporti', 'Tariffe', `${cliNome(a.p_cliente)} · ${voce} ${v.prezzo} € dal ${dal.slice(8)}/${dal.slice(5, 7)}${w.stato === 'Attiva' ? '' : ' · da approvare: ' + w.motivo}`, u);
      n++;
    }
    return n;
  };
  rpc.approva_tariffa = (a, _t, u) => {
    if (ruolo(u) !== 'direzione') throw new Error('Approva solo la Direzione');
    const x = t.tariffe.find((y) => y.id === a.p_id); if (!x || x.stato !== 'Da approvare') throw new Error('Niente da approvare');
    x.approvata_da = u; if (a.p_ok) attiva(x); else x.stato = 'Rifiutata';
    storico('trasporti', 'Tariffe', `${x.voce} ${x.prezzo} € ${a.p_ok ? 'approvata' : 'rifiutata'}`, u);
  };

  // ------------------------------------------------------------------ fatture
  const ricalcola = (f: R) => {
    const R0 = t.righe_fattura.filter((r) => r.fattura_id === f.id);
    for (const r of R0) r.totale = r2(Number(r.quantita) * Number(r.prezzo));
    f.imponibile = r2(R0.reduce((s, r) => s + r.totale, 0));
    f.iva = r2(R0.reduce((s, r) => s + (r.margine || r.iva_natura ? 0 : r2(r.totale * Number(r.iva_aliquota ?? 22) / 100)), 0));
    f.totale = r2(f.imponibile + (f.split_payment ? 0 : f.iva));
  };
  const inFattura = (bid: string) => t.fatture_bolle.some((x) => x.bolla_id === bid && x.valida);
  const chiudiMese = (mese: string, u: string | null) => {
    const fine = new Date(Number(mese.slice(0, 4)), Number(mese.slice(5, 7)), 0); const fineIso = `${mese}-${String(fine.getDate()).padStart(2, '0')}`;
    const nuove = t.bolle.filter((b) => b.stato === 'Consegnata' && b.tipo !== 'Magazzino' && (b.data_consegna ?? '9') <= fineIso && !inFattura(b.id)
      && !t.giacenze.some((g) => g.bolla_id === b.id && !g.chiusa_il) && t.clienti.find((c) => c.id === b.cliente_id)?.azienda !== 'corporation');
    // deposito: bancali per giorni (italiani) dentro il mese, una volta per mese e cliente
    const inizio = new Date(`${mese}-01T00:00:00`); const dopo = new Date(inizio); dopo.setMonth(dopo.getMonth() + 1);
    const giorniDeposito = (cid: string) => t.bancali.filter((b) => b.cliente_id === cid).reduce((s, b) => {
      const da = new Date(Math.max(new Date(b.creato_il).setHours(0, 0, 0, 0), inizio.getTime()));
      const al = new Date(Math.min(b.uscito_il ? new Date(b.uscito_il).setHours(0, 0, 0, 0) : new Date().setHours(24, 0, 0, 0), dopo.getTime()));
      return s + Math.max(0, Math.round((al.getTime() - da.getTime()) / 86400000)); }, 0);
    const depositoFatturato = (cid: string, escludi?: string) => t.righe_fattura.some((r) => String(r.voce).startsWith('Deposito · ')
      && t.fatture.some((f) => f.id === r.fattura_id && f.id !== escludi && f.cliente_id === cid && f.periodo === mese && f.tipo === 'Fattura' && !['Annullata', 'Stornata'].includes(f.stato)));
    const conDeposito = t.clienti.filter((c) => c.azienda !== 'corporation' && giorniDeposito(c.id) > 0
      && !t.fatture.some((f) => f.cliente_id === c.id && f.periodo === mese && ['Inviata', 'Pagata'].includes(f.stato) && t.righe_fattura.some((r) => r.fattura_id === f.id && String(r.voce).startsWith('Deposito · ')))).map((c) => c.id);
    // stage: lo lavora la Corporation, lo fatturano i Trasporti (cliente con lo stesso nome o la stessa partita IVA)
    const clienteStage = (cid: string | null) => { const c = t.clienti.find((x) => x.id === cid); if (!c) return null; if (c.azienda !== 'corporation') return c.id;
      return c.fatturato_da ?? t.clienti.find((x) => x.azienda !== 'corporation' && x.stato !== 'Potenziale' && ((c.piva && x.piva === c.piva) || String(x.nome).toLowerCase() === String(c.nome).toLowerCase()))?.id ?? null; };
    const giornoIt = (iso: string) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
    const pcDa = () => t.stage_pc.filter((s) => s.cliente_id && !s.fattura_id && ['Formattato', 'In vendita'].includes(s.esito) && s.finito_il && giornoIt(s.finito_il) <= fineIso);
    const telDa = () => t.stage_telefoni.filter((s) => s.cliente_id && !s.fattura_id && s.chiuso_il && giornoIt(s.chiuso_il) <= fineIso);
    const senza = [...new Set([...pcDa(), ...telDa()].filter((s) => !clienteStage(s.cliente_id)).map((s) => t.clienti.find((c) => c.id === s.cliente_id)?.nome ?? '—'))];
    if (senza.length) throw new Error(`Stage da fatturare di ${senza.join(', ')}: manca il cliente in Clienti (stesso nome o stessa partita IVA)`);
    const conStage = [...pcDa(), ...telDa()].map((s) => clienteStage(s.cliente_id)!);
    const clienti = new Set([...nuove.map((b) => b.cliente_id), ...conDeposito, ...conStage,
      ...t.fatture.filter((f) => f.azienda === 'trasporti' && f.periodo === mese && f.tipo === 'Fattura' && APERTE.includes(f.stato) && [...t.stage_pc, ...t.stage_telefoni].some((s) => s.fattura_id === f.id)).map((f) => f.cliente_id),
      ...t.fatture.filter((f) => f.azienda === 'trasporti' && f.periodo === mese && f.tipo === 'Fattura' && APERTE.includes(f.stato) && t.fatture_bolle.some((x) => x.fattura_id === f.id && x.valida)).map((f) => f.cliente_id)]);
    let n = 0;
    for (const cid of clienti) {
      const c = t.clienti.find((x) => x.id === cid)!;
      let f = t.fatture.find((x) => x.azienda === 'trasporti' && x.cliente_id === cid && x.periodo === mese && x.tipo === 'Fattura' && APERTE.includes(x.stato));
      if (!f) { f = { id: crypto.randomUUID(), azienda: 'trasporti', tipo: 'Fattura', cliente_id: cid, periodo: mese, stato: 'Bozza', imponibile: 0, iva: 0, totale: 0, split_payment: !!c.split_payment, problema: null, numero: null, creata_il: ora() }; t.fatture.unshift(f); }
      for (const b of nuove.filter((b) => b.cliente_id === cid)) t.fatture_bolle.push({ fattura_id: f.id, bolla_id: b.id, valida: true });
      t.righe_fattura = t.righe_fattura.filter((r) => !(r.fattura_id === f!.id && String(r.voce).includes(' · consegne')));
      const gruppi: Record<string, R> = {}; const problemi: string[] = [];
      for (const fb of t.fatture_bolle.filter((x) => x.fattura_id === f!.id && x.valida)) {
        const b = bolla(fb.bolla_id)!;
        for (const r of calcola(b)) {
          if (r.problema) { problemi.push(`${b.numero ?? 'senza numero'}: ${r.problema}`); continue; }
          if (r.totale <= 0) continue;
          const k = r.voce + '|' + r.prezzo; gruppi[k] ??= { voce: `${r.voce} · consegne ${mese}`, quantita: 0, prezzo: r.prezzo }; gruppi[k].quantita += r.quantita;
        }
      }
      for (const g of Object.values(gruppi)) t.righe_fattura.push({ id: crypto.randomUUID(), fattura_id: f.id, ...g, quantita: r2(g.quantita), iva_aliquota: c.iva_aliquota ?? 22, iva_natura: c.iva_natura ?? null, margine: false });
      t.righe_fattura = t.righe_fattura.filter((r) => !(r.fattura_id === f!.id && String(r.voce).startsWith('Deposito · ')));
      const gg = giorniDeposito(cid);
      if (gg > 0 && !depositoFatturato(cid, f.id)) {
        const td = valida(cid, 'Deposito', fineIso, [], null, 0, null);
        if (td) t.righe_fattura.push({ id: crypto.randomUUID(), fattura_id: f.id, voce: `Deposito · bancali al giorno ${mese}`, quantita: gg, prezzo: Number(td.prezzo), iva_aliquota: c.iva_aliquota ?? 22, iva_natura: c.iva_natura ?? null, margine: false });
        else problemi.push(`deposito: ${gg} giorni di bancali senza tariffa Deposito`);
      }
      t.righe_fattura = t.righe_fattura.filter((r) => !(r.fattura_id === f!.id && String(r.voce).startsWith('Stage · ')));
      for (const s of [...t.stage_pc, ...t.stage_telefoni]) if (s.fattura_id === f.id) s.fattura_id = null;
      for (const [lista, voce, cosa] of [[pcDa(), 'Formattazione PC', 'PC formattati'], [telDa(), 'Lavorazione telefono', 'telefoni lavorati']] as [R[], string, string][]) {
        const miei = lista.filter((s) => clienteStage(s.cliente_id) === cid); if (!miei.length) continue;
        miei.forEach((s) => { s.fattura_id = f!.id; });
        const ts = valida(cid, voce, fineIso, [], null, miei.length, null);
        if (ts) t.righe_fattura.push({ id: crypto.randomUUID(), fattura_id: f.id, voce: `Stage · ${voce} ${mese}`, quantita: miei.length, prezzo: Number(ts.prezzo), iva_aliquota: c.iva_aliquota ?? 22, iva_natura: c.iva_natura ?? null, margine: false });
        else problemi.push(`stage: ${miei.length} ${cosa} senza tariffa «${voce}»`);
      }
      ricalcola(f);
      const tutti = [...new Set(problemi), ...manca(cid).map((m) => 'scheda cliente: manca ' + m)];
      if (!t.righe_fattura.some((r) => r.fattura_id === f!.id) && !tutti.length) { f.stato = 'Annullata'; f.motivo = 'Niente da fatturare'; continue; }
      f.problema = tutti.length ? tutti.slice(0, 5).join('; ') + (tutti.length > 5 ? ` e altri ${tutti.length - 5}` : '') : null;
      f.stato = tutti.length ? 'Da controllare' : 'Pronta';
      n++;
    }
    storico('trasporti', 'Fatture', `Chiusura di ${mese}: ${n} fatture preparate`, u);
    return n;
  };
  rpc.chiudi_mese = (a, _t, u) => {
    const r = ruolo(u); if (r !== 'amministrazione' && r !== 'direzione') throw new Error('La chiusura del mese la fa l\'amministrazione');
    if (!/^\d{4}-\d{2}$/.test(a.p_mese)) throw new Error('Mese non valido');
    return chiudiMese(a.p_mese, u);
  };
  rpc.ricontrolla_fattura = (a, _t, u) => {
    const f = t.fatture.find((x) => x.id === a.p_fattura); if (!f || !APERTE.includes(f.stato)) throw new Error('Si ricontrolla solo una fattura non ancora inviata');
    if (!t.fatture_bolle.some((x) => x.fattura_id === f.id && x.valida)) { const m = manca(f.cliente_id); f.problema = m.length ? m.map((x) => 'scheda cliente: manca ' + x).join('; ') : null; return f.problema; }
    chiudiMese(f.periodo, u); return f.problema;
  };
  const liberaBolle = (f: R) => { for (const fb of t.fatture_bolle.filter((x) => x.fattura_id === f.id)) { fb.valida = false; const b = bolla(fb.bolla_id); if (b?.stato === 'Fatturata') b.stato = 'Consegnata'; }
    for (const s of [...t.stage_pc, ...t.stage_telefoni]) if (s.fattura_id === f.id) s.fattura_id = null; };
  rpc.annulla_fattura = (a, _t, u) => {
    const f = t.fatture.find((x) => x.id === a.p_fattura); if (!f) throw new Error('Fattura non trovata');
    if (!APERTE.includes(f.stato)) throw new Error(`Passaggio non permesso: ${f.stato} → Annullata`);
    if (!String(a.p_motivo ?? '').trim()) throw new Error('Scrivi perché annulli la fattura');
    f.stato = 'Annullata'; f.motivo = String(a.p_motivo).trim(); liberaBolle(f);
    storico(f.azienda, 'Fatture', `Fattura annullata · ${f.motivo}`, u);
  };
  rpc.nota_di_credito = (a, _t, u) => {
    const f = t.fatture.find((x) => x.id === a.p_fattura); if (!f) throw new Error('Fattura non trovata');
    if (f.tipo !== 'Fattura' || f.stato !== 'Inviata') throw new Error('La nota di credito si fa su una fattura inviata e non ancora pagata');
    if (!String(a.p_motivo ?? '').trim()) throw new Error('Scrivi il motivo della nota di credito');
    if (t.fatture.some((x) => x.rif_fattura === f.id && x.stato !== 'Annullata')) throw new Error('C\'è già una nota di credito per questa fattura');
    const nc: R = { id: crypto.randomUUID(), azienda: f.azienda, tipo: 'Nota di credito', rif_fattura: f.id, cliente_id: f.cliente_id, periodo: f.periodo, stato: 'Bozza', split_payment: f.split_payment, motivo: String(a.p_motivo).trim(), problema: null, numero: null, creata_il: ora() };
    t.fatture.unshift(nc);
    for (const r of t.righe_fattura.filter((r) => r.fattura_id === f.id)) t.righe_fattura.push({ ...r, id: crypto.randomUUID(), fattura_id: nc.id });
    ricalcola(nc); storico(f.azienda, 'Fatture', `Nota di credito per ${f.numero} · ${nc.motivo}`, u);
    return nc.id;
  };
  // regole del database sulle fatture (trigger fatture_regole)
  regole.fatture = (a, b, _t, u) => {
    if (!a) { Object.assign(b, { stato: 'Bozza', imponibile: 0, iva: 0, totale: 0, numero: null, tipo: b.tipo ?? 'Fattura', creata_il: ora(), problema: null,
      split_payment: !!t.clienti.find((c) => c.id === b.cliente_id)?.split_payment, periodo: b.periodo ?? giorno().slice(0, 7) }); return; }
    if (['imponibile', 'iva', 'totale'].some((k) => k in b && b[k] !== a[k])) throw new Error('Gli importi li calcola il programma dalle righe');
    if (a.stato === b.stato) return;
    const ok = (a.stato === 'Bozza' && ['Da controllare', 'Pronta'].includes(b.stato)) || (a.stato === 'Da controllare' && ['Bozza', 'Pronta'].includes(b.stato))
      || (a.stato === 'Pronta' && ['Bozza', 'Da controllare'].includes(b.stato)) || (a.stato === 'Inviata' && b.stato === 'Pagata');
    if (b.stato === 'Inviata') throw new Error('Inviata la segna il programma quando Fatture in Cloud conferma l\'invio: premi «Invia»');
    if (!ok) throw new Error(`Passaggio non permesso: ${a.stato} → ${b.stato}`);
    if (b.stato === 'Pronta') {
      if (b.problema) throw new Error('Fattura da controllare: ' + b.problema);
      if (!t.righe_fattura.some((r) => r.fattura_id === b.id) || Number(b.imponibile) <= 0) throw new Error('Fattura senza righe o a zero: niente da inviare');
      const m = manca(b.cliente_id); if (m.length) throw new Error('Nella scheda del cliente manca: ' + m.join(', '));
      b.approvata_da = u;
    }
    if (b.stato === 'Pagata') b.pagata_il ??= giorno();
  };
  regole.righe_fattura = (a, b) => {
    const f = t.fatture.find((x) => x.id === b.fattura_id);
    if (!f || !APERTE.includes(f.stato)) throw new Error('Fattura inviata o annullata: le righe non si toccano');
    if (!a) { const c = t.clienti.find((x) => x.id === f.cliente_id); b.iva_aliquota = c?.iva_aliquota ?? 22; b.iva_natura = c?.iva_natura ?? null; b.margine = false; }
    b.totale = r2(Number(b.quantita ?? 1) * Number(b.prezzo ?? 0));
    if (f.stato === 'Pronta') f.stato = 'Bozza';   // una riga cambiata: la fattura va riguardata
  };
  // Fatture in Cloud: «Inviata» solo dopo la sua risposta; esiti dello SdI
  funzioni['fatture-in-cloud'] = (c, _t, u) => {
    if (c.azione === 'esiti') {
      let aggiornate = 0;
      for (const f of t.fatture.filter((x) => x.stato === 'Inviata' && (x.sdi_esito ?? 'Inviata allo SdI') === 'Inviata allo SdI')) { f.sdi_esito = 'Consegnata'; f.sdi_esito_il = ora(); aggiornate++; }
      return { controllate: aggiornate, aggiornate, scartate: 0 };
    }
    const f = t.fatture.find((x) => x.id === c.fattura_id);
    if (!f) throw new Error('Fattura non trovata');
    if (f.stato !== 'Pronta') throw new Error(`Fattura «${f.stato}»: si invia solo quando è Pronta`);
    if (!t.righe_fattura.some((r) => r.fattura_id === f.id)) throw new Error('La fattura non ha righe');
    const m = manca(f.cliente_id); if (m.length) throw new Error('Nella scheda del cliente manca: ' + m.join(', '));
    const anno = new Date().getFullYear();
    const ultimo = Math.max(117, ...t.fatture.map((x) => Number(String(x.numero ?? '').match(/\/(\d+)$/)?.[1] ?? 0)));
    Object.assign(f, { stato: 'Inviata', numero: f.numero ?? `${f.tipo === 'Nota di credito' ? 'NC' : 'FT'} ${anno}/${String(ultimo + 1).padStart(3, '0')}`, data: giorno(), inviata_il: ora(), approvata_da: u,
      fic_id: f.fic_id ?? 'FIC-' + Math.floor(Math.random() * 900000 + 100000), sdi_inviata_il: ora(), sdi_esito: 'Inviata allo SdI', sdi_esito_il: ora(), pdf: `fatture/${f.azienda}/${f.id}.pdf` });
    if (f.tipo === 'Fattura') for (const fb of t.fatture_bolle.filter((x) => x.fattura_id === f.id && x.valida)) { const b = bolla(fb.bolla_id); if (b?.stato === 'Consegnata') b.stato = 'Fatturata'; }
    if (f.tipo === 'Nota di credito' && f.rif_fattura) { const o = t.fatture.find((x) => x.id === f.rif_fattura); if (o?.stato === 'Inviata') { o.stato = 'Stornata'; liberaBolle(o); } }
    storico(f.azienda, 'Fatture', `${f.tipo} ${f.numero}: Pronta → Inviata`, null);
    return { numero: f.numero };
  };

  // ------------------------------------------------------------------ preventivi
  const commerciale = (u: string | null) => { const r = ruolo(u); if (r !== 'commerciale' && r !== 'direzione') throw new Error('I preventivi li fa il commerciale'); };
  const prev = (id: string) => t.preventivi.find((x) => x.id === id);
  regole.preventivi = (a, b, _t, u) => {
    if (!a) { const n = Math.max(0, ...t.preventivi.map((x) => Number(String(x.numero ?? '').slice(4)) || 0)) + 1;
      Object.assign(b, { numero: `P${giorno().slice(2, 4)}-${String(n).padStart(4, '0')}`, stato: 'Bozza', creato_il: ora(), creato_da: u, origine: b.origine ?? 'Manuale', motivo: null, valido_fino: null }); return; }
    if (['stato', 'inviato_il', 'valido_fino', 'approvato_da', 'tariffe_dal', 'chiuso_il', 'numero'].some((k) => k in b && b[k] !== a[k]) ) throw new Error('Lo stato del preventivo si cambia con i tasti');
    if (a.stato !== 'Bozza') throw new Error('Il preventivo non è più in bozza');
  };
  regole.preventivi_righe = (_a, b) => { if (prev(b.preventivo_id)?.stato !== 'Bozza') throw new Error('Il preventivo non è più in bozza: i prezzi non si cambiano'); };
  rpc.nuovo_potenziale = (a, _t, u) => {
    commerciale(u); if (!String(a.p_nome ?? '').trim()) throw new Error('Serve il nome');
    const c = t.clienti.find((x) => (x.email && x.email.toLowerCase() === String(a.p_email ?? '').toLowerCase()) || x.nome.toLowerCase() === String(a.p_nome).trim().toLowerCase());
    if (c) return c.id;
    const n = { id: crypto.randomUUID(), nome: String(a.p_nome).trim(), email: String(a.p_email ?? '').toLowerCase() || null, telefono: a.p_telefono ?? null, stato: 'Potenziale', iva_aliquota: 22, split_payment: false, portale_live: false };
    t.clienti.push(n); return n.id;
  };
  rpc.invia_preventivo = (a, _t, u) => {
    commerciale(u); const p = prev(a.p_id); if (!p || p.stato !== 'Bozza') throw new Error('Si invia solo un preventivo in bozza');
    const R0 = t.preventivi_righe.filter((r) => r.preventivo_id === p.id); if (!R0.length) throw new Error('Il preventivo non ha prezzi');
    const c = t.clienti.find((x) => x.id === p.cliente_id)!;
    const sotto = R0.flatMap((r) => { const l = t.listino.find((y) => y.voce === r.voce && y.unita === r.unita && (!y.zona || String(y.zona).toLowerCase() === String(r.zona ?? '').toLowerCase()) && Number(y.scaglione_da ?? -1) === Number(r.scaglione_da ?? -1));
      return l && Number(r.prezzo) < l.prezzo ? [`${r.voce} ${Number(r.prezzo).toFixed(2)} € (listino ${Number(l.prezzo).toFixed(2)} €)`] : []; });
    if (ruolo(u) !== 'direzione' && (c.stato === 'Potenziale' || sotto.length)) {
      Object.assign(p, { stato: 'Da approvare', motivo: [c.stato === 'Potenziale' && 'Cliente nuovo', sotto.length && 'Sotto il listino: ' + sotto.join(', ')].filter(Boolean).join('; ') });
      storico('trasporti', 'Preventivi', `${p.numero} · ${c.nome} · alla Direzione`, u); return 'Da approvare';
    }
    Object.assign(p, { stato: 'Approvato', approvato_da: u, motivo: null }); return 'Approvato';
  };
  rpc.approva_preventivo = (a, _t, u) => {
    if (ruolo(u) !== 'direzione') throw new Error('Approva solo la Direzione');
    const p = prev(a.p_id); if (!p || p.stato !== 'Da approvare') throw new Error('Niente da approvare');
    if (!a.p_ok && !String(a.p_motivo ?? '').trim()) throw new Error('Scrivi al commerciale cosa cambiare');
    Object.assign(p, a.p_ok ? { stato: 'Approvato', approvato_da: u, motivo: null } : { stato: 'Bozza', motivo: String(a.p_motivo).trim() });
    storico('trasporti', 'Preventivi', `${p.numero} ${a.p_ok ? 'approvato' : 'da rivedere: ' + p.motivo}`, u);
  };
  rpc.preventivo_inviato = (a, _t, u) => {
    commerciale(u); const p = prev(a.p_id); if (!p || p.stato !== 'Approvato') throw new Error('Il preventivo non è ancora approvato');
    Object.assign(p, { stato: 'Inviato', inviato_il: ora(), valido_fino: giorno(30) }); storico('trasporti', 'Preventivi', `${p.numero} inviato al cliente`, u);
  };
  rpc.accetta_preventivo = (a, _t, u) => {
    commerciale(u); const p = prev(a.p_id); if (!p || p.stato !== 'Inviato') throw new Error('Si accetta solo un preventivo inviato');
    if (p.valido_fino < giorno()) throw new Error(`Preventivo scaduto il ${p.valido_fino.slice(8)}/${p.valido_fino.slice(5, 7)}: rifallo con i prezzi di oggi`);
    if (!String(a.p_risposta ?? '').trim()) throw new Error('Allega la risposta del cliente (mail o documento firmato)');
    if (!a.p_dal || a.p_dal < giorno()) throw new Error('Le tariffe nuove valgono da oggi in poi');
    const c = t.clienti.find((x) => x.id === p.cliente_id)!; if (c.stato === 'Potenziale') c.stato = 'Attivo';
    const ieri = giorno(Math.round((new Date(a.p_dal).getTime() - new Date(giorno()).getTime()) / 86400000) - 1);
    for (const x of t.tariffe.filter((x) => x.cliente_id === c.id && ['Attiva', 'Da approvare'].includes(x.stato))) {
      if (x.valida_dal < a.p_dal && x.stato === 'Attiva') { if (!x.valida_al || x.valida_al >= a.p_dal) x.valida_al = ieri; }
      else { x.stato = 'Rifiutata'; x.motivo = 'Sostituita dal preventivo ' + p.numero; }
    }
    for (const r of t.preventivi_righe.filter((r) => r.preventivo_id === p.id))
      t.tariffe.push({ id: crypto.randomUUID(), cliente_id: c.id, voce: r.voce, unita: r.unita, prezzo: Number(r.prezzo), minimo: r.minimo ?? null, zona: r.zona ?? null, quando: r.quando ?? null,
        scaglione_su: r.scaglione_su ?? null, scaglione_da: r.scaglione_da ?? null, scaglione_a: r.scaglione_a ?? null, valida_dal: a.p_dal, valida_al: null, stato: 'Attiva', approvata_da: p.approvato_da ?? u, motivo: null });
    Object.assign(p, { stato: 'Accettato', risposta: String(a.p_risposta).trim(), tariffe_dal: a.p_dal, chiuso_il: ora() });
    storico('trasporti', 'Preventivi', `${p.numero} accettato: tariffe dal ${a.p_dal.slice(8)}/${a.p_dal.slice(5, 7)}`, u);
  };
  rpc.rifiuta_preventivo = (a, _t, u) => {
    commerciale(u); const p = prev(a.p_id); if (!p || !['Inviato', 'Approvato', 'Bozza', 'Da approvare'].includes(p.stato)) throw new Error('Preventivo già chiuso');
    if (!String(a.p_motivo ?? '').trim()) throw new Error('Scrivi perché il cliente ha detto no');
    Object.assign(p, { stato: 'Rifiutato', motivo: String(a.p_motivo).trim(), chiuso_il: ora() });
  };
  // un potenziale non riceve bolle
  const bolleBase = regole.bolle;
  regole.bolle = (a, b, x, u) => { if (!a && t.clienti.find((c) => c.id === b.cliente_id)?.stato === 'Potenziale') throw new Error('Cliente ancora potenziale: prima si accetta il preventivo'); bolleBase?.(a, b, x, u);
    if (!a) b.operatore_id = operatoreBolle(t, u, b.operatore_id); };   // divisa nell'ufficio bolle, come bolle_assegna

  // ------------------------------------------------------------------ richieste delle aziende (Corporation)
  const assegna = () => t.profili.filter((p) => p.azienda === 'corporation' && p.ruolo === 'vendite')
    .sort((x, y) => t.richieste_aziende.filter((r) => r.assegnata_a === x.id && r.stato === 'Aperta').length - t.richieste_aziende.filter((r) => r.assegnata_a === y.id && r.stato === 'Aperta').length)[0]?.id ?? null;
  regole.richieste_aziende = (a, b) => {
    if (!a) { const n = Math.max(0, ...t.richieste_aziende.map((x) => Number(String(x.numero ?? '').slice(4)) || 0)) + 1;
      Object.assign(b, { numero: `R${giorno().slice(2, 4)}-${String(n).padStart(4, '0')}`, stato: 'Aperta', creata_il: ora(), assegnata_a: assegna(), preventivo_il: null, chiusa_il: null }); return; }
    if (['stato', 'preventivo_il', 'preventivo_eur', 'chiusa_il', 'numero'].some((k) => k in b && b[k] !== a[k])) throw new Error('Lo stato della richiesta si cambia con i tasti');
  };
  const vendite = (u: string | null) => { const r = ruolo(u); if (r !== 'vendite' && r !== 'direzione') throw new Error('Non autorizzato'); };
  rpc.richiesta_preventivo_inviato = (a, _t, u) => {
    vendite(u); if (!(Number(a.p_importo) > 0)) throw new Error('Scrivi l\'importo del preventivo');
    const r = t.richieste_aziende.find((x) => x.id === a.p_id); if (!r || !['Aperta', 'Preventivo inviato'].includes(r.stato)) throw new Error('Richiesta già chiusa');
    Object.assign(r, { stato: 'Preventivo inviato', preventivo_il: ora(), preventivo_eur: Number(a.p_importo) });
  };
  rpc.chiudi_richiesta = (a, _t, u) => {
    vendite(u); const r = t.richieste_aziende.find((x) => x.id === a.p_id); if (!r || ['Vinta', 'Persa'].includes(r.stato)) throw new Error('Richiesta già chiusa');
    if (!r.preventivo_il) throw new Error('Prima si manda il preventivo: una richiesta non si chiude senza risposta');
    if (!a.p_vinta && !String(a.p_esito ?? '').trim()) throw new Error('Scrivi perché è persa');
    Object.assign(r, { stato: a.p_vinta ? 'Vinta' : 'Persa', chiusa_il: ora(), esito: String(a.p_esito ?? '').trim() || null });
  };
  // moduli dei siti: oltre alla mail, il preventivo (Trasporti) e la richiesta dell'azienda (negozio)
  const sito = funzioni['richiesta-sito'];
  funzioni['richiesta-sito'] = (c, x, u) => {
    const d = c?.dettagli ?? {}; const q = Math.floor(Number(d.quantita)); const modello = String(d.modello ?? '').trim();
    if (c?.tipo === 'aziende' && !String(c.sito_web ?? '').trim()) {
      if (!String(c.azienda ?? '').trim()) throw new Error('Scrivi il nome dell\'azienda');
      if (!modello) throw new Error('Scrivi il modello che cercate');
      if (!(q >= 1 && q <= 5000)) throw new Error('Scrivi quanti pezzi vi servono');
      if (c.privacy !== true) throw new Error('Serve la presa visione dell\'informativa privacy');
    }
    const r = sito(c, x, u);
    if (String(c?.sito_web ?? '').trim()) return r;
    const testo = t.mail[0]?.testo ?? '';
    if (c?.sito === 'trasporti' && c?.tipo === 'preventivo') {
      const nome = String(c.azienda || c.nome).trim(); const email = String(c.email).toLowerCase();
      let cl = t.clienti.find((k) => (k.email && k.email.toLowerCase() === email) || k.nome.toLowerCase() === nome.toLowerCase());
      if (!cl) { cl = { id: crypto.randomUUID(), nome, email, telefono: c.telefono || null, stato: 'Potenziale', iva_aliquota: 22, split_payment: false, portale_live: false }; t.clienti.push(cl); }
      const n = Math.max(0, ...t.preventivi.map((k) => Number(String(k.numero ?? '').slice(4)) || 0)) + 1;
      t.preventivi.unshift({ id: crypto.randomUUID(), numero: `P${giorno().slice(2, 4)}-${String(n).padStart(4, '0')}`, cliente_id: cl.id, modello: 'Distribuzione', origine: 'Sito', stato: 'Bozza', richiesta: testo, creato_il: ora(), mail_id: t.mail[0]?.id });
    }
    if (c?.tipo === 'aziende') {
      const n = Math.max(0, ...t.richieste_aziende.map((k) => Number(String(k.numero ?? '').slice(4)) || 0)) + 1;
      t.richieste_aziende.unshift({ id: crypto.randomUUID(), numero: `R${giorno().slice(2, 4)}-${String(n).padStart(4, '0')}`, azienda_cliente: String(c.azienda).trim(), referente: c.nome, email: String(c.email).toLowerCase(),
        telefono: c.telefono || null, modello, grado: ['A', 'B', 'C', 'D'].includes(d.grado) ? d.grado : 'Indifferente', quantita: q, note: c.note || null, origine: 'Negozio', stato: 'Aperta', assegnata_a: assegna(), creata_il: ora() });
    }
    return r;
  };

  // ------------------------------------------------------------------ viste
  viste.push((x) => {
    for (const f of x.fatture) { if (APERTE.includes(f.stato)) ricalcola(f); f.totale ??= r2(Number(f.imponibile) + Number(f.iva ?? 0)); }
    x.richieste_da_sollecitare = x.richieste_aziende.filter((r) => r.stato === 'Aperta' && Date.now() - new Date(r.creata_il).getTime() > 4 * 3600000);
    const inc = x.incassi_trasporti[0];
    if (inc) {
      const consegnate = x.bolle.filter((b) => ['Consegnata', 'Giacenza', 'Non consegnata', 'Fatturata'].includes(b.stato));
      const val = (b: R) => calcola(b).reduce((s, r) => s + r.totale, 0);
      inc.fatturato_oggi = r2(consegnate.filter((b) => b.data_consegna === giorno()).reduce((s, b) => s + val(b), 0));
      inc.fatturato_mese = r2(consegnate.filter((b) => (b.data_consegna ?? '').startsWith(giorno().slice(0, 7))).reduce((s, b) => s + val(b), 0) + 18240);
      inc.incassato_mese = r2(x.fatture.filter((f) => f.stato === 'Pagata' && f.azienda === 'trasporti' && (f.pagata_il ?? '').startsWith(giorno().slice(0, 7)))
        .reduce((s, f) => s + (f.tipo === 'Nota di credito' ? -1 : 1) * Number(f.totale ?? 0), 0) + 9600);
    }
  });
});
