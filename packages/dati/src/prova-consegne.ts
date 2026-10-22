// Prova del blocco «consegne e giri» del 22 ottobre (migrazione 20261022000100): colli creati alla conferma,
// consegna con riserva, ritiro, nuova data, chiusura d'ufficio, stati del giro, vincoli del mezzo.
// Stessi controlli e stessi messaggi del database.
import { estendiProva } from './prova';

const oggi = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const ora = () => new Date().toISOString();
const PORTATA: Record<string, [number, number]> = { Sprinter: [1000, 4], Furgone: [1000, 8], Motrice: [7000, 18], 'Tre assi': [12000, 22], Bilico: [23000, 33] };

estendiProva(({ t, rpc, regole, viste }) => {
  const ruolo = (u: string | null) => t.profili.find((p) => p.id === u)?.ruolo;
  const azienda = (u: string | null) => t.profili.find((p) => p.id === u)?.azienda;
  const nome = (u: string | null) => t.profili.find((p) => p.id === u)?.nome ?? 'Tu';
  const dip = (u: string | null) => t.dipendenti.find((d) => d.profilo_id === u) ?? null;
  const ufficio = (u: string | null) => azienda(u) === 'trasporti' && ['bolle', 'traffico', 'direzione'].includes(ruolo(u) ?? '');
  const cliente = (bid: string) => { const b = t.bolle.find((x) => x.id === bid); return (t.clienti.find((c) => c.id === b?.cliente_id)?.nome ?? '—') + (b?.citta ? ' · ' + b.citta : ''); };
  const storico = (u: string | null, operazione: string, cosa: string, oggetto: string, id: string) =>
    t.storico.unshift({ id: Date.now() + Math.random(), quando: ora(), azienda: 'trasporti', chi_nome: nome(u), operazione, cosa, dove: null, come: 'Manuale', oggetto, oggetto_id: id });
  const avviso = (gid: string, cosa: string) => { const g = t.giri.find((x) => x.id === gid);
    if (g?.confermato_il && g.stato === 'Partito') t.avvisi_autista.push({ id: crypto.randomUUID(), dipendente_id: g.autista_id, giro_id: g.id, testo: 'Il tuo giro è cambiato: ' + cosa, creato_il: ora(), letto_il: null }); };

  // ---------------------------------------------------------- mezzi: portata e posti bancale
  t.mezzi.forEach((m) => { const v = PORTATA[m.tipo] ?? [null, null]; m.portata_kg ??= v[0]; m.bancali ??= v[1]; });

  // ---------------------------------------------------------- colli creati alla conferma (codice = numero della bolla + progressivo)
  const regolaBolle = regole.bolle;
  regole.bolle = (a, b, tt, u) => {
    regolaBolle?.(a, b, tt, u);
    if (a && a.stato === 'Nuova' && b.stato === 'Confermata' && b.colli_previsti > 0 && !t.colli.some((k) => k.bolla_id === b.id))
      for (let k = 1; k <= b.colli_previsti; k++)
        t.colli.push({ id: crypto.randomUUID(), bolla_id: b.id, codice: `${b.numero}-${String(k).padStart(3, '0')}`, posto_id: null, letto_entrata: null, letto_carico: null, letto_consegna: null });
  };

  // ---------------------------------------------------------- stati del giro
  const fermataMia = (id: string, u: string | null) => {
    const f = t.fermate.find((x) => x.id === id); const g = f && t.giri.find((x) => x.id === f.giro_id);
    if (!f || !g || g.autista_id !== dip(u)?.id) throw new Error('Fermata non tua');
    if (f.esito !== 'Da fare') throw new Error('Fermata già chiusa');
    return f;
  };
  // Partito alla prima azione dell'autista: le bolle del giro diventano «In giro»
  const partito = (gid: string) => {
    const g = t.giri.find((x) => x.id === gid); if (g?.stato === 'Preparato') g.stato = 'Partito';
    t.fermate.filter((f) => f.giro_id === gid && f.esito === 'Da fare').forEach((f) => { const b = t.bolle.find((x) => x.id === f.bolla_id); if (b?.stato === 'Confermata') b.stato = 'In giro'; });
  };
  for (const n of ['scansiona_consegna', 'aggiungi_accessorio', 'firma_fermata', 'foto_bolla', 'riprova_dopo']) {
    const f0 = rpc[n]; if (!f0) continue;
    rpc[n] = (a, t2, u) => { const f = fermataMia(a.p_fermata, u); partito(f.giro_id); return f0(a, t2, u); };
  }
  // come i trigger: Rientrato quando è tutto chiuso, di nuovo Partito con una fermata nuova, bolle aggiunte a un giro partito «In giro»
  viste.push(() => {
    for (const g of t.giri) {
      const fer = t.fermate.filter((f) => f.giro_id === g.id);
      const aperte = fer.filter((f) => f.esito === 'Da fare');
      if (g.stato === 'Partito' && fer.length && !aperte.length) g.stato = 'Rientrato';
      if (g.stato === 'Rientrato' && aperte.length) g.stato = 'Partito';
      if (g.stato === 'Partito') aperte.forEach((f) => { const b = t.bolle.find((x) => x.id === f.bolla_id); if (b?.stato === 'Confermata') b.stato = 'In giro'; });
    }
  });

  // ---------------------------------------------------------- chiusura della fermata (app e ufficio)
  const chiudi = (f: Record<string, any>, a: Record<string, any>, u: string | null, daUfficio: boolean) => {
    const b = t.bolle.find((x) => x.id === f.bolla_id)!;
    if (!['Confermata', 'In giro'].includes(b.stato)) throw new Error('La bolla non è in consegna');
    const c = t.colli.filter((x) => x.bolla_id === b.id), letti = c.filter((x) => x.letto_consegna).length;
    const riserva = String(a.p_riserva ?? '').trim();
    if (a.p_consegnata) {
      if (daUfficio) { if (!String(a.p_motivo ?? '').trim()) throw new Error('Chiusura d\'ufficio: serve il motivo'); }
      else {
        if (!f.firmata) throw new Error('Consegna bloccata: manca la firma');
        if (!f.foto_bolla) throw new Error('Consegna bloccata: manca la foto della bolla');
        if (b.tipo === 'Ritiro') {
          const n = Number(a.p_colli_ritirati ?? 0);
          if (n <= 0) throw new Error('Ritiro: scrivi quanti colli hai preso');
          if (n !== (b.colli_previsti ?? 0) && !riserva) throw new Error(`Ritiro: ${n} colli invece di ${b.colli_previsti ?? 0}, scrivi cosa non torna`);
        } else if (!riserva) {
          if (!b.colli_previsti || c.length !== b.colli_previsti || letti !== b.colli_previsti) throw new Error(`Consegna bloccata: ${letti} colli su ${b.colli_previsti ?? 0} scansionati`);
        } else if (!letti) throw new Error('Consegna con riserva: scansiona almeno un collo consegnato');
      }
      f.esito = 'Consegnata'; b.stato = 'Consegnata';
    } else {
      if (f.firmata && !daUfficio) throw new Error('Il cliente ha firmato: la merce è consegnata, non si può chiudere come «Non consegnata»');
      if (!String(a.p_motivo ?? '').trim() || !a.p_dopo) throw new Error('Serve il motivo e cosa succede alla merce');
      if (a.p_dopo === 'Nuova data' && (!a.p_nuova_data || a.p_nuova_data <= oggi())) throw new Error('Nuova data: scegli il giorno della nuova consegna (da domani)');
      f.esito = 'Non consegnata'; f.dopo = a.p_dopo; f.nuova_data = a.p_nuova_data ?? null;
      b.stato = a.p_dopo === 'Giacenza' ? 'Giacenza' : 'Non consegnata';
      if (a.p_dopo === 'Giacenza' && !t.giacenze.some((x) => x.bolla_id === b.id && !x.chiusa_il))
        t.giacenze.push({ id: crypto.randomUUID(), bolla_id: b.id, motivo: a.p_motivo, dal: oggi(), riconsegna_il: null, chiusa_il: null });
      if (a.p_dopo === 'Nuova data') {   // torna da sola nei giri di quel giorno, con la riconsegna in fattura
        b.stato = 'Confermata'; b.data_consegna = a.p_nuova_data; b.fuori_dai_giri = false;
        t.accessori_extra.push({ id: crypto.randomUUID(), fermata_id: f.id, voce: 'Riconsegna', aggiunto_il: ora(), lat: null, lng: null });
      }
    }
    f.motivo = a.p_motivo ?? f.motivo ?? null; f.riserva = riserva || null; f.colli_consegnati = letti; f.colli_ritirati = a.p_colli_ritirati ?? null;
    f.lat = a.p_lat ?? null; f.lng = a.p_lng ?? null; f.chiusa_il = ora(); f.chiusa_da = u; f.da_ufficio = daUfficio;
  };
  rpc.chiudi_fermata = (a, t2, u) => { const f = fermataMia(a.p_fermata, u); partito(f.giro_id); chiudi(f, a, u, false); };
  rpc.chiudi_ufficio = (a, t2, u) => {
    if (!ufficio(u)) throw new Error('Solo l\'ufficio chiude una fermata d\'ufficio');
    if (!String(a.p_motivo ?? '').trim()) throw new Error('Scrivi il motivo della chiusura d\'ufficio');
    const f = t.fermate.find((x) => x.id === a.p_fermata); if (!f) throw new Error('Fermata non trovata');
    if (f.esito !== 'Da fare') throw new Error('Fermata già chiusa');
    chiudi(f, { ...a, p_dopo: a.p_consegnata ? null : (a.p_dopo ?? 'Giacenza') }, u, true);
    storico(u, 'Ufficio', `${cliente(f.bolla_id)}: chiusa d'ufficio come ${a.p_consegnata ? 'consegnata' : 'non consegnata'} · ${String(a.p_motivo).trim()}`, 'fermate', f.id);
    avviso(f.giro_id, `${cliente(f.bolla_id)} chiusa dall'ufficio`);
  };
  rpc.rimetti_in_giro = (a, t2, u) => {
    if (!ufficio(u)) throw new Error('Non autorizzato');
    const b = t.bolle.find((x) => x.id === a.p_bolla);
    if (!b || b.stato !== 'Non consegnata') throw new Error('Si rimette in giro solo una spedizione non consegnata');
    if (!a.p_data || a.p_data < oggi()) throw new Error('Scegli il giorno della nuova consegna');
    b.stato = 'Confermata'; b.data_consegna = a.p_data; b.fuori_dai_giri = false;
    storico(u, 'Riconsegna', `Rimessa in giro per il ${String(a.p_data).slice(8, 10)}/${String(a.p_data).slice(5, 7)}`, 'bolle', b.id);
  };

  // ---------------------------------------------------------- vincoli del mezzo alla conferma
  const vincoli = (gid: string) => {
    const g = t.giri.find((x) => x.id === gid); const m = g && t.mezzi.find((x) => x.id === g.mezzo_id); if (!g || !m) return [];
    const aperte = t.fermate.filter((f) => f.giro_id === g.id && f.esito === 'Da fare'); const out: string[] = [];
    const bolla = (f: Record<string, any>) => t.bolle.find((x) => x.id === f.bolla_id);
    if (!m.sponda && aperte.some((f) => (bolla(f)?.accessori ?? []).includes('Sponda') || t.accessori_extra.some((x) => x.fermata_id === f.id && x.voce === 'Sponda')))
      out.push('serve la sponda ma il mezzo non ce l\'ha');
    const peso = aperte.reduce((s, f) => s + Number(bolla(f)?.peso_kg ?? 0), 0);
    if (m.portata_kg && peso > m.portata_kg) out.push(`peso oltre la portata (${Math.round(peso)} kg su ${m.portata_kg})`);
    return out;
  };
  rpc.giro_vincoli = (a) => vincoli(a.p_giro);
  const conferma0 = rpc.conferma_giri;
  rpc.conferma_giri = (a, t2, u) => {
    for (const g of t.giri.filter((x) => x.data === a.p_data && !x.confermato_il)) {
      const v = vincoli(g.id);
      if (v.length) throw new Error(`Giro di ${t.dipendenti.find((d) => d.id === g.autista_id)?.nome ?? '—'}: ${v.join('; ')}`);
    }
    return conferma0(a, t2, u);
  };
});
