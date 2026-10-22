// Prova dell'App Messina (telefoni): le funzioni del database rifatte sui dati finti,
// con gli stessi controlli e gli stessi messaggi di supabase/migrations (0600, 0800, 0900, 1200).
import { estendiProva } from './prova';
import type { Tabelle } from './index';

const oggi = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };   // giorno in Italia
const ora = () => new Date().toISOString();

estendiProva(({ t, rpc, funzioni }) => {
  // ---------------------------------------------------------- dati in più per le app
  t.impostazioni ??= [{ chiave: 'soglia_nitidezza', valore: 35 }];
  t.badge_usati ??= [];
  // una spedizione da caricare (Uscita) e una bolla da mettere a posto (Entrata)
  t.giri.push({ id: 'giro2', data: oggi(), mezzo_id: 'm2', autista_id: 'd-a2', zona: 'Milano Nord', stato: 'Preparato', confermato_il: t.giri[0]?.confermato_il ?? null, confermato_da: 'u-tra', da_confermare: [] });
  t.bolle.push({ id: 'b-0050', numero: '26-000047', cliente_id: 'c-snam', tipo: 'Consegna', data_consegna: oggi(), fascia: 'Entro le 12', destinatario: 'Snam', indirizzo: 'Via [indirizzo]', citta: 'Sesto',
    colli_previsti: 4, accessori: ['Sponda'], dati_mancanti: [], stato: 'Confermata', operatore_id: 'u-bol', creata_il: ora(), note: null, mail_id: null });
  t.bolle.push({ id: 'b-0051', numero: '26-000048', cliente_id: 'c-snam', tipo: 'Magazzino', data_consegna: oggi(), fascia: null, destinatario: 'Messina', indirizzo: 'Lacchiarella', citta: 'Lacchiarella',
    colli_previsti: 4, accessori: [], dati_mancanti: [], stato: 'Confermata', operatore_id: 'u-bol', creata_il: ora(), note: null, mail_id: null });
  ['p3-2-1', 'p3-2-1', 'p3-2-2', 'p3-2-2'].forEach((p, i) => t.colli.push({ id: crypto.randomUUID(), bolla_id: 'b-0050', codice: `C50-00${i + 1}`, posto_id: p, letto_entrata: ora(), letto_carico: null, letto_consegna: null }));
  for (let i = 1; i <= 4; i++) t.colli.push({ id: crypto.randomUUID(), bolla_id: 'b-0051', codice: `C51-00${i}`, posto_id: null, letto_entrata: null, letto_carico: null, letto_consegna: null });
  t.fermate.push({ id: 'f-0050', giro_id: 'giro2', bolla_id: 'b-0050', ordine: 1, esito: 'Da fare', motivo: null, dopo: null, firmata: false, foto_bolla: null, nitidezza: null, chiusa_il: null });
  t.bolle.filter((b) => ['b-0006', 'b-0007'].includes(b.id)).forEach((b) => { b.note = b.id === 'b-0007' ? 'Chiamare prima' : null; });

  // ---------------------------------------------------------- aiuti
  const dip = (u: string | null) => t.dipendenti.find((d) => d.profilo_id === u) ?? null;
  const ruolo = (u: string | null) => t.profili.find((p) => p.id === u)?.ruolo;
  const azienda = (u: string | null) => t.profili.find((p) => p.id === u)?.azienda;
  const nome = (u: string | null) => t.profili.find((p) => p.id === u)?.nome ?? 'Tu';
  const cli = (id: string) => t.clienti.find((c) => c.id === id)?.nome ?? '—';
  const posto = (id: string | null | undefined) => t.posti.find((p) => p.id === id)?.codice ?? null;
  const registra = (u: string | null, operazione: string, cosa: string, dove: string | null, az = 'trasporti') =>
    t.storico.unshift({ id: Date.now() + Math.random(), quando: ora(), azienda: az, chi_nome: nome(u), operazione, cosa, dove, come: 'Pistola' });
  const magazzino = (u: string | null) => { if (!(azienda(u) === 'trasporti' && ruolo(u) === 'magazzino')) throw new Error('Non autorizzato'); };
  const fermataMia = (id: string, u: string | null) => {
    const f = t.fermate.find((x) => x.id === id); const g = f && t.giri.find((x) => x.id === f.giro_id);
    if (!f || !g || g.autista_id !== dip(u)?.id) throw new Error('Fermata non tua');
    if (f.esito !== 'Da fare') throw new Error('Fermata già chiusa');
    return f;
  };
  const bloccato = (pid: string | null | undefined) => !!pid && t.missioni_posti.some((m) => m.posto_id === pid && m.stato === 'Bloccato');
  const libero = (p: Record<string, any>) => p.attivo && p.zona === 'Scaffale' && !t.bancali.some((b) => b.posto_id === p.id && !b.uscito_il)
    && !t.colli.some((k) => k.posto_id === p.id && !k.letto_carico) && !bloccato(p.id);
  const proposto = (cliente: string | null) => {
    const sc = (s: number) => t.bancali.filter((b) => b.cliente_id === cliente && !b.uscito_il && t.posti.find((p) => p.id === b.posto_id)?.scaffale === s).length;
    return [...t.posti].filter(libero).sort((a, b) => sc(b.scaffale) - sc(a.scaffale) || a.piano - b.piano || a.scaffale - b.scaffale || a.numero - b.numero)[0]?.codice ?? null;
  };
  const clienteCodice = (c: string) => t.bancali.find((b) => b.codice === c)?.cliente_id ?? t.bolle.find((b) => b.id === t.colli.find((k) => k.codice === c)?.bolla_id)?.cliente_id ?? null;
  const contaColli = (bolla: string) => { const c = t.colli.filter((k) => k.bolla_id === bolla); return { totale: c.length, messi: c.filter((k) => k.posto_id && k.letto_entrata).length }; };

  // ---------------------------------------------------------- autisti
  rpc.mio_giro_oggi = (a, t2, u) => {
    const d = dip(u); if (!d || ruolo(u) !== 'autista') throw new Error('Solo per gli autisti');
    const g = t.giri.find((x) => x.autista_id === d.id && x.data === oggi()); if (!g) return null;
    const m = t.mezzi.find((x) => x.id === g.mezzo_id);
    return { giro: { id: g.id, data: g.data, zona: g.zona, stato: g.stato }, mezzo: m ? { tipo: m.tipo, sponda: m.sponda, targa: m.targa } : null,
      fermate: t.fermate.filter((f) => f.giro_id === g.id).sort((x, y) => x.ordine - y.ordine).map((f) => { const b = t.bolle.find((x) => x.id === f.bolla_id)!;
        return { id: f.id, ordine: f.ordine, esito: f.esito, motivo: f.motivo ?? null, dopo: f.dopo ?? null, firmata: !!f.firmata, foto: !!f.foto_bolla, riserva: f.riserva ?? null,
          numero: b.numero, tipo: b.tipo, destinatario: b.destinatario, indirizzo: b.indirizzo, citta: b.citta, fascia: b.fascia, note: b.note ?? null, colli: b.colli_previsti,
          letti: t.colli.filter((k) => k.bolla_id === b.id && k.letto_consegna).length, accessori: b.accessori,
          extra: t.accessori_extra.filter((x) => x.fermata_id === f.id).map((x) => x.voce) }; }) };
  };
  rpc.accessori_possibili = (a, t2, u) => { const f = fermataMia(a.p_fermata, u); const b = t.bolle.find((x) => x.id === f.bolla_id)!;
    return [...new Set(t.tariffe.filter((x) => x.cliente_id === b.cliente_id && !['Base', 'Giacenza', 'Riconsegna'].includes(x.voce)).map((x) => x.voce))].sort(); };
  rpc.scansiona_consegna = (a, t2, u) => { const f = fermataMia(a.p_fermata, u);
    const k = t.colli.find((x) => x.bolla_id === f.bolla_id && x.codice === a.p_codice); if (!k) throw new Error('Questo collo non è di questa consegna');
    k.letto_consegna ??= ora(); const c = t.colli.filter((x) => x.bolla_id === f.bolla_id); return { letti: c.filter((x) => x.letto_consegna).length, totale: c.length }; };
  rpc.aggiungi_accessorio = (a, t2, u) => { const f = fermataMia(a.p_fermata, u); const b = t.bolle.find((x) => x.id === f.bolla_id)!;
    if (a.p_voce === 'Base' || !t.tariffe.some((x) => x.cliente_id === b.cliente_id && x.voce === a.p_voce)) throw new Error('Accessorio non previsto per questo cliente: avvisa l\'ufficio');
    if (!t.accessori_extra.some((x) => x.fermata_id === f.id && x.voce === a.p_voce)) t.accessori_extra.push({ id: crypto.randomUUID(), fermata_id: f.id, voce: a.p_voce, aggiunto_il: ora(), lat: a.p_lat, lng: a.p_lng }); };
  rpc.firma_fermata = (a, t2, u) => { fermataMia(a.p_fermata, u).firmata = true; };
  rpc.foto_bolla = (a, t2, u) => { const f = fermataMia(a.p_fermata, u);
    if (!String(a.p_percorso).startsWith(`bolle/${a.p_fermata}/`)) throw new Error('Percorso della foto non valido');
    const soglia = Number(t.impostazioni.find((x) => x.chiave === 'soglia_nitidezza')?.valore ?? 35);
    if (a.p_nitidezza < soglia) return { ok: false, motivo: 'Rifai', nitidezza: a.p_nitidezza, soglia };
    f.foto_bolla = a.p_percorso; f.nitidezza = a.p_nitidezza; return { ok: true, nitidezza: a.p_nitidezza, soglia }; };
  rpc.chiudi_fermata = (a, t2, u) => {
    const f = fermataMia(a.p_fermata, u); const b = t.bolle.find((x) => x.id === f.bolla_id)!;
    if (!['Confermata', 'In giro'].includes(b.stato)) throw new Error('La bolla non è in consegna');
    if (a.p_consegnata) {
      const c = t.colli.filter((x) => x.bolla_id === b.id), letti = c.filter((x) => x.letto_consegna).length;
      if (!b.colli_previsti || c.length !== b.colli_previsti || letti !== b.colli_previsti) throw new Error(`Consegna bloccata: ${letti} colli su ${b.colli_previsti ?? 0} scansionati`);
      if (!f.firmata) throw new Error('Consegna bloccata: manca la firma');
      if (!f.foto_bolla) throw new Error('Consegna bloccata: manca la foto della bolla');
      f.esito = 'Consegnata'; b.stato = 'Consegnata';
    } else {
      if (!String(a.p_motivo ?? '').trim() || !a.p_dopo) throw new Error('Serve il motivo e cosa succede alla merce');
      f.esito = 'Non consegnata'; f.motivo = a.p_motivo; f.dopo = a.p_dopo; b.stato = a.p_dopo === 'Giacenza' ? 'Giacenza' : 'Non consegnata';
      if (a.p_dopo === 'Giacenza' && !t.giacenze.some((x) => x.bolla_id === b.id && !x.chiusa_il)) t.giacenze.push({ id: crypto.randomUUID(), bolla_id: b.id, motivo: a.p_motivo, dal: oggi(), riconsegna_il: null, chiusa_il: null });
    }
    f.lat = a.p_lat; f.lng = a.p_lng; f.chiusa_il = ora();
  };
  rpc.riprova_dopo = (a, t2, u) => { const f = fermataMia(a.p_fermata, u); if (!String(a.p_motivo ?? '').trim()) throw new Error('Serve il motivo');
    f.ordine = Math.max(...t.fermate.filter((x) => x.giro_id === f.giro_id).map((x) => x.ordine)) + 1; f.motivo = a.p_motivo; };

  // ---------------------------------------------------------- magazzino
  rpc.posto_proposto = (a, t2, u) => {
    if (!['magazzino', 'vendite', 'stage'].includes(ruolo(u) ?? '')) throw new Error('Non autorizzato');
    return proposto(azienda(u) === 'trasporti' ? clienteCodice(a.p_codice ?? '') : t.clienti.find((c) => c.azienda_collegata === azienda(u))?.id ?? null);
  };
  rpc.info_codice = (a, t2, u) => { magazzino(u);
    const b = t.bancali.find((x) => x.codice === a.p_codice && !x.uscito_il);
    if (b) return { tipo: 'bancale', codice: b.codice, cliente: cli(b.cliente_id), posto: posto(b.posto_id), proposto: proposto(b.cliente_id) };
    const k = t.colli.find((x) => x.codice === a.p_codice); if (!k) throw new Error(`Codice sconosciuto: ${a.p_codice}`);
    const bo = t.bolle.find((x) => x.id === k.bolla_id)!;
    return { tipo: 'collo', codice: k.codice, bolla_id: bo.id, numero: bo.numero, cliente: cli(bo.cliente_id), ...contaColli(bo.id), posto: posto(k.posto_id), proposto: proposto(bo.cliente_id) };
  };
  rpc.metti_a_posto = (a, t2, u) => { magazzino(u);
    const p = t.posti.find((x) => x.codice === a.p_posto && x.attivo); if (!p) throw new Error(`Posto ${a.p_posto} inesistente`);
    const b = t.bancali.find((x) => x.codice === a.p_codice && !x.uscito_il);
    if (bloccato(p.id) || (b && bloccato(b.posto_id))) throw new Error('Posto bloccato da una missione: prima lo sblocca l\'ufficio');
    if (b) { const da = posto(b.posto_id); b.posto_id = p.id; t.colli.filter((k) => k.bancale_id === b.id).forEach((k) => { k.posto_id = p.id; }); registra(u, 'Trasferimento', b.codice, `${da ?? '—'} → ${p.codice}`); return { bancale: b.codice, posto: p.codice }; }
    const k = t.colli.find((x) => x.codice === a.p_codice); if (!k) throw new Error(`Codice sconosciuto: ${a.p_codice}`);
    if (bloccato(k.posto_id)) throw new Error('Posto bloccato da una missione: prima lo sblocca l\'ufficio');
    const da = posto(k.posto_id); k.posto_id = p.id; k.bancale_id = null; k.letto_entrata ??= ora();
    registra(u, da ? 'Trasferimento' : 'Entrata', 'Collo ' + k.codice, `${da ?? 'Ricevimento'} → ${p.codice}`);
    return { bolla: k.bolla_id, ...contaColli(k.bolla_id), posto: p.codice, da };
  };
  rpc.uscite_oggi = (a, t2, u) => { magazzino(u);
    return t.fermate.filter((f) => f.esito === 'Da fare').flatMap((f) => { const g = t.giri.find((x) => x.id === f.giro_id && x.data === oggi()); const b = t.bolle.find((x) => x.id === f.bolla_id);
      if (!g || !b || !['Confermata', 'In giro'].includes(b.stato)) return [];
      const m = t.mezzi.find((x) => x.id === g.mezzo_id)!, c = t.colli.filter((k) => k.bolla_id === b.id);
      return [{ bolla_id: b.id, numero: b.numero, cliente: cli(b.cliente_id), mezzo: m.tipo + ' ' + m.targa, autista: t.dipendenti.find((d) => d.id === g.autista_id)?.nome ?? '—',
        totale: c.length, caricati: c.filter((k) => k.letto_carico).length,
        colli: c.map((k) => ({ codice: k.codice, posto: posto(k.posto_id), caricato: !!k.letto_carico })).sort((x, y) => String(x.posto ?? 'zz').localeCompare(String(y.posto ?? 'zz')) || x.codice.localeCompare(y.codice)) }]; })
      .sort((x, y) => Number(x.caricati === x.totale) - Number(y.caricati === y.totale) || x.cliente.localeCompare(y.cliente));
  };
  rpc.scansiona_collo = (a, t2, u) => { magazzino(u);
    const k = t.colli.find((x) => x.codice === a.p_codice); if (!k) throw new Error(`Collo sconosciuto: ${a.p_codice}`);
    if (a.p_fase === 'Entrata') k.letto_entrata ??= ora(); else if (a.p_fase === 'Carico') k.letto_carico ??= ora(); else throw new Error('Fase sconosciuta');
    registra(u, a.p_fase, 'Collo ' + a.p_codice, null);
    const c = t.colli.filter((x) => x.bolla_id === k.bolla_id); return { bolla: k.bolla_id, letti: c.filter((x) => a.p_fase === 'Entrata' ? x.letto_entrata : x.letto_carico).length, totale: c.length };
  };
  rpc.collo_su_bancale = (a, t2, u) => { magazzino(u);
    const k = t.colli.find((x) => x.codice === a.p_codice); if (!k) throw new Error(`Codice sconosciuto: ${a.p_codice}`);
    const b = t.bancali.find((x) => x.codice === a.p_bancale && !x.uscito_il); if (!b) throw new Error(`Bancale ${a.p_bancale} non trovato: scansiona l'etichetta del bancale`);
    const bo = t.bolle.find((x) => x.id === k.bolla_id)!;
    if (bo.cliente_id !== b.cliente_id) throw new Error(`Il bancale ${a.p_bancale} è di un altro cliente`);
    if (bloccato(b.posto_id) || bloccato(k.posto_id)) throw new Error('Posto bloccato da una missione: prima lo sblocca l\'ufficio');
    const da = k.bancale_id ? 'bancale ' + t.bancali.find((x) => x.id === k.bancale_id)?.codice : posto(k.posto_id);
    k.bancale_id = b.id; k.posto_id = b.posto_id; k.letto_entrata ??= ora();
    registra(u, da ? 'Trasferimento' : 'Entrata', 'Collo ' + k.codice, `${da ?? 'Ricevimento'} → bancale ${b.codice}`);
    return { bolla: k.bolla_id, ...contaColli(k.bolla_id), bancale: b.codice, posto: posto(b.posto_id), da };
  };
  rpc.trasferisci = (a, t2, u) => { if (ruolo(u) !== 'magazzino') throw new Error('Bancale non trovato'); return rpc.metti_a_posto({ p_codice: a.p_bancale, p_posto: a.p_posto }, t2, u); };
  const mp = (id: string) => { const m = t.missioni_posti.find((x) => x.id === id); if (!m) throw new Error('Posto non trovato'); return m; };
  rpc.scansiona_missione = (a, t2, u) => { magazzino(u); const m = mp(a.p_posto);
    if (m.stato !== 'Da fare') throw new Error('Posto già chiuso o bloccato');
    if (!m.letti.includes(a.p_codice)) m.letti = [...m.letti, a.p_codice];
    m.mancanti = m.attesi.filter((x: any) => !m.letti.includes(x.codice)); m.extra = m.letti.filter((c: string) => !m.attesi.some((x: any) => x.codice === c));
    const chiuso = !m.mancanti.length && !m.extra.length; m.stato = chiuso ? 'Fatto' : 'Da fare'; m.aggiornato_il = ora();
    const art = m.attesi.find((x: any) => x.codice === a.p_codice)?.articolo ?? null;
    return { articolo: art, extra: art === null, chiuso };
  };
  rpc.segnala_posto = (a, t2, u) => { magazzino(u); const m = mp(a.p_posto); if (m.stato !== 'Da fare') throw new Error('Posto già chiuso o bloccato');
    m.mancanti = m.attesi.filter((x: any) => !m.letti.includes(x.codice)); m.extra = m.letti.filter((c: string) => !m.attesi.some((x: any) => x.codice === c));
    m.stato = 'Bloccato'; m.aggiornato_il = ora(); registra(u, 'Blocco', `Mancano ${m.mancanti.length}, in più ${m.extra.length}`, posto(m.posto_id)); };
  rpc.posto_vuoto = (a, t2, u) => { magazzino(u); const m = mp(a.p_posto); if (m.stato !== 'Da fare') throw new Error('Posto già chiuso o bloccato');
    if (m.attesi.length || m.letti.length) throw new Error('Il posto non è vuoto: scansiona i pezzi'); m.stato = 'Fatto'; };

  // ---------------------------------------------------------- bancali
  let seq = Math.max(150, ...t.bancali.map((b) => Number(String(b.codice).slice(2)) || 0));
  rpc.riserva_bancale = (a, t2, u) => { if (!['magazzino', 'vendite', 'stage'].includes(ruolo(u) ?? '')) throw new Error('Non puoi creare bancali'); return 'B-' + String(++seq).padStart(4, '0'); };
  rpc.crea_bancale = (a, t2, u) => {
    if (!['magazzino', 'vendite', 'stage'].includes(ruolo(u) ?? '')) throw new Error('Non puoi creare bancali');
    if (!/^B-\d{4,}$/.test(a.p_codice) || Number(a.p_codice.slice(2)) > seq) throw new Error('Codice bancale non valido');
    if (t.bancali.some((b) => b.codice === a.p_codice)) throw new Error(`Bancale ${a.p_codice} già esistente`);
    const c = azienda(u) === 'trasporti' ? a.p_cliente : t.clienti.find((x) => x.azienda_collegata === azienda(u))?.id; if (!c) throw new Error('Cliente mancante');
    const p = t.posti.find((x) => x.codice === a.p_posto && x.attivo); if (!p) throw new Error(`Posto ${a.p_posto} inesistente`);
    if (bloccato(p.id)) throw new Error('Posto bloccato da una missione: prima lo sblocca l\'ufficio');
    t.bancali.push({ id: crypto.randomUUID(), codice: a.p_codice, cliente_id: c, posto_id: p.id, creato_il: ora(), uscito_il: null });
    registra(u, 'Entrata', 'Bancale nuovo ' + a.p_codice, p.codice, azienda(u)); return a.p_codice;
  };

  // ---------------------------------------------------------- presenze
  const finestra = () => Math.floor(Date.now() / 30000);
  rpc.registra_telefono = (a, t2, u) => { const d = dip(u); if (!d) throw new Error('Non sei tra i dipendenti');
    const b = t.badge.find((x) => x.dipendente_id === d.id && x.attivo);
    // in prova tutti i profili sono sullo stesso browser: il telefono si «sposta» invece di dare errore
    if (b) b.dispositivo = a.p_dispositivo; else t.badge.push({ id: crypto.randomUUID(), dipendente_id: d.id, dispositivo: a.p_dispositivo, attivo: true }); };
  rpc.mio_qr = (a, t2, u) => { const d = dip(u); const b = d && t.badge.find((x) => x.dipendente_id === d.id && x.attivo && x.dispositivo === a.p_dispositivo);
    if (!b) throw new Error('Questo telefono non è registrato per il tuo badge'); return `${b.id}.${finestra()}.prova`; };
  funzioni['timbra-lettore'] = (c) => {
    const [id, w] = String(c.codice ?? '').split('.'); const b = t.badge.find((x) => x.id === id);
    const rifiuta = (motivo: string, d: string | null = null) => { t.timbrature.push({ id: t.timbrature.length + 1000, dipendente_id: d, quando: ora(), verso: null, esito: 'Rifiutata', motivo, lettore: c.lettore }); return { ok: false, motivo }; };
    if (!b) return rifiuta('Badge sconosciuto');
    if (![finestra(), finestra() - 1].includes(Number(w))) return rifiuta('Codice scaduto (foto o screenshot?)', b.dipendente_id);
    if (t.badge_usati.some((x) => x.badge_id === b.id && x.finestra === Number(w))) return rifiuta('Codice già usato (foto o screenshot?)', b.dipendente_id);
    t.badge_usati.push({ badge_id: b.id, finestra: Number(w) });
    const ult = t.timbrature.filter((x) => x.dipendente_id === b.dipendente_id && x.esito === 'Valida').sort((x, y) => x.quando < y.quando ? 1 : -1)[0];
    if (ult && Date.now() - new Date(ult.quando).getTime() < 60000) return { ok: false, motivo: 'Già timbrato' };
    const verso = ult?.verso === 'Entrata' && new Date(ult.quando).toDateString() === new Date().toDateString() ? 'Uscita' : 'Entrata';
    t.timbrature.push({ id: t.timbrature.length + 1000, dipendente_id: b.dipendente_id, quando: ora(), verso, esito: 'Valida', motivo: null, lettore: c.lettore });
    return { ok: true, verso, nome: t.dipendenti.find((d) => d.id === b.dipendente_id)?.nome };
  };

  // ---------------------------------------------------------- App Corporation
  let n = 1;
  funzioni['leggi-seriale'] = () => ({ seriale: 'PF3T' + String(1000 + n++).padStart(4, '0'), marca: 'Lenovo', modello: 'ThinkPad T14 Gen 2', cpu: 'Intel i5-1135G7', gpu: 'Intel Iris Xe',
    ram: '16 GB', disco: '256 GB SSD', schermo: '14", Full HD', verificato: true, batteria: '87%' });

  // ---------------------------------------------------------- solo prova: i codici delle etichette finte
  rpc.prova_codici = (a) => codiciProva(t, a.cosa, a.id);
});

function codiciProva(t: Tabelle, cosa: string, id: string | null): string[] {
  const liberi = t.posti.filter((p) => p.zona === 'Scaffale' && !t.bancali.some((b) => b.posto_id === p.id && !b.uscito_il) && !t.colli.some((k) => k.posto_id === p.id && !k.letto_carico)).map((p) => p.codice);
  switch (cosa) {
    case 'fermata': { const f = t.fermate.find((x) => x.id === id); return t.colli.filter((k) => k.bolla_id === f?.bolla_id && !k.letto_consegna).map((k) => k.codice); }
    case 'entrata': return id === 'Bancale' ? t.bancali.filter((b) => b.cliente_id === 'c-snam' && !b.uscito_il).slice(0, 3).map((b) => b.codice)
      : [...t.colli.filter((k) => k.bolla_id === 'b-0051' && !k.posto_id).map((k) => k.codice)];
    case 'su-bancale': { const k = t.colli.find((x) => x.codice === id); const c = t.bolle.find((b) => b.id === k?.bolla_id)?.cliente_id;
      return t.bancali.filter((b) => b.cliente_id === c && !b.uscito_il).slice(0, 3).map((b) => b.codice); }
    case 'posto': return [...new Set([id, ...liberi.slice(0, 3)].filter(Boolean) as string[])];
    case 'uscita': { const c = t.bolle.find((b) => b.id === id)?.cliente_id;   // colli della spedizione, un bancale in deposito del cliente, un collo sbagliato
      return [...t.colli.filter((k) => k.bolla_id === id && !k.letto_carico).map((k) => k.codice), ...t.bancali.filter((b) => b.cliente_id === c && !b.uscito_il).slice(0, 1).map((b) => b.codice), 'C07-001']; }
    case 'trasferisci': return id === 'Collo' ? ['C50-001'] : [t.bancali.find((b) => b.cliente_id === 'c-lux')?.codice].filter(Boolean) as string[];
    case 'bancale': return t.bancali.filter((b) => b.cliente_id === 'c-corp' && !b.uscito_il).slice(0, 3).map((b) => b.codice);
    case 'missione': { const m = t.missioni_posti.find((x) => x.id === id); return [...(m?.attesi ?? []).filter((x: any) => x.codice && !m!.letti.includes(x.codice)).map((x: any) => x.codice), 'HP9X099']; }
  }
  return [];
}
