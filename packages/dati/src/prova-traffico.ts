// Prova delle modifiche del 21 ottobre notte (migrazione 20261021000400): firma che blocca «Non consegnato»,
// giri preparati dal sistema, un solo «Conferma», pagina del giro e avviso all'autista. Stessi controlli e messaggi del database.
import { estendiProva } from './prova';

const giorno = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const ora = () => new Date().toISOString();

estendiProva(({ t, rpc, rel, viste }) => {
  rel.fermate = { ...rel.fermate, accessori_extra: ['fermata_id', 'molti'] };
  const ruolo = (u: string | null) => t.profili.find((p) => p.id === u)?.ruolo;
  const traffico = (u: string | null) => { if (!['traffico', 'direzione'].includes(ruolo(u) ?? '')) throw new Error('Solo il traffico modifica i giri'); };
  const nome = (u: string | null) => t.profili.find((p) => p.id === u)?.nome ?? 'Tu';
  const dip = (u: string | null) => t.dipendenti.find((d) => d.profilo_id === u) ?? null;
  const cliente = (bid: string) => { const b = t.bolle.find((x) => x.id === bid); return (t.clienti.find((c) => c.id === b?.cliente_id)?.nome ?? '—') + (b?.citta ? ' · ' + b.citta : ''); };
  const storico = (chi: string, cosa: string, dove: string | null, come: string) =>
    t.storico.unshift({ id: Date.now() + Math.random(), quando: ora(), azienda: 'trasporti', chi_nome: chi, operazione: 'Giro', cosa, dove, come });
  t.giri_preparazioni ??= [];
  t.avvisi_autista ??= [];
  t.bolle.forEach((b) => { b.fuori_dai_giri ??= false; });
  t.giri.forEach((g) => { g.da_confermare ??= []; g.km_previsti ??= null; });

  // -------------------------------------------------- preparazione del sistema (prepara_giri_sistema)
  const aperta = (bid: string) => t.fermate.some((f) => f.bolla_id === bid && f.esito === 'Da fare');
  const prepara = (data: string) => {
    if (!t.mezzi.some((m) => m.stato === 'Attivo' && m.autista_id)) return 0;
    let n = 0;
    const da = t.bolle.filter((b) => b.stato === 'Confermata' && b.data_consegna === data && b.tipo !== 'Magazzino' && !b.fuori_dai_giri && !aperta(b.id))
      .sort((a, b) => (a.citta ?? '~').localeCompare(b.citta ?? '~') || (a.fascia ?? '~').localeCompare(b.fascia ?? '~'));
    const mezzo = (g: Record<string, any>) => t.mezzi.find((m) => m.id === g.mezzo_id);
    const inStrada = (g: Record<string, any>) => g.data === data && ['Preparato', 'Partito'].includes(g.stato);
    for (const b of da) {
      const sponda = (b.accessori ?? []).includes('Sponda');
      // un giro dello stesso giorno nella stessa città, non ancora rientrato, con la sponda se serve
      let g = t.giri.find((x) => inStrada(x) && (!sponda || mezzo(x)?.sponda) && t.fermate.some((f) => f.giro_id === x.id && t.bolle.find((y) => y.id === f.bolla_id)?.citta === b.citta));
      if (!g) {
        // un mezzo libero quel giorno: prima quelli adatti alla sponda, poi i più piccoli
        const m = t.mezzi.filter((x) => x.stato === 'Attivo' && x.autista_id && (!sponda || x.sponda) && !t.giri.some((y) => y.data === data && y.mezzo_id === x.id))
          .sort((x, y) => Number(y.sponda === sponda) - Number(x.sponda === sponda) || (x.portata_kg ?? 1e9) - (y.portata_kg ?? 1e9) || x.targa.localeCompare(y.targa))[0];
        if (m) { g = { id: crypto.randomUUID(), data, mezzo_id: m.id, autista_id: m.autista_id, zona: b.citta ?? null, stato: 'Preparato', confermato_il: null, confermato_da: null, da_confermare: [], km_previsti: null }; t.giri.push(g); }
        else g = t.giri.filter((x) => inStrada(x) && (!sponda || mezzo(x)?.sponda)).sort((x, y) => t.fermate.filter((f) => f.giro_id === x.id).length - t.fermate.filter((f) => f.giro_id === y.id).length)[0];
        if (!g) continue;   // nessun mezzo adatto: resta «Da assegnare»
      }
      t.fermate.push({ id: crypto.randomUUID(), giro_id: g.id, bolla_id: b.id, ordine: Math.max(0, ...t.fermate.filter((f) => f.giro_id === g!.id).map((f) => f.ordine)) + 1,
        esito: 'Da fare', motivo: null, dopo: null, firmata: false, foto_bolla: null, nitidezza: null, chiusa_il: null });
      const cosa = 'Aggiunta ' + cliente(b.id);
      if (g.confermato_il) { g.confermato_il = null; g.confermato_da = null; g.da_confermare = [...(g.da_confermare ?? []), cosa]; }
      else if (g.da_confermare?.length && !g.da_confermare.includes(cosa)) g.da_confermare = [...g.da_confermare, cosa];
      if (g.stato === 'Partito') t.avvisi_autista.push({ id: crypto.randomUUID(), dipendente_id: g.autista_id, giro_id: g.id, testo: 'Il tuo giro è cambiato: ' + cosa, creato_il: ora(), letto_il: null });
      n++;
    }
    if (n) {
      t.giri_preparazioni.unshift({ id: crypto.randomUUID(), data, eseguita_il: ora(), assegnate: n, giri: t.giri.filter((g) => g.data === data).length, nota: null });
      storico('Sistema', `${n} spedizioni messe nei giri del ${data.slice(8, 10)}/${data.slice(5, 7)}`, null, 'Sistema');
    }
    return n;
  };
  // come se fossero già le 15:00: i giri di domani sono pronti
  prepara(giorno(1));
  // in prova facciamo finta che l'ottimizzatore per camion (HERE/TomTom, non ancora collegato) abbia già calcolato i km dei giri di domani
  t.giri.filter((g) => g.data === giorno(1)).forEach((g, i) => { g.km_previsti ??= [118, 96, 142, 74, 131, 88][i % 6]; });
  t.giri_preparazioni.forEach((p) => { const d = new Date(); if (d.getHours() >= 15) d.setHours(15, 0, 0, 0); p.eseguita_il = d.toISOString(); });
  // trigger bolle_nei_giri: spedizione confermata per un giorno che ha già i giri
  viste.push(() => {
    const giorni = [...new Set(t.bolle.filter((b) => b.stato === 'Confermata' && b.tipo !== 'Magazzino' && b.data_consegna >= giorno(0) && !b.fuori_dai_giri && !aperta(b.id)
      && t.giri.some((g) => g.data === b.data_consegna)).map((b) => b.data_consegna as string))];
    giorni.forEach(prepara);
  });

  rpc.proponi_giri = (a, t2, u) => { traffico(u); return prepara(a.p_data); };
  rpc.conferma_giri = (a, t2, u) => {
    if (!['traffico', 'direzione'].includes(ruolo(u) ?? '')) throw new Error('Non autorizzato');
    const gg = t.giri.filter((g) => g.data === a.p_data && !g.confermato_il);
    if (!gg.length) throw new Error(`Nessun giro da confermare per il ${String(a.p_data).slice(8, 10)}/${String(a.p_data).slice(5, 7)}`);
    gg.forEach((g) => { g.confermato_il = ora(); g.confermato_da = u; g.da_confermare = []; });
    storico('Sistema', `${gg.length} giri confermati`, null, 'Sistema'); return gg.length;
  };

  // -------------------------------------------------- firma: niente più «Non consegnata» né «Riprovo dopo»
  const chiudi = rpc.chiudi_fermata, riprova = rpc.riprova_dopo;
  if (chiudi) rpc.chiudi_fermata = (a, t2, u) => {
    const f = t.fermate.find((x) => x.id === a.p_fermata);
    if (f?.firmata && !a.p_consegnata) throw new Error('Il cliente ha firmato: la merce è consegnata, non si può chiudere come «Non consegnata»');
    return chiudi(a, t2, u);
  };
  if (riprova) rpc.riprova_dopo = (a, t2, u) => {
    if (t.fermate.find((x) => x.id === a.p_fermata)?.firmata) throw new Error('Il cliente ha firmato: la merce è consegnata');
    return riprova(a, t2, u);
  };

  // -------------------------------------------------- modifiche al giro
  const cambiato = (gid: string, cosa: string, u: string | null) => {
    const g = t.giri.find((x) => x.id === gid)!; const m = t.mezzi.find((x) => x.id === g.mezzo_id);
    storico(nome(u), cosa, m?.targa ?? m?.tipo ?? null, 'Manuale');
    if (g.confermato_il && g.stato === 'Partito') t.avvisi_autista.push({ id: crypto.randomUUID(), dipendente_id: g.autista_id, giro_id: g.id, testo: 'Il tuo giro è cambiato: ' + cosa, creato_il: ora(), letto_il: null });
  };
  const fermata = (id: string, u: string | null) => {
    traffico(u);
    const f = t.fermate.find((x) => x.id === id); if (!f) throw new Error('Fermata non trovata');
    if (f.esito !== 'Da fare') throw new Error('Fermata già chiusa: non si sposta');
    if (f.firmata) throw new Error('Il cliente ha già firmato');
    return f;
  };
  const inFondo = (gid: string) => Math.max(0, ...t.fermate.filter((f) => f.giro_id === gid).map((f) => f.ordine)) + 1;

  rpc.giro_ordine = (a, t2, u) => {
    const f = fermata(a.p_fermata, u);
    const vicine = t.fermate.filter((x) => x.giro_id === f.giro_id && (a.p_su ? x.ordine < f.ordine : x.ordine > f.ordine)).sort((x, y) => a.p_su ? y.ordine - x.ordine : x.ordine - y.ordine);
    const v = vicine[0]; if (!v) throw new Error(a.p_su ? 'È già la prima' : 'È già l\'ultima');
    if (v.esito !== 'Da fare') throw new Error('Non si sposta prima di una fermata già fatta');
    [f.ordine, v.ordine] = [v.ordine, f.ordine];
    cambiato(f.giro_id, `${cliente(f.bolla_id)} ${a.p_su ? 'anticipata' : 'posticipata'} alla fermata ${f.ordine}`, u);
  };
  rpc.giro_modifica = (a, t2, u) => {
    const f = fermata(a.p_fermata, u); const b = t.bolle.find((x) => x.id === f.bolla_id)!; const acc: string[] = a.p_accessori ?? [];
    const cosa: string[] = [];
    if (String(a.p_fascia ?? '').trim() && b.fascia !== String(a.p_fascia).trim()) { b.fascia = String(a.p_fascia).trim(); cosa.push('fascia ' + b.fascia); }
    t.accessori_extra = t.accessori_extra.filter((x) => x.fermata_id !== f.id || acc.includes(x.voce));
    acc.filter((v) => !(b.accessori ?? []).includes(v) && !t.accessori_extra.some((x) => x.fermata_id === f.id && x.voce === v))
      .forEach((v) => t.accessori_extra.push({ id: crypto.randomUUID(), fermata_id: f.id, voce: v, aggiunto_il: ora(), lat: null, lng: null }));
    const tutti = [...(b.accessori ?? []), ...t.accessori_extra.filter((x) => x.fermata_id === f.id).map((x) => x.voce).sort()];
    cosa.push('accessori: ' + (tutti.join(', ') || 'nessuno'));
    cambiato(f.giro_id, `${cliente(f.bolla_id)}: ${cosa.join(', ')}`, u);
  };
  rpc.giro_passa = (a, t2, u) => {
    const f = fermata(a.p_fermata, u); const da = t.giri.find((x) => x.id === f.giro_id)!; const g = t.giri.find((x) => x.id === a.p_giro);
    if (!g || g.data !== da.data) throw new Error('Il giro di destinazione deve essere dello stesso giorno');
    if (g.id === da.id) throw new Error('È già in questo giro');
    if (['Rientrato', 'Chiuso'].includes(g.stato)) throw new Error('Il giro di destinazione è già finito');
    const nuova = { ...f, id: crypto.randomUUID(), giro_id: g.id, ordine: inFondo(g.id) };
    t.accessori_extra.filter((x) => x.fermata_id === f.id).forEach((x) => { x.fermata_id = nuova.id; });
    t.fermate = t.fermate.filter((x) => x.id !== f.id); t.fermate.push(nuova);
    cambiato(da.id, `${cliente(f.bolla_id)} passata al giro di ${t.dipendenti.find((d) => d.id === g.autista_id)?.nome ?? '—'}`, u);
    cambiato(g.id, `${cliente(f.bolla_id)} aggiunta in fondo al giro`, u);
  };
  rpc.giro_togli = (a, t2, u) => {
    const f = fermata(a.p_fermata, u); const b = t.bolle.find((x) => x.id === f.bolla_id)!;
    t.fermate = t.fermate.filter((x) => x.id !== f.id); t.accessori_extra = t.accessori_extra.filter((x) => x.fermata_id !== f.id);
    b.fuori_dai_giri = true; if (b.stato === 'In giro') b.stato = 'Confermata';
    cambiato(f.giro_id, `${cliente(b.id)} tolta dal giro: torna da assegnare`, u);
  };
  rpc.giro_aggiungi = (a, t2, u) => {
    traffico(u);
    const g = t.giri.find((x) => x.id === a.p_giro); const b = t.bolle.find((x) => x.id === a.p_bolla);
    if (!g || !b) throw new Error('Giro o spedizione non trovati');
    if (['Rientrato', 'Chiuso'].includes(g.stato)) throw new Error('Il giro è già finito');
    if (b.data_consegna !== g.data) throw new Error('La spedizione è per un altro giorno');
    if (aperta(b.id)) throw new Error('La spedizione è già in un giro');
    if (b.stato !== 'Confermata') throw new Error('La spedizione non è confermata');
    b.fuori_dai_giri = false;
    t.fermate.push({ id: crypto.randomUUID(), giro_id: g.id, bolla_id: b.id, ordine: inFondo(g.id), esito: 'Da fare', motivo: null, dopo: null, firmata: false, foto_bolla: null, nitidezza: null, chiusa_il: null });
    cambiato(g.id, `${cliente(b.id)} aggiunta al giro`, u);
  };

  // -------------------------------------------------- avvisi all'autista
  rpc.miei_avvisi = (a, t2, u) => t.avvisi_autista.filter((x) => x.dipendente_id === dip(u)?.id && !x.letto_il).sort((x, y) => x.creato_il.localeCompare(y.creato_il));
  rpc.avviso_letto = (a, t2, u) => {
    const x = t.avvisi_autista.find((v) => v.id === a.p_avviso && v.dipendente_id === dip(u)?.id && !v.letto_il);
    if (!x) throw new Error('Avviso non trovato'); x.letto_il = ora();
  };
});
