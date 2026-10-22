import React, { useState } from 'react';
import { Btn, Chip, Msg, Pill, Warn, Badge } from '@messina/ui';
import { useApp, useAzione, useDati, useStato, hm, quando, Mese, meseNome, oggiISO, Errore } from '../core';

const TABS: [string, string][] = [['oggi', 'Oggi'], ['correzioni', 'Correzioni'], ['allarmi', 'Allarmi'], ['riep', 'Riepiloghi'], ['ferie', 'Ferie'], ['telefoni', 'Telefoni'], ['mese', Mese()]];

// ------------------------------------------------------------------ conti del mese dalle timbrature
const isoLoc = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
function pasquetta(y: number) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
  h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31), giorno = ((h + l - 7 * m + 114) % 31) + 1; return isoLoc(new Date(y, mese - 1, giorno + 1)); }
const festivo = (g: string) => { const d = new Date(g + 'T12:00:00'); const md = g.slice(5);
  return d.getDay() === 0 || ['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26'].includes(md) || g === pasquetta(d.getFullYear()); };
const min = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const minDi = (iso: string) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
/** minuti di notte (22–6) tra due istanti dello stesso turno */
const notte = (e: Date, u: Date) => { let n = 0; for (let t = e.getTime(); t < u.getTime(); t += 60000) { const h = new Date(t).getHours(); if (h >= 22 || h < 6) n++; } return n; };

interface Conto { ore: number; ordinarie: number; straordinari: number; notturne: number; festive: number; ritardi: number; minRit: number; anticipate: number; minMeno: number; mancanti: number; assenze: number }
function conti(dip: any, T: any[], C: any[], mese: string): Conto {
  const r: Conto = { ore: 0, ordinarie: 0, straordinari: 0, notturne: 0, festive: 0, ritardi: 0, minRit: 0, anticipate: 0, minMeno: 0, mancanti: 0, assenze: 0 };
  const oggi = oggiISO(); const giornaliere = (Number(dip.ore_settimana) || 40) / 5 * 60;
  const [y, m] = mese.split('-').map(Number); const ultimo = new Date(y, m, 0).getDate();
  for (let g = 1; g <= ultimo; g++) {
    const giorno = `${mese}-${String(g).padStart(2, '0')}`; if (giorno > oggi) break;
    const t = T.filter((x) => x.dipendente_id === dip.id && isoLoc(new Date(x.quando)) === giorno);
    const e = t.filter((x) => x.verso === 'Entrata').map((x) => x.quando).sort()[0];
    let u = t.filter((x) => x.verso === 'Uscita').map((x) => x.quando).sort().pop();
    if (!u) { const k = C.find((x) => x.dipendente_id === dip.id && x.giorno === giorno && x.verso === 'Uscita'); if (k) u = new Date(giorno + 'T' + k.ora).toISOString(); }
    const feriale = new Date(giorno + 'T12:00:00').getDay() % 6 !== 0 && !festivo(giorno);
    if (!e) { if (feriale && giorno < oggi) r.assenze++; continue; }
    if (dip.inizio && minDi(e) > min(dip.inizio) + 5) { r.ritardi++; r.minRit += minDi(e) - min(dip.inizio); }
    if (!u) { if (giorno < oggi) r.mancanti++; continue; }
    if (dip.fine && minDi(u) < min(dip.fine) - 5) { r.anticipate++; r.minMeno += min(dip.fine) - minDi(u); }
    const lavoro = Math.max(0, (new Date(u).getTime() - new Date(e).getTime()) / 60000);
    r.ore += lavoro;
    if (festivo(giorno)) r.festive += lavoro;
    else { r.ordinarie += Math.min(lavoro, giornaliere); r.straordinari += Math.max(0, lavoro - giornaliere); }
    r.notturne += notte(new Date(e), new Date(u));
  }
  for (const k of ['ore', 'ordinarie', 'straordinari', 'notturne', 'festive'] as const) r[k] = Math.round(r[k] / 6) / 10;
  return r;
}
const meseScorso = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return isoLoc(d).slice(0, 7); };

export function Presenze({ tab }: { tab?: string }) {
  const { vai } = useApp();
  const t = TABS.some(([k]) => k === tab) ? tab! : 'oggi';
  const { dati } = useDati(async (d) => {
    const [an, allarmi, gestiti, tel] = await Promise.all([
      d.from<any>('anomalie').select('*').eq('sezione', 'Presenze'),
      d.from<any>('timbrature').select('id').eq('esito', 'Rifiutata').gte('quando', new Date(Date.now() - 30 * 86400000).toISOString()),
      d.from<any>('allarmi_gestiti').select('timbratura_id'),
      d.from<any>('telefoni_da_approvare').select('id').then((x) => x, () => [] as any[]),
    ]);
    const g = new Set(gestiti.map((x) => String(x.timbratura_id)));
    return { nFix: an.filter((a) => a.dove === 'presenze/correzioni').length, nAll: allarmi.filter((a) => !g.has(String(a.id))).length, nTel: tel.length };
  }, []);
  if (!dati) return null;
  return (<>
    <div className="row">{TABS.filter(([k]) => k !== 'telefoni' || t === 'telefoni').map(([k, l]) => <Chip key={k} on={t === k} onClick={() => vai('presenze/' + k)}>{l}{k === 'correzioni' && <Badge n={dati.nFix} />}{k === 'allarmi' && <Badge n={dati.nAll} />}{k === 'telefoni' && <Badge n={dati.nTel} />}</Chip>)}</div>
    {t === 'oggi' && <Oggi nFix={dati.nFix} />}
    {t === 'correzioni' && <Correzioni />}
    {t === 'allarmi' && <Allarmi n={dati.nAll} />}
    {t === 'riep' && <Riepiloghi />}
    {t === 'ferie' && <Ferie />}
    {t === 'telefoni' && <Telefoni />}
    {t === 'mese' && <MeseTab nFix={dati.nFix} />}
    <p className="lbl" style={{ margin: 0 }}>Ognuno timbra con il badge virtuale sul suo telefono, passandolo sul lettore all’ingresso. Il QR cambia ogni 30 secondi, così una foto o uno screenshot non servono a timbrare per un collega.</p>
  </>);
}

function Oggi({ nFix }: { nFix: number }) {
  const { dati: P } = useDati((d) => d.from<any>('presenze_oggi').select('*').order('nome'), []);
  if (!P) return null;
  const presenti = P.filter((p) => p.entrata && !p.uscita).length;
  return (<>
    <div className="grid g4">
      <div className="glass card"><div className="lbl">Presenti ora</div><div className="big">{presenti}</div><div className="lbl">su {P.length}</div></div>
      <div className="glass card"><div className="lbl">In ritardo</div><div className="big">{P.filter((p) => String(p.stato).startsWith('Ritardo')).length}</div></div>
      <div className="glass card"><div className="lbl">Ferie e malattia</div><div className="big">{P.filter((p) => !p.entrata).length}</div></div>
      <div className="glass card"><div className="lbl">Uscite da sistemare</div><div className="big">{nFix}</div><div className="lbl">di ieri</div></div>
    </div>
    <div className="glass tbox"><table className="t" style={{ minWidth: 720 }}><thead><tr><th>Dipendente</th><th>Reparto</th><th>Contratto</th><th>Entrata</th><th>Uscita</th><th>Stato</th></tr></thead><tbody>
      {P.map((d) => <tr key={d.dipendente_id}><td><b>{d.nome}</b></td><td>{d.reparto ?? '—'}</td><td>{d.ore_settimana ? `${Number(d.ore_settimana)} h a settimana` : '—'}</td><td>{hm(d.entrata)}</td><td>{hm(d.uscita)}</td>
        <td>{String(d.stato).startsWith('Ritardo') ? <Pill tone="red">{d.stato}</Pill> : d.stato === 'Ferie' ? <Pill>Ferie</Pill> : d.uscita ? 'Uscito' : d.stato}</td></tr>)}
    </tbody></table></div>
  </>);
}

function Correzioni() {
  const { db } = useApp();
  const az = useAzione();
  const [ap, setAp] = useState<{ id: string; ora: string; motivo: string } | null>(null);
  const { dati } = useDati(async (d) => {
    const an = await d.from<any>('anomalie').select('*').eq('sezione', 'Presenze').eq('dove', 'presenze/correzioni');
    const T = an.length ? await d.from<any>('timbrature').select('id,quando,dipendente_id,dipendenti(nome)').in('id', an.map((a) => a.rif)) : [];
    const st = T.length ? await d.from<any>('storico').select('chi_nome,quando,operazione').in('chi_nome', [...new Set(T.map((x) => x.dipendenti?.nome))]).gte('quando', T.map((x) => x.quando).sort()[0]).order('quando', { ascending: false }).limit(500) : [];
    return T.map((x) => { const g = isoLoc(new Date(x.quando)); const ult = st.find((s) => s.chi_nome === x.dipendenti?.nome && isoLoc(new Date(s.quando)) === g);
      return { ...x, giorno: g, sugg: ult ? hm(ult.quando) : '', motivoSugg: ult ? `Ultima attività alle ${hm(ult.quando)} (${ult.operazione.toLowerCase()})` : 'Nessuna attività nelle app quel giorno: chiedi al dipendente' }; });
  }, []);
  if (!dati) return null;
  const salva = (x: any) => az.esegui(() => db.rpc('correggi_uscita', { p_dipendente: x.dipendente_id, p_giorno: x.giorno, p_ora: ap!.ora, p_motivo: ap!.motivo })).then((ok) => ok && setAp(null));
  return (<>
    {dati.length ? <Warn n={dati.length}>Uscite</Warn> : <Msg>Tutto a posto.</Msg>}
    <p className="lbl" style={{ margin: 0 }}>Il programma suggerisce l’orario guardando l’ultima attività nelle app. Angela conferma o corregge.</p>
    <Errore testo={az.errore} />
    <div className="glass tbox"><table className="t" style={{ minWidth: 760 }}><thead><tr><th>Dipendente</th><th>Entrata</th><th>Manca</th><th>Suggerimento</th><th></th></tr></thead><tbody>
      {dati.map((x) => <tr key={x.id}><td><b>{x.dipendenti?.nome}</b></td><td>{quando(x.quando)}</td><td><span className="miss">Uscita</span></td><td className="lbl">{x.motivoSugg}</td>
        <td>{ap?.id === x.id ? <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          <input className="input" type="time" aria-label="Ora di uscita" style={{ width: 110, minHeight: 34, padding: '4px 8px' }} value={ap!.ora} onChange={(e) => setAp({ ...ap!, ora: e.target.value })} />
          <input className="input" aria-label="Motivo" placeholder="Motivo" style={{ width: 180, minHeight: 34, padding: '4px 8px' }} value={ap!.motivo} onChange={(e) => setAp({ ...ap!, motivo: e.target.value })} />
          <Btn sm onClick={() => salva(x)} disabled={!ap!.ora || !ap!.motivo.trim() || az.inCorso}>Salva</Btn></span>
          : <Btn ghost sm onClick={() => setAp({ id: x.id, ora: x.sugg, motivo: x.sugg ? x.motivoSugg : '' })}>Sistema</Btn>}</td></tr>)}
    </tbody></table></div>
  </>);
}

function Allarmi({ n }: { n: number }) {
  const { db, io } = useApp();
  const az = useAzione();
  const [msg, setMsg] = useState('');
  const { dati } = useDati(async (d) => {
    const [A, g] = await Promise.all([
      d.from<any>('timbrature').select('*,dipendenti(nome)').eq('esito', 'Rifiutata').gte('quando', new Date(Date.now() - 30 * 86400000).toISOString()).order('quando', { ascending: false }),
      d.from<any>('allarmi_gestiti').select('timbratura_id'),
      d.from<any>('telefoni_da_approvare').select('id').then((x) => x, () => [] as any[]),
    ]);
    return { A, g: new Set(g.map((x) => String(x.timbratura_id))) };
  }, []);
  if (!dati) return null;
  const avvisa = (a: any) => az.esegui(() => db.from('allarmi_gestiti').insert({ timbratura_id: a.id, nota: 'Dipendente avvisato', da: io.id }))
    .then((ok) => ok && setMsg('Messaggio pronto per il dipendente: gli spiega cosa è successo e lo invita a parlarne con Angela.'));
  return (<>
    {n > 0 && <Warn n={n}>Sospette</Warn>}
    <div className="row between"><span className="lbl">Timbrature rifiutate: il lettore non ha timbrato, ma ha registrato di chi era il badge.</span><Pill tone="dark">Riservato</Pill></div>
    {msg && <Msg>{msg}</Msg>}
    <Errore testo={az.errore} />
    <div className="glass tbox"><table className="t" style={{ minWidth: 980 }}><thead><tr><th>Quando</th><th>Badge di</th><th>Da quale telefono</th><th>Dove</th><th>Cosa è successo</th><th></th></tr></thead><tbody>
      {dati.A.map((a) => { const g = dati.g.has(String(a.id)); return <tr key={a.id} className={g ? '' : 'korow'}><td>{quando(a.quando)}</td><td><b>{a.dipendenti?.nome ?? 'Sconosciuto'}</b></td>
        <td>{a.dispositivo ?? 'Telefono non registrato'}</td><td>{a.lettore ?? '—'}</td><td>{a.motivo}</td>
        <td>{g ? <Pill tone="ok">Gestito</Pill> : <Btn ghost sm onClick={() => avvisa(a)} disabled={az.inCorso}>Avvisa il dipendente</Btn>}</td></tr>; })}
      {!dati.A.length && <tr><td colSpan={6} className="lbl">Nessuna timbratura rifiutata negli ultimi 30 giorni.</td></tr>}
    </tbody></table></div>
    <p className="lbl" style={{ margin: 0 }}>Ogni badge è legato a un solo telefono, registrato quando il dipendente attiva l’app. Un badge su un altro telefono, uno screenshot vecchio o un badge chiuso non timbrano: il programma li riconosce sempre e sa a chi appartenevano.</p>
  </>);
}

/** timbrature e correzioni di questo mese e del precedente */
function useTimbrature() {
  return useDati(async (d) => {
    const dal = meseScorso() + '-01';
    const [dip, T, C] = await Promise.all([
      d.from<any>('dipendenti').select('*').eq('attivo', true).order('nome'),
      d.from<any>('timbrature').select('dipendente_id,quando,verso').eq('esito', 'Valida').gte('quando', dal + 'T00:00:00'),
      d.from<any>('correzioni').select('dipendente_id,giorno,verso,ora').gte('giorno', dal),
    ]);
    return { dip, T, C };
  }, []);
}

function Riepiloghi() {
  const { dati } = useTimbrature();
  if (!dati) return null;
  const ora = oggiISO().slice(0, 7), prima = meseScorso();
  const giornoOggi = new Date().getDate(), giorniPrima = new Date(+prima.slice(0, 4), +prima.slice(5, 7), 0).getDate();
  return (<>
    <div className="glass card row between"><span><b>{Mese()}</b> <span className="lbl">ritardi e uscite anticipate di ognuno, dalle timbrature</span></span><Pill tone="dark">Riservato</Pill></div>
    <div className="glass tbox"><table className="t nw" style={{ minWidth: 820 }}><thead><tr><th>Dipendente</th><th>Ritardi</th><th>Minuti di ritardo</th><th>Uscite anticipate</th><th>Minuti in meno</th><th>Rispetto a {meseNome(new Date(prima + '-15'))}</th></tr></thead><tbody>
      {dati.dip.map((d) => { const a = conti(d, dati.T, dati.C, ora), b = conti(d, dati.T, dati.C, prima);
        const x = (a.minRit + a.minMeno) / giornoOggi, y = (b.minRit + b.minMeno) / giorniPrima;
        const tr = x > y * 1.2 + 0.3 ? 'In peggioramento' : x < y * 0.8 - 0.3 ? 'In miglioramento' : 'In linea';
        return <tr key={d.id}><td><b>{d.nome}</b></td><td>{a.ritardi}</td><td>{a.minRit} min</td><td>{a.anticipate}</td><td>{a.minMeno} min</td>
          <td>{tr === 'In peggioramento' ? <Pill tone="red">{tr}</Pill> : tr === 'In miglioramento' ? <Pill tone="ok">{tr}</Pill> : <span className="lbl">{tr}</span>}</td></tr>; })}
    </tbody></table></div>
    <p className="lbl" style={{ margin: 0 }}>Ogni dipendente vede solo i suoi orari nella sua app, mai quelli dei colleghi. Prima di attivarlo: informativa firmata dai dipendenti e verifica del consulente del lavoro.</p>
  </>);
}

function Ferie() {
  const { db } = useApp();
  const az = useAzione();
  const anno = new Date().getFullYear();
  const [s, set] = useStato({ mod: '' as string, ferie: '', permessi: '', assunto: '', msg: '' });
  const { dati } = useDati(async (d) => {
    const [F, D] = await Promise.all([
      d.from<any>('ferie').select('*').eq('anno', anno),
      d.from<any>('dipendenti').select('id,nome,assunto_il,ferie_anno,permessi_anno').eq('attivo', true).order('nome'),
    ]);
    return { F, D };
  }, []);
  if (!dati) return null;
  const n = (x: any) => Number(x ?? 0).toLocaleString('it-IT');
  const salva = (id: string) => az.esegui(() => db.from('dipendenti').update({ ferie_anno: s.ferie === '' ? null : Number(s.ferie.replace(',', '.')),
    permessi_anno: s.permessi === '' ? null : Number(s.permessi.replace(',', '.')), assunto_il: s.assunto || null }).eq('id', id))
    .then((ok) => ok && set({ mod: '', msg: 'Salvato: ferie e permessi rifatti fino al mese scorso.' }));
  const inp = (v: string, k: 'ferie' | 'permessi', l: string) => <input className="input" style={{ width: 70, minHeight: 32, padding: '4px 8px' }} inputMode="decimal" aria-label={l} value={v} onChange={(e) => set({ [k]: e.target.value } as any)} />;
  return (<>
    {s.msg && <Msg>{s.msg}</Msg>}
    <Errore testo={az.errore} />
    <div className="glass tbox"><table className="t nw" style={{ minWidth: 1100 }}><thead><tr><th>Dipendente</th>{s.mod && <th>L’anno</th>}<th>Ferie maturate</th><th>Godute</th><th>Restano</th><th>Permessi spettanti</th><th>Usati</th><th>Restano</th><th>Da guardare</th></tr></thead><tbody>
      {dati.D.map((d) => {
        const f = dati.F.find((x) => x.dipendente_id === d.id);
        const nota = !d.ferie_anno ? 'Manca quanto spetta l’anno (contratto)' : f && Number(f.ferie_godute) < 10 && new Date().getMonth() >= 8 ? 'Meno di 2 settimane godute quest’anno: va pianificato entro dicembre' : '';
        return <tr key={d.id}><td><b>{d.nome}</b></td>
          {/* Da decidere (STATO): la colonna «L’anno» e il tasto «Cambia» (quanto spetta l’anno, data di assunzione) non sono nel mockup */}
          {s.mod && <td>{s.mod === d.id ? <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>{inp(s.ferie, 'ferie', 'Ferie l’anno in giorni')} gg {inp(s.permessi, 'permessi', 'Permessi l’anno in ore')} h
            <input className="input" type="date" style={{ minHeight: 32, padding: '4px 8px' }} aria-label="Assunto il" value={s.assunto} onChange={(e) => set({ assunto: e.target.value })} /></span>
            : d.ferie_anno != null || d.permessi_anno != null ? `${n(d.ferie_anno)} gg · ${n(d.permessi_anno)} h` : <span className="lbl">—</span>}</td>}
          <td>{f ? n(f.ferie_maturate) + ' gg' : '—'}</td><td>{f ? n(f.ferie_godute) + ' gg' : '—'}</td><td><b>{f ? n(f.ferie_maturate - f.ferie_godute) + ' gg' : '—'}</b></td>
          <td>{f ? n(f.permessi_spettanti) + ' h' : '—'}</td><td>{f ? n(f.permessi_usati) + ' h' : '—'}</td><td><b>{f ? n(f.permessi_spettanti - f.permessi_usati) + ' h' : '—'}</b></td>
          <td>{nota ? <span className="miss">{nota}</span> : <span className="lbl">—</span>}</td>
          {s.mod === d.id && <td><span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><Btn sm onClick={() => salva(d.id)} disabled={az.inCorso}>Salva</Btn><Btn ghost sm onClick={() => set({ mod: '' })}>Annulla</Btn></span></td>}</tr>; })}
      {!dati.D.length && <tr><td colSpan={10} className="lbl">Nessun dipendente.</td></tr>}
    </tbody></table></div>
    <p className="lbl" style={{ margin: 0 }}>Ferie e permessi maturano da soli il primo di ogni mese, un dodicesimo di quanto spetta l’anno (dal mese di assunzione, se entro il 15). Quanto spetta lo dice il contratto collettivo di ciascuno. Per legge almeno 4 settimane di ferie l’anno: 2 da godere nell’anno, le altre entro i 18 mesi dopo.</p>
  </>);
}

// Telefoni del badge: il primo telefono e ogni cambio li approva l'amministrazione (così nessuno registra il badge sul telefono di un altro)
function Telefoni() {
  const { db } = useApp();
  const az = useAzione();
  const [msg, setMsg] = useState('');
  const { dati } = useDati((d) => d.from<any>('telefoni_da_approvare').select('*').order('creato_il'), []);
  if (!dati) return null;
  const decidi = (t: any, ok: boolean) => az.esegui(() => db.rpc('approva_telefono', { p_badge: t.id, p_ok: ok }))
    .then((x) => x && setMsg(ok ? `${t.nome}: telefono approvato${t.cambio ? ', quello vecchio non timbra più' : ''}.` : `${t.nome}: richiesta rifiutata.`));
  return (<>
    {msg && <Msg>{msg}</Msg>}
    <Errore testo={az.errore} />
    <div className="glass tbox"><table className="t nw"><thead><tr><th>Dipendente</th><th>Richiesta</th><th>Quando</th><th /></tr></thead><tbody>
      {dati.length ? dati.map((t) => <tr key={t.id}><td><b>{t.nome}</b></td><td>{t.cambio ? 'Cambio telefono' : 'Primo telefono'}</td><td className="lbl">{quando(t.creato_il)}</td>
        <td><span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><Btn sm onClick={() => decidi(t, true)} disabled={az.inCorso}>Approva</Btn><Btn ghost sm onClick={() => decidi(t, false)} disabled={az.inCorso}>Rifiuta</Btn></span></td></tr>)
        : <tr><td colSpan={4} className="lbl">Nessun telefono da approvare.</td></tr>}
    </tbody></table></div>
    <p className="lbl" style={{ margin: 0 }}>Prima di approvare, chiedete al dipendente se il telefono è il suo: dopo, il badge funziona solo lì.</p>
  </>);
}

function MeseTab({ nFix }: { nFix: number }) {
  const { dati } = useTimbrature();
  const [fatto, setFatto] = useState(false);
  if (!dati) return null;
  const mese = oggiISO().slice(0, 7);
  const R = dati.dip.map((d) => ({ d, c: conti(d, dati.T, dati.C, mese) }));
  const n = (x: number) => x.toLocaleString('it-IT');
  const prepara = () => {
    const righe = [['Dipendente', 'Contratto', 'Ore settimanali', 'Ore ordinarie', 'Straordinari', 'Notturne', 'Festive', 'Giorni di assenza'],
      ...R.map(({ d, c }) => [d.nome, d.contratto ?? '', d.ore_settimana ?? '', c.ordinarie, c.straordinari, c.notturne, c.festive, c.assenze])];
    const csv = righe.map((r) => r.map((x) => `"${String(x).replace('.', ',').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = `presenze-${mese}.csv`; a.click();
    setFatto(true);
  };
  return (<>
    <div className="glass tbox"><table className="t" style={{ minWidth: 860 }}><thead><tr><th>Dipendente</th><th>Contratto</th><th>Ore ordinarie</th><th>Straordinari</th><th>Notturne</th><th>Festive</th><th>Assenze</th></tr></thead><tbody>
      {R.map(({ d, c }) => <tr key={d.id}><td><b>{d.nome}</b></td><td>{d.ore_settimana ? Number(d.ore_settimana) + ' h' : '—'}</td><td>{n(c.ordinarie)} h</td><td>{n(c.straordinari)} h</td><td>{n(c.notturne)} h</td><td>{n(c.festive)} h</td>
        <td className="lbl">{c.assenze ? (c.assenze === 1 ? '1 giorno' : c.assenze + ' giorni') : '—'}</td></tr>)}
    </tbody></table></div>
    {fatto && <Msg>Conteggi di {meseNome()} pronti per Angela e per il consulente del lavoro, divisi secondo il contratto di ognuno.</Msg>}
    {nFix > 0 && !fatto && <Warn n={nFix}>Uscite</Warn>}
    <div className="row">{!fatto && (nFix ? <><Btn disabled>Prepara</Btn><span className="lbl">Si sblocca quando le uscite sono corrette.</span></> : <Btn onClick={prepara}>Prepara</Btn>)}
      <span className="lbl">Contributi e tasse: da decidere con la Direzione se li prepara il programma o il consulente.</span></div>
  </>);
}
