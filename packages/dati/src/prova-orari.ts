// Prova: telefoni del badge approvati dall'amministrazione, ferie che maturano, permesso per satellitare e telecamere,
// conservazione. Stessa logica della migrazione 20261022000800.
import { estendiProva } from './prova';

type R = Record<string, any>;
const ora = () => new Date().toISOString();

estendiProva(({ t, rpc, viste, regole, filtri }) => {
  const io = (u: string | null) => t.profili.find((p) => p.id === u);
  const dip = (u: string | null) => t.dipendenti.find((d) => d.profilo_id === u);
  const amministro = (dipId: string, u: string | null) => { const p = io(u); const d = t.dipendenti.find((x) => x.id === dipId);
    return !!p && !!d && d.azienda === p.azienda && (p.ruolo === 'direzione' || t.accessi?.some((x: R) => x.profilo_id === u && x.azienda === p.azienda && x.riepiloghi_presenze)); };

  // dati: un cambio di telefono che aspetta l'amministrazione; il permesso scritto per satellitare e telecamere
  for (const b of t.badge) { b.approvato_il ??= b.attivo ? ora() : null; b.disattivato_il ??= null; b.creato_il ??= ora(); }
  const a2 = t.dipendenti.find((d) => d.nome === 'Autista 2');
  if (a2) t.badge.push({ id: 'bg-a2', dipendente_id: a2.id, dispositivo: 'iphone-autista-2', attivo: false, approvato_il: null, disattivato_il: null, creato_il: new Date(Date.now() - 2 * 3600000).toISOString() });
  t.impostazioni.push(
    { chiave: 'controllo_lavoratori', valore: { satellitare: { tipo: 'Accordo sindacale', data: '2026-01-15', rif: '[riferimento di prova]' }, telecamere: { tipo: 'Autorizzazione Ispettorato', data: '2025-06-10', rif: '[riferimento di prova]' } } },
    { chiave: 'conservazione', valore: { posizioni_mesi: null, foto_giorni: null } },
  );

  viste.push((tt) => {
    tt.telefoni_da_approvare = tt.badge.filter((b) => !b.attivo && !b.disattivato_il && !b.approvato_il).map((b) => ({ id: b.id, dipendente_id: b.dipendente_id,
      nome: tt.dipendenti.find((d) => d.id === b.dipendente_id)?.nome ?? '—', dispositivo: b.dispositivo, creato_il: b.creato_il,
      cambio: tt.badge.some((x) => x.dipendente_id === b.dipendente_id && x.attivo) }));
  });
  filtri.telefoni_da_approvare = (r, _t, u) => amministro(r.dipendente_id, u);

  // in prova tutti i profili sono sullo stesso browser: un badge già attivo «segue» il telefono; un badge nuovo aspetta l'amministrazione
  rpc.registra_telefono = (a, _t, u) => {
    const d = dip(u); if (!d) throw new Error('Non sei tra i dipendenti');
    const b = t.badge.find((x) => x.dipendente_id === d.id && x.attivo); if (b) { b.dispositivo = a.p_dispositivo; return; }
    const att = t.badge.find((x) => x.dipendente_id === d.id && !x.attivo && !x.disattivato_il && !x.approvato_il);
    if (att) { att.dispositivo = a.p_dispositivo; return; }
    t.badge.push({ id: crypto.randomUUID(), dipendente_id: d.id, dispositivo: a.p_dispositivo, attivo: false, approvato_il: null, disattivato_il: null, creato_il: ora() });
  };
  const qr = rpc.mio_qr;
  rpc.mio_qr = (a, x, u) => {
    const d = dip(u);
    if (d && !t.badge.some((b) => b.dipendente_id === d.id && b.attivo) && t.badge.some((b) => b.dipendente_id === d.id && !b.attivo && !b.disattivato_il && !b.approvato_il))
      throw new Error('Telefono in attesa: l\'amministrazione deve approvarlo');
    return qr(a, x, u);
  };
  rpc.approva_telefono = (a, _t, u) => {
    const b = t.badge.find((x) => x.id === a.p_badge); if (!b || b.attivo || b.disattivato_il || b.approvato_il) throw new Error('Niente da approvare');
    if (!amministro(b.dipendente_id, u)) throw new Error('Non autorizzato');
    if (a.p_ok) { for (const x of t.badge) if (x.dipendente_id === b.dipendente_id && x.attivo) { x.attivo = false; x.disattivato_il = ora(); }
      Object.assign(b, { attivo: true, approvato_il: ora(), approvato_da: u }); }
    else b.disattivato_il = ora();
  };

  // ferie e permessi in dodicesimi da quanto spetta l'anno
  const oggi = new Date();
  const mesi = (assunto: string | null) => { const y = oggi.getFullYear(), m = oggi.getMonth();   // m = mesi interi dall'inizio dell'anno
    if (!assunto || assunto < `${y}-01-01`) return Math.max(0, Math.min(12, m));
    const a = new Date(assunto + 'T12:00:00'); return Math.max(0, Math.min(12, m - a.getMonth() - (a.getDate() > 15 ? 1 : 0))); };
  const ricalcola = (d: R) => {
    if (d.ferie_anno == null && d.permessi_anno == null) return;
    const n = mesi(d.assunto_il ?? null), anno = oggi.getFullYear();
    let f = t.ferie.find((x) => x.dipendente_id === d.id && x.anno === anno);
    if (!f) { f = { dipendente_id: d.id, anno, ferie_godute: 0, permessi_usati: 0 }; t.ferie.push(f); }
    f.ferie_maturate = Math.round(Number(d.ferie_anno ?? 0) * n / 12 * 10) / 10; f.permessi_spettanti = Math.round(Number(d.permessi_anno ?? 0) * n / 12 * 10) / 10; f.aggiornate_il = ora();
  };
  const regolaDip = regole.dipendenti;
  regole.dipendenti = (a, b, x, u) => {
    regolaDip?.(a, b, x, u);
    if (b.ferie_anno != null && (b.ferie_anno < 0 || b.ferie_anno > 60)) throw new Error('Ferie l\'anno: da 0 a 60 giorni');
    if (b.permessi_anno != null && (b.permessi_anno < 0 || b.permessi_anno > 400)) throw new Error('Permessi l\'anno: da 0 a 400 ore');
    if (a && (a.ferie_anno !== b.ferie_anno || a.permessi_anno !== b.permessi_anno || a.assunto_il !== b.assunto_il)) ricalcola(b);
  };

  // permesso (art. 4) e conservazione: li scrive la Direzione
  const imp = (k: string) => t.impostazioni.find((x) => x.chiave === k)!;
  const direzione = (u: string | null) => { if (io(u)?.ruolo !== 'direzione') throw new Error('Lo scrive la Direzione'); };
  rpc.scrivi_controllo = (a, _t, u) => {
    direzione(u);
    if (!['Accordo sindacale', 'Autorizzazione Ispettorato'].includes(a.p_tipo)) throw new Error('Scegli accordo sindacale o autorizzazione dell\'Ispettorato');
    if (!a.p_data || a.p_data > new Date().toISOString().slice(0, 10)) throw new Error('Scrivi la data del documento');
    if (!String(a.p_rif ?? '').trim()) throw new Error('Scrivi il riferimento (protocollo o numero)');
    imp('controllo_lavoratori').valore = { ...imp('controllo_lavoratori').valore, [a.p_cosa]: { tipo: a.p_tipo, data: a.p_data, rif: String(a.p_rif).trim() } };
  };
  rpc.scrivi_conservazione = (a, _t, u) => {
    direzione(u);
    if (a.p_posizioni_mesi != null && (a.p_posizioni_mesi < 1 || a.p_posizioni_mesi > 60)) throw new Error('Posizioni: da 1 a 60 mesi');
    if (a.p_foto_giorni != null && (a.p_foto_giorni < 1 || a.p_foto_giorni > 365)) throw new Error('Foto: da 1 a 365 giorni');
    imp('conservazione').valore = { posizioni_mesi: a.p_posizioni_mesi ?? null, foto_giorni: a.p_foto_giorni ?? null };
  };
});
