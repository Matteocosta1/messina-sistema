// Prova: accessi a tutte e due le società (si lavora in una alla volta), commercialista e riepiloghi presenze.
// Stessa logica della migrazione 20261022000400.
import { estendiProva } from './prova';

estendiProva(({ t, rpc, filtri }) => {
  t.accessi = t.profili.filter((p) => p.ruolo !== 'cliente').map((p) => ({ profilo_id: p.id, azienda: p.azienda, ruolo: p.ruolo, riepiloghi_presenze: p.ruolo === 'amministrazione' || p.ruolo === 'direzione' }));   // la Direzione vede Allarmi, Riepiloghi e Ferie (mockup, App presenze)
  t.accessi.push(
    { profilo_id: 'u-dir', azienda: 'corporation', ruolo: 'direzione', riepiloghi_presenze: false },        // i genitori: tutte e due le società
    { profilo_id: 'u-amm', azienda: 'corporation', ruolo: 'amministrazione', riepiloghi_presenze: true },   // Angela: anche i dipendenti della Corporation
    { profilo_id: 'u-cms', azienda: 'corporation', ruolo: 'commercialista', riepiloghi_presenze: false },
  );
  rpc.mie_aziende = (_a, _t, u) => t.accessi.filter((x) => x.profilo_id === u).map((x) => ({ azienda: x.azienda, ruolo: x.ruolo })).sort((x, y) => x.azienda.localeCompare(y.azienda));
  rpc.cambia_azienda = (a, _t, u) => {
    const x = t.accessi.find((y) => y.profilo_id === u && y.azienda === a.p_azienda); if (!x) throw new Error('Non hai accesso a questa società');
    const p = t.profili.find((y) => y.id === u)!; p.azienda = x.azienda; p.ruolo = x.ruolo; return x.ruolo;
  };
  // come le regole del database: presenze e dipendenti solo della società in cui si lavora e solo con il permesso;
  // anomalie solo agli amministratori e alla direzione
  const io = (u: string | null) => t.profili.find((y) => y.id === u);
  const presenze = (r: Record<string, any>, u: string | null) => { const p = io(u); const d = t.dipendenti.find((x) => x.id === r.dipendente_id);
    return !!p && !!d && (d.profilo_id === u || (d.azienda === p.azienda && t.accessi.some((x) => x.profilo_id === u && x.azienda === p.azienda && x.riepiloghi_presenze))
      || (p.azienda === 'trasporti' && ['traffico', 'direzione'].includes(p.ruolo) && d.azienda === 'trasporti' && d.mansione === 'Autista')); };
  filtri.presenze_oggi = (r, _t, u) => presenze(r, u);
  filtri.presenze_mese = (r, _t, u) => { const p = io(u); const d = t.dipendenti.find((x) => x.id === r.dipendente_id);
    return !!p && !!d && d.azienda === p.azienda && t.accessi.some((x) => x.profilo_id === u && x.azienda === p.azienda && x.riepiloghi_presenze); };
  filtri.dipendenti = (r, _t, u) => { const p = io(u); return !!p && (r.profilo_id === u || (r.azienda === p.azienda && ['amministrazione', 'traffico', 'direzione'].includes(p.ruolo))); };
  const riepiloghi = (dip: string, u: string | null) => { const p = io(u); const d = t.dipendenti.find((x) => x.id === dip);
    return !!p && !!d && (d.profilo_id === u || (d.azienda === p.azienda && t.accessi.some((x) => x.profilo_id === u && x.azienda === p.azienda && x.riepiloghi_presenze))); };
  filtri.anomalie = (r, _t, u) => {
    const p = io(u); if (!p || !['amministrazione', 'direzione'].includes(p.ruolo)) return false;
    if (r.sezione === 'Presenze') { const x = t.timbrature.find((k) => String(k.id) === String(r.rif)); return !!x && riepiloghi(x.dipendente_id, u); }
    if (r.sezione === 'Fatturazione') return t.fatture.find((f) => f.id === r.rif)?.azienda === p.azienda;
    return p.azienda === 'trasporti';   // bolle, magazzino, missioni, Telepass e satellitare sono dei Trasporti
  };
  filtri.correzioni = (r, _t, u) => riepiloghi(r.dipendente_id, u);
  filtri.ferie = (r, _t, u) => riepiloghi(r.dipendente_id, u);
  filtri.timbrature = (r, _t, u) => presenze(r, u);
  filtri.allarmi_gestiti = (r, _t, u) => { const x = t.timbrature.find((k) => k.id === r.timbratura_id); return !!x && riepiloghi(x.dipendente_id, u); };
  rpc.vede_presenze = (a, _t, u) => {
    const p = t.profili.find((y) => y.id === u);
    return !!p && p.azienda === a.p_azienda && t.accessi.some((x) => x.profilo_id === u && x.azienda === a.p_azienda && x.riepiloghi_presenze);
  };
});
