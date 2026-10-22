// Prova: uscita dei bancali, inventario con quantità e PC Corporation, rettifica, missioni che si chiudono.
// Stessa logica della migrazione 20261022000500 (il deposito al giorno è in prova-fatture, nella chiusura del mese).
import { estendiProva } from './prova';

type R = Record<string, any>;
const ora = () => new Date().toISOString();

estendiProva(({ t, rpc, viste }) => {
  // dati di esempio: articoli senza seriale (si contano) e il deposito di Luxiona
  const mpEco = t.missioni_posti.find((m) => m.stato === 'Da fare' && t.bancali.some((b) => b.cliente_id === 'c-eco' && b.posto_id === m.posto_id));
  const kEco = mpEco && t.bancali.find((b) => b.cliente_id === 'c-eco' && b.posto_id === mpEco.posto_id);
  if (kEco) {
    t.contenuto.push({ id: crypto.randomUUID(), bancale_id: kEco.id, articolo: 'Scatole imballo', quantita: 10, codici: [], inserito: 'Pistola', da: 'u-mag', il: ora() });
    mpEco!.attesi = [...mpEco!.attesi, { articolo: 'Scatole imballo', codice: null, quantita: 10 }];
  }
  t.tariffe.push({ id: crypto.randomUUID(), cliente_id: 'c-lux', voce: 'Deposito', unita: 'giorno', prezzo: 0.6, zona: null, quando: 'Per bancale, ogni giorno in magazzino',
    valida_dal: '2026-01-01', valida_al: null, stato: 'Attiva', minimo: null, scaglione_su: null, scaglione_da: null, scaglione_a: null });

  const ruolo = (u: string | null) => t.profili.find((p) => p.id === u)?.ruolo;
  const azienda = (u: string | null) => t.profili.find((p) => p.id === u)?.azienda;
  const posto = (id: string | null | undefined) => t.posti.find((p) => p.id === id)?.codice ?? null;
  const nome = (u: string | null) => t.profili.find((p) => p.id === u)?.nome ?? 'Sistema';
  const registra = (u: string | null, operazione: string, cosa: string, dove: string | null) =>
    t.storico.unshift({ id: Date.now() + Math.random(), quando: ora(), azienda: 'trasporti', chi_nome: nome(u), operazione, cosa, dove: dove ?? '—', come: 'Pistola' });
  const ufficio = (u: string | null) => { if (!(azienda(u) === 'trasporti' && ['amministrazione', 'traffico', 'direzione'].includes(ruolo(u) ?? ''))) throw new Error('Lo fa solo l\'ufficio'); };
  const magazzino = (u: string | null) => { if (!(azienda(u) === 'trasporti' && ruolo(u) === 'magazzino')) throw new Error('Non autorizzato'); };

  // ------------------------------------------------------------------ uscita del bancale
  rpc.esci_bancale = (a, _t, u) => {
    if (!(azienda(u) === 'trasporti' && ['magazzino', 'traffico', 'direzione'].includes(ruolo(u) ?? ''))) throw new Error('Non autorizzato');
    const b = t.bancali.find((x) => x.codice === a.p_bancale); if (!b) throw new Error(`Bancale ${a.p_bancale} sconosciuto`);
    if (b.uscito_il) throw new Error(`Il bancale ${a.p_bancale} è già uscito`);
    const bo = t.bolle.find((x) => x.id === a.p_bolla);
    if (!bo || !['Confermata', 'In giro'].includes(bo.stato)) throw new Error('Serve la bolla di uscita confermata');
    if (bo.cliente_id !== b.cliente_id) throw new Error(`Il bancale ${a.p_bancale} è di un altro cliente: rimettilo al suo posto`);
    const da = posto(b.posto_id);
    Object.assign(b, { uscito_il: ora(), bolla_uscita_id: bo.id, posto_id: null });
    registra(u, 'Uscita', `Bancale ${b.codice} con la bolla ${bo.numero ?? '—'}`, da);
    return { bancale: b.codice, posto: da };
  };
  const uscite = rpc.uscite_oggi;
  rpc.uscite_oggi = (a, x, u) => (uscite(a, x, u) as R[]).map((r) => { const c = t.bolle.find((b) => b.id === r.bolla_id)?.cliente_id;
    return { ...r, in_deposito: t.bancali.filter((b) => b.cliente_id === c && !b.uscito_il).length, usciti: t.bancali.filter((b) => b.bolla_uscita_id === r.bolla_id).map((b) => b.codice) }; });
  // al carico: quando tutti i colli di un bancale sono sul mezzo, il bancale esce da solo
  const carico = rpc.scansiona_collo;
  rpc.scansiona_collo = (a, x, u) => {
    const r = carico(a, x, u) as R;
    const k = t.colli.find((c) => c.codice === a.p_codice);
    if (a.p_fase === 'Carico' && k?.bancale_id && !t.colli.some((c) => c.bancale_id === k.bancale_id && !c.letto_carico)) {
      const b = t.bancali.find((y) => y.id === k.bancale_id);
      if (b && !b.uscito_il) Object.assign(b, { uscito_il: ora(), bolla_uscita_id: k.bolla_id, posto_id: null });
    }
    return r;
  };

  // ------------------------------------------------------------------ missioni: seriali, quantità e PC della Corporation
  const attesiDi = (pid: string) => {
    const kk = t.bancali.filter((b) => b.posto_id === pid && !b.uscito_il).map((b) => b.id);
    const c = t.contenuto.filter((x) => kk.includes(x.bancale_id));
    const cod = c.flatMap((x) => (x.codici ?? []).map((codice: string) => ({ articolo: x.articolo, codice })));
    const q: Record<string, number> = {};
    for (const x of c) { const n = Number(x.quantita) - (x.codici?.length ?? 0); if (n > 0) q[x.articolo] = (q[x.articolo] ?? 0) + n; }
    const dev = t.device.filter((d) => kk.includes(d.bancale_id) && !['Venduto', 'Smontato'].includes(d.stato)).map((d) => ({ articolo: `${d.marca} ${d.modello}`, codice: d.seriale }));
    return [...cod, ...Object.entries(q).map(([articolo, quantita]) => ({ articolo, codice: null, quantita })), ...dev];
  };
  const conti = (m: R) => {
    const att = m.attesi as R[]; const contati = (m.contati ?? {}) as Record<string, number>;
    const mancanti = [...att.filter((a) => a.codice && !m.letti.includes(a.codice)),
      ...att.filter((a) => !a.codice && Number(contati[a.articolo] ?? 0) < a.quantita).map((a) => ({ articolo: a.articolo, quantita: a.quantita - Number(contati[a.articolo] ?? 0) }))];
    const extra = [...m.letti.filter((c: string) => !att.some((a) => a.codice === c)),
      ...Object.entries(contati).filter(([art, n]) => Number(n) > (att.find((a) => !a.codice && a.articolo === art)?.quantita ?? 0))
        .map(([art, n]) => ({ articolo: art, quantita: Number(n) - (att.find((a) => !a.codice && a.articolo === art)?.quantita ?? 0) }))];
    return { mancanti, extra };
  };
  const chiudiSeFinita = (missione: string) => {
    const mi = t.missioni.find((x) => x.id === missione);
    if (mi && mi.stato === 'Aperta' && !t.missioni_posti.some((x) => x.missione_id === missione && ['Da fare', 'Bloccato'].includes(x.stato))) { mi.stato = 'Chiusa'; mi.chiusa_il = ora(); }
  };
  const mp = (id: string) => { const m = t.missioni_posti.find((x) => x.id === id); if (!m) throw new Error('Posto della missione non trovato'); return m; };
  const aggiorna = (m: R) => { const c = conti(m); m.mancanti = c.mancanti; m.extra = c.extra; m.stato = !c.mancanti.length && !c.extra.length ? 'Fatto' : 'Da fare'; m.aggiornato_il = ora();
    if (m.stato === 'Fatto') chiudiSeFinita(m.missione_id); return m.stato === 'Fatto'; };
  for (const m of t.missioni_posti) m.contati ??= {};

  rpc.lancia_missione = (a, _t, u) => {
    ufficio(u);
    // una missione alla volta: la nuova sostituisce i posti non ancora controllati di quelle aperte
    const aperte = t.missioni.filter((x) => x.stato === 'Aperta').map((x) => x.id);
    t.missioni_posti = t.missioni_posti.filter((x) => !(x.stato === 'Da fare' && aperte.includes(x.missione_id)));
    aperte.forEach(chiudiSeFinita);
    const id = crypto.randomUUID();
    t.missioni.unshift({ id, ambito: a.p_ambito, filtro: a.p_filtro, stato: 'Aperta', creata_da: u, creata_il: ora() });
    const cli = (pid: string) => t.bancali.filter((b) => b.posto_id === pid && !b.uscito_il).map((b) => t.clienti.find((c) => c.id === b.cliente_id)?.nome);
    const posti = t.posti.filter((p) => p.attivo && p.zona === 'Scaffale' && (a.p_ambito === 'Tutto' || (a.p_ambito === 'Scaffale' && p.codice.startsWith(a.p_filtro + '-'))
      || (a.p_ambito === 'Zona' && p.codice.startsWith(a.p_filtro)) || (a.p_ambito === 'Cliente' && cli(p.id).includes(a.p_filtro))));
    for (const p of posti) t.missioni_posti.push({ id: crypto.randomUUID(), missione_id: id, posto_id: p.id, attesi: attesiDi(p.id), letti: [], contati: {}, mancanti: [], extra: [], stato: 'Da fare', motivo: null, aggiornato_il: ora() });
    registra(u, 'Missione', `Lanciata: ${a.p_ambito} ${a.p_filtro ?? ''}`, null);
    return id;
  };
  rpc.scansiona_missione = (a, _t, u) => {
    magazzino(u); const m = mp(a.p_posto); if (m.stato !== 'Da fare') throw new Error('Posto già chiuso o bloccato');
    if (!m.letti.includes(a.p_codice)) m.letti = [...m.letti, a.p_codice];
    const chiuso = aggiorna(m); const art = m.attesi.find((x: R) => x.codice === a.p_codice)?.articolo ?? null;
    return { articolo: art, extra: art === null, chiuso };
  };
  rpc.conta_missione = (a, _t, u) => {
    magazzino(u); if (!(Number(a.p_quantita) >= 0)) throw new Error('Scrivi quanti pezzi conti');
    const m = mp(a.p_posto); if (m.stato !== 'Da fare') throw new Error('Posto già chiuso o bloccato');
    m.contati = { ...m.contati, [a.p_articolo]: Number(a.p_quantita) };
    return { chiuso: aggiorna(m) };
  };
  rpc.segnala_posto = (a, _t, u) => {
    magazzino(u); const m = mp(a.p_posto); if (m.stato !== 'Da fare') throw new Error('Posto già chiuso o bloccato');
    const c = conti(m); Object.assign(m, { ...c, stato: 'Bloccato', aggiornato_il: ora() });
    registra(u, 'Blocco', `Mancano ${c.mancanti.length}, in più ${c.extra.length}`, posto(m.posto_id));
  };
  rpc.posto_vuoto = (a, _t, u) => {
    magazzino(u); const m = mp(a.p_posto); if (m.stato !== 'Da fare') throw new Error('Posto già chiuso o bloccato');
    if (m.attesi.length || m.letti.length || Object.keys(m.contati ?? {}).length) throw new Error('Il posto non è vuoto: scansiona o conta i pezzi');
    m.stato = 'Fatto'; chiudiSeFinita(m.missione_id);
  };
  rpc.sblocca_posto = (a, _t, u) => {
    ufficio(u); const m = mp(a.p_posto); if (m.stato !== 'Bloccato') throw new Error('Si sblocca solo un posto bloccato');
    if (!String(a.p_motivo ?? '').trim()) throw new Error('Per sbloccare scrivi cosa è successo');
    Object.assign(m, { stato: 'Sbloccato', motivo: String(a.p_motivo).trim(), sbloccato_da: u });
    registra(u, 'Sblocco', m.motivo, posto(m.posto_id)); chiudiSeFinita(m.missione_id);
  };
  rpc.rettifica_posto = (a, _t, u) => {
    ufficio(u); const m = mp(a.p_posto); if (m.stato !== 'Bloccato') throw new Error('Si rettifica solo un posto bloccato');
    if (!String(a.p_motivo ?? '').trim()) throw new Error('Scrivi perché il magazzino cambia');
    const kk = t.bancali.filter((b) => b.posto_id === m.posto_id && !b.uscito_il);
    for (const x of (m.mancanti as R[]).filter((x) => x.codice)) {
      for (const c of t.contenuto.filter((c) => kk.some((b) => b.id === c.bancale_id) && c.codici?.includes(x.codice))) { c.codici = c.codici.filter((k: string) => k !== x.codice); c.quantita = Math.max(0, c.quantita - 1); c.inserito = 'Manuale'; }
      for (const d of t.device.filter((d) => d.seriale === x.codice && kk.some((b) => b.id === d.bancale_id))) { d.bancale_id = null; if (['Disponibile', 'In carico'].includes(d.stato)) d.stato = 'Fermo'; }
    }
    for (const [art, n] of Object.entries(m.contati ?? {})) {
      const c = t.contenuto.find((c) => kk.some((b) => b.id === c.bancale_id) && c.articolo === art);
      if (c) { c.quantita = (c.codici?.length ?? 0) + Number(n); c.inserito = 'Manuale'; }
    }
    for (const cod of (m.extra as R[]).filter((x) => typeof x === 'string') as unknown as string[]) {
      const d = t.device.find((x) => x.seriale === cod);
      if (d && kk[0]) d.bancale_id = kk[0].id;
      else if (kk[0]) t.contenuto.push({ id: crypto.randomUUID(), bancale_id: kk[0].id, articolo: 'Trovato in inventario', quantita: 1, codici: [cod], inserito: 'Manuale', da: u, il: ora() });
    }
    Object.assign(m, { stato: 'Sbloccato', motivo: 'Rettifica: ' + String(a.p_motivo).trim(), sbloccato_da: u });
    t.storico.unshift({ id: Date.now() + Math.random(), quando: ora(), azienda: 'trasporti', chi_nome: nome(u), operazione: 'Rettifica', cosa: String(a.p_motivo).trim(), dove: posto(m.posto_id) ?? '—', come: 'Manuale' });
    chiudiSeFinita(m.missione_id);
  };

  // vista per l'app: articoli da scansionare e da contare, solo missioni aperte
  viste.push((x) => {
    x.missioni_posti_app = x.missioni_posti.filter((m) => x.missioni.find((y) => y.id === m.missione_id)?.stato === 'Aperta').map((m) => {
      const g: Record<string, R> = {};
      for (const a of m.attesi as R[]) if (a.codice) { g[a.articolo] ??= { articolo: a.articolo, pezzi: 0, letti: 0, conta: false }; g[a.articolo].pezzi++; if (m.letti.includes(a.codice)) g[a.articolo].letti++; }
      const q = (m.attesi as R[]).filter((a) => !a.codice).map((a) => ({ articolo: a.articolo, pezzi: a.quantita, letti: Number(m.contati?.[a.articolo] ?? 0), conta: true }));
      const contati = Object.values(m.contati ?? {}).reduce((s: number, n) => s + Number(n), 0);
      return { id: m.id, missione_id: m.missione_id, posto: posto(m.posto_id), stato: m.stato, elenco: [...Object.values(g), ...q],
        pezzi: (m.attesi as R[]).reduce((s, a) => s + (a.codice ? 1 : a.quantita), 0), letti: m.letti.length + contati,
        extra: m.letti.filter((c: string) => !(m.attesi as R[]).some((a) => a.codice === c)).length };
    });
  });
});
