// Prova delle modifiche del 20 ottobre sera (migrazione 20261021000200): giri confermati, giacenze con ora,
// «chiesta al cliente», reso al mittente, satellitare e telecamere. Stessi controlli e messaggi del database.
import { estendiProva } from './prova';

const oggi = () => new Date().toISOString().slice(0, 10);
const alle = (h: number, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };

estendiProva(({ t, rpc, rel, viste }) => {
  const ruolo = (u: string | null) => t.profili.find((p) => p.id === u)?.ruolo;
  const ha = (u: string | null, ...r: string[]) => ruolo(u) === 'direzione' || r.includes(ruolo(u) ?? '');
  const direzione = (u: string | null) => { if (ruolo(u) !== 'direzione') throw new Error('Solo la direzione'); };
  const registra = (operazione: string, cosa: string) => t.storico.unshift({ id: Date.now() + Math.random(), quando: new Date().toISOString(), azienda: 'trasporti', chi_nome: 'Tu', operazione, cosa, dove: null, come: 'Sistema' });

  // ------------------------------------------------ Traffico
  rpc.conferma_giri = (a, t2, u) => {
    if (!ha(u, 'traffico')) throw new Error('Non autorizzato');
    const gg = t.giri.filter((g) => g.data === a.p_data && !g.confermato_il);
    if (!gg.length) throw new Error('Nessun giro da confermare');
    gg.forEach((g) => { g.confermato_il = new Date().toISOString(); g.confermato_da = u; });
    registra('Giri', `${gg.length} giri confermati`); return gg.length;
  };

  // ------------------------------------------------ Giacenze
  const aperta = (id: string) => { const g = t.giacenze.find((x) => x.id === id && !x.chiusa_il); if (!g) throw new Error('Giacenza non trovata o già chiusa'); return g; };
  rpc.prenota_riconsegna = (a, t2, u) => {
    if (!ha(u, 'bolle', 'traffico')) throw new Error('Non autorizzato');
    const g = aperta(a.p_giacenza); if (a.p_data < oggi()) throw new Error('La data è passata');
    g.riconsegna_il = a.p_data; g.riconsegna_ora = a.p_ora ?? null; g.chiusa_il = new Date().toISOString();
    const b = t.bolle.find((x) => x.id === g.bolla_id)!; b.stato = 'Confermata'; b.data_consegna = a.p_data; if (a.p_ora) b.fascia = 'Alle ' + String(a.p_ora).slice(0, 5);
    (t.richieste_riconsegna ?? []).filter((r) => r.giacenza_id === g.id && !r.gestita_il).forEach((r) => { r.gestita_il = new Date().toISOString(); });
    registra('Riconsegna', `Prenotata per il ${a.p_data.slice(8, 10)}/${a.p_data.slice(5, 7)}${a.p_ora ? ' alle ' + String(a.p_ora).slice(0, 5) : ''}`);
  };
  rpc.chiesta_al_cliente = (a, t2, u) => { if (!ha(u, 'bolle', 'traffico')) throw new Error('Non autorizzato'); const g = aperta(a.p_giacenza); g.chiesta_il ??= new Date().toISOString(); return g.chiesta_il; };
  rpc.reso_al_mittente = (a, t2, u) => { if (!ha(u, 'bolle', 'traffico')) throw new Error('Non autorizzato'); const g = aperta(a.p_giacenza); g.reso_il = g.chiusa_il = new Date().toISOString(); registra('Reso', 'Reso al mittente'); };

  // ------------------------------------------------ Satellitare (solo direzione)
  t.mezzi.forEach((m, i) => { if (m.stato === 'Attivo') m.satellitare = 'SAT-0' + (i + 1); });
  const base: [number, number] = [45.2905, 9.1384];
  const stop: [number, number][] = [[45.455, 9.185], [45.478, 9.205], [45.503, 9.232]];
  t.sat_giornate = [
    { data: oggi(), mezzo_id: 'm2', autista_id: 'd-a2', giro_id: 'giro1', km_previsti: 54, km_fatti: 67, litri: 21.4,
      previsto: [base, ...stop, base], percorso: [base, [45.36, 9.15], [45.43, 9.11], [45.42, 9.11], [45.44, 9.16], stop[0], stop[1], stop[2], [45.46, 9.2]] },
    { data: oggi(), mezzo_id: 'm1', autista_id: 'd-a1', giro_id: null, km_previsti: 86, km_fatti: 88, litri: 9.8,
      previsto: [base, [45.53, 9.04], [45.51, 9.08], [45.55, 9.06], base], percorso: [base, [45.4, 9.08], [45.53, 9.04], [45.51, 9.08], [45.55, 9.06], [45.42, 9.1]] },
    { data: oggi(), mezzo_id: 'm3', autista_id: 'd-a3', giro_id: null, km_previsti: 210, km_fatti: 214, litri: 31.2,
      previsto: [base, [45.69, 9.67], [45.54, 10.21], base], percorso: [base, [45.5, 9.4], [45.69, 9.67], [45.54, 10.21], [45.13, 10.02], [45.3, 9.5]] },
  ];
  t.sat_anomalie = [
    { id: 'sa1', chiave: 'sa1', data: oggi(), mezzo_id: 'm2', autista_id: 'd-a2', tipo: 'Deviazione', dalle: alle(11, 20), alle: alle(11, 58), lat: 45.43, lng: 9.11, dettaglio: '6 km fuori rotta verso Corsico, lontano dalle fermate del giro', grave: true, vista_il: null },
    { id: 'sa2', chiave: 'sa2', data: oggi(), mezzo_id: 'm2', autista_id: 'd-a2', tipo: 'Sosta', dalle: alle(13, 5), alle: alle(13, 43), lat: 45.42, lng: 9.11, luogo: 'Buccinasco', dettaglio: '38 minuti fermo fuori dalle fermate del giro', grave: true, vista_il: null },
    { id: 'sa3', chiave: 'sa3', data: oggi(), mezzo_id: 'm2', autista_id: 'd-a2', tipo: 'Strada parallela', dalle: alle(10, 12), alle: alle(10, 12), dettaglio: 'Strada parallela a 400 m: non è un problema', grave: false, vista_il: null },
    { id: 'sa4', chiave: 'sa4', data: oggi(), mezzo_id: 'm3', autista_id: 'd-a3', tipo: 'Rifornimento', dalle: alle(15, 40), alle: alle(15, 40), lat: 45.13, lng: 10.02, luogo: 'Cremona', dettaglio: 'Carta carburante usata a 40 km dal giro', grave: true, vista_il: null },
    { id: 'sa5', chiave: 'sa5', data: oggi(), mezzo_id: 'm3', autista_id: 'd-a3', tipo: 'Motore acceso', dalle: alle(6, 10), alle: alle(6, 31), dettaglio: '21 minuti fermo con il motore acceso nel piazzale', grave: true, vista_il: null },
  ];
  rel.sat_giornate = { mezzi: 'mezzo_id', dipendenti: 'autista_id', giri: 'giro_id' };
  rel.sat_anomalie = { mezzi: 'mezzo_id', dipendenti: 'autista_id' };
  rpc.anomalia_vista = (a, t2, u) => { direzione(u); const x = t.sat_anomalie.find((y) => y.id === a.p_id && !y.vista_il); if (!x) throw new Error('Anomalia non trovata o già vista'); x.vista_il = new Date().toISOString(); x.vista_da = u; };

  // ------------------------------------------------ Telecamere (solo direzione)
  t.telecamere = ['Ingresso', 'Piazzale', 'Baie di carico', 'Corsia S03', 'Corsia S07', 'Stage'].map((nome, i) => ({ id: 'cam' + i, nome, zona: nome, attiva: true, ultima_foto: null, ultimo_contatto: new Date().toISOString() }));
  t.cam_avvisi = [
    { id: 'av1', telecamera_id: 'cam1', quando: alle(2, 14), tipo: 'Persona', descrizione: 'Persona vicino al cancello, fuori orario', foto: 'avvisi/1.jpg', grave: true, visto_il: null },
    { id: 'av2', telecamera_id: 'cam1', quando: alle(3, 40), tipo: 'Mezzo', descrizione: 'Auto ferma 6 minuti davanti all’ingresso', foto: 'avvisi/2.jpg', grave: true, visto_il: null },
    { id: 'av3', telecamera_id: 'cam0', quando: alle(5, 52), tipo: 'Apertura', descrizione: 'Apertura del magazzino: Magazziniere 1, badge regolare', foto: 'avvisi/3.jpg', grave: false, visto_il: null },
  ];
  t.cam_foto = t.storico.filter((s) => s.come === 'Pistola').slice(0, 6).map((s, i) => ({ id: 'cf' + i, storico_id: s.id, telecamera_id: 'cam2', quando: s.quando, foto: `scansioni/${s.id}.jpg` }));
  rel.cam_avvisi = { telecamere: 'telecamera_id' };
  rel.cam_foto = { telecamere: 'telecamera_id', storico: 'storico_id' };
  rpc.avviso_visto = (a, t2, u) => { direzione(u); const x = t.cam_avvisi.find((y) => y.id === a.p_id && !y.visto_il); if (!x) throw new Error('Avviso non trovato o già visto'); x.visto_il = new Date().toISOString(); };

  // ------------------------------------------------ viste: giacenze con «chiesta», anomalie del satellitare
  viste.push((x) => {
    x.giacenze_aperte = x.giacenze_aperte.map((r) => ({ ...r, chiesta_il: x.giacenze.find((g) => g.id === r.id)?.chiesta_il ?? null }));
    x.sat_anomalie.filter((a) => a.grave && !a.vista_il).forEach((a) => x.anomalie.push({ sezione: 'Satellitare',
      cosa: `${x.dipendenti.find((d) => d.id === a.autista_id)?.nome ?? x.mezzi.find((m) => m.id === a.mezzo_id)?.targa}: ${a.tipo.toLowerCase()} · ${a.dettaglio}`, chi: 'Direzione', da: a.dalle, dove: 'satellitare', rif: a.id }));
  });
});
