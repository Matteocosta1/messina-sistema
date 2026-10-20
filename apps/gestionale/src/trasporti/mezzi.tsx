import React, { useState } from 'react';
import { Btn, Chip, Pill } from '@messina/ui';
import { useApp, useAzione, useDati, oggiISO, meseISO, Mese, hm, giornoCorto, eur, Errore } from '../core';

const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
const vicino = (d: string | null, giorni = 60) => !!d && new Date(d).getTime() - Date.now() < giorni * 86400000;

// ------------------------------------------------------------------ Mezzi
const TIPI: [string, string][] = [['Sprinter', 'Sprinter'], ['Furgone', 'Furgoni'], ['Motrice', 'Motrici'], ['Tre assi', 'Tre assi'], ['Bilico', 'Bilici']];
export function Mezzi() {
  const [f, setF] = useState('Sprinter');
  const { dati } = useDati(async (d) => {
    const [mezzi, giri] = await Promise.all([
      d.from<any>('mezzi').select('*,dipendenti(nome)').order('targa'),
      d.from<any>('giri').select('mezzo_id,stato,dipendenti(nome)').eq('data', oggiISO()),
    ]);
    return { mezzi, giri };
  }, []);
  if (!dati) return null;
  const list = dati.mezzi.filter((m) => m.tipo === f);
  const scad = (m: any) => {
    const s: [string, string][] = [];
    if (m.revisione) s.push(['Revisione', m.revisione]); if (m.assicurazione) s.push(['Assicurazione', m.assicurazione]);
    s.sort((a, b) => a[1].localeCompare(b[1]));
    if (m.stato === 'Officina') return 'In officina';
    if (m.tagliando_km != null && m.tagliando_km <= 1000) return `Tagliando tra ${m.tagliando_km.toLocaleString('it-IT')} km`;
    return s[0] ? `${s[0][0]} ${fmt(s[0][1])}` : '—';
  };
  const oggi = (m: any) => { if (m.stato !== 'Attivo') return 'Fermo'; const g = dati.giri.find((x) => x.mezzo_id === m.id); return g ? (g.stato === 'Rientrato' || g.stato === 'Chiuso' ? 'Rientrato' : g.stato === 'Partito' ? 'Partito' : 'In carico') : 'Libero'; };
  return (<>
    <div className="row">{TIPI.map(([k, l]) => <Chip key={k} on={f === k} onClick={() => setF(k)}>{l}</Chip>)}</div>
    <div className="glass tbox"><table className="t"><thead><tr><th>Targa</th><th>Tipo</th><th>Sponda</th><th>Autista</th><th>Telepass</th><th>Scadenza</th><th>Oggi</th></tr></thead><tbody>
      {list.length ? list.map((m) => { const o = oggi(m); const sc = scad(m); const giro = dati.giri.find((x) => x.mezzo_id === m.id);
        return <tr key={m.id}><td><b>{m.targa}</b></td><td>{m.tipo}</td><td>{m.sponda ? 'Sì' : 'No'}</td><td>{giro?.dipendenti?.nome ?? m.dipendenti?.nome ?? '—'}</td><td>{m.telepass ?? '—'}</td>
          <td>{vicino(m.revisione, 30) || vicino(m.assicurazione, 30) ? <span className="miss">{sc}</span> : sc}</td><td>{o === 'Fermo' ? <Pill tone="red">Fermo</Pill> : <Pill tone="dark">{o}</Pill>}</td></tr>; })
        : <tr><td colSpan={7} className="lbl">Nessun mezzo di questo tipo.</td></tr>}
    </tbody></table></div>
  </>);
}

// ------------------------------------------------------------------ Autisti
export function Autisti() {
  const [f, setF] = useState('Tutti');
  const { dati } = useDati(async (d) => {
    const [aut, giri, pres, mezzi] = await Promise.all([
      d.from<any>('dipendenti').select('*').eq('azienda', 'trasporti').eq('mansione', 'Autista').eq('attivo', true).order('nome'),
      d.from<any>('giri').select('*,mezzi(tipo,targa),fermate(esito)').eq('data', oggiISO()),
      d.from<any>('presenze_oggi').select('*'),
      d.from<any>('mezzi').select('tipo,targa,autista_id'),
    ]);
    return { aut, giri, pres, mezzi };
  }, []);
  if (!dati) return null;
  const righe = dati.aut.map((a) => {
    const g = dati.giri.find((x) => x.autista_id === a.id); const p = dati.pres.find((x) => x.dipendente_id === a.id);
    const m = g?.mezzi ?? dati.mezzi.find((x) => x.autista_id === a.id);
    const fatte = g ? g.fermate.filter((x: any) => x.esito !== 'Da fare').length : 0;
    const stato = !p?.entrata ? 'Assente' : g?.stato === 'Partito' ? 'Partito' : 'Rientrato';
    const doc: string[] = [];
    if (vicino(a.patente_scadenza)) doc.push('Patente scade il ' + fmt(a.patente_scadenza));
    if (vicino(a.cqc_scadenza)) doc.push('CQC scade il ' + fmt(a.cqc_scadenza));
    const giro = g ? `${fatte} di ${g.fermate.length} fermate` : !p?.entrata ? (p?.stato === 'Ferie' ? 'Ferie' : 'Assente') : 'In carico';
    return { a, m, g, p, stato, doc, giro };
  });
  const list = righe.filter((r) => f === 'Tutti' || r.stato === f);
  return (<>
    <div className="row">{['Tutti', 'Partito', 'Rientrato', 'Assente'].map((x) => <Chip key={x} on={f === x} onClick={() => setF(x)}>{x}</Chip>)}</div>
    <div className="glass tbox"><table className="t"><thead><tr><th>Autista</th><th>Mezzo</th><th>Zona</th><th>Giro</th><th>Entrata</th><th>Patente</th></tr></thead><tbody>
      {list.map((r) => <tr key={r.a.id}><td><b>{r.a.nome}</b></td><td>{r.m ? `${r.m.tipo} ${r.m.targa}` : '—'}</td><td>{r.g?.zona ?? '—'}</td>
        <td>{r.giro === 'Ferie' ? <Pill>Ferie</Pill> : r.giro}</td><td>{hm(r.p?.entrata)}</td><td>{r.doc.length ? <span className="miss">{r.doc.join(' · ')}</span> : 'Valide'}</td></tr>)}
      {!list.length && <tr><td colSpan={6} className="lbl">Nessun autista.</td></tr>}
    </tbody></table></div>
    <p className="lbl" style={{ margin: 0 }}>Entrate e uscite arrivano dal badge virtuale sul telefono (voce Presenze); Angela le trova già pronte per gli stipendi.</p>
  </>);
}

// ------------------------------------------------------------------ Telepass
export function Telepass() {
  const { db, io } = useApp();
  const az = useAzione();
  const [sel, setSel] = useState('');
  const { dati } = useDati(async (d) => {
    const [P, ok] = await Promise.all([
      d.from<any>('telepass_passaggi').select('*').gte('quando', meseISO() + '-01T00:00:00').order('quando', { ascending: false }),
      d.from<any>('telepass_controllati').select('telepass_id'),
    ]);
    return { P, visti: new Set(ok.map((x) => x.telepass_id)) };
  }, []);
  if (!dati) return null;
  const oggi = oggiISO();
  const P = dati.P; const daCtrl = (p: any) => p.controllo && !dati.visti.has(p.id);
  const aut = [...new Set(P.map((p) => p.autista ?? p.targa))];
  const R = aut.map((n) => { const l = P.filter((p) => (p.autista ?? p.targa) === n);
    return { n, mezzo: `${l[0].tipo} ${l[0].targa}`, oggi: l.filter((p) => p.quando.slice(0, 10) === oggi).reduce((s, p) => s + Number(p.importo), 0), mese: l.reduce((s, p) => s + Number(p.importo), 0), num: l.length, flag: l.filter(daCtrl).length, l }; })
    .sort((a, b) => b.flag - a.flag || b.mese - a.mese);
  const cur = R.find((r) => r.n === sel) ?? R[0];
  const somma = (f: (p: any) => boolean) => P.filter(f).reduce((s, p) => s + Number(p.importo), 0);
  const visto = (p: any) => az.esegui(() => db.from('telepass_controllati').insert({ telepass_id: p.id, da: io.id }));
  return (<>
    <div className="grid g4">
      <div className="glass card"><div className="lbl">Spesa di oggi</div><div className="big">{eur(somma((p) => p.quando.slice(0, 10) === oggi))}</div></div>
      <div className="glass card"><div className="lbl">Spesa di {Mese().toLowerCase()}</div><div className="big">{eur(somma(() => true))}</div><div className="lbl">va nei costi dei mezzi</div></div>
      <div className="glass card"><div className="lbl">Passaggi a {Mese().toLowerCase()}</div><div className="big">{P.length}</div></div>
      <div className="glass card"><div className="lbl">Da controllare</div><div className="big">{P.filter(daCtrl).length}</div><div className="lbl">fuori orario o senza giro</div></div>
    </div>
    <Errore testo={az.errore} />
    <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
      <div className="glass tbox" style={{ flex: '1 1 600px', minWidth: 0 }}><table className="t nw"><thead><tr><th>Autista</th><th>Mezzo</th><th>Oggi</th><th>{Mese()}</th><th>Passaggi</th><th>Controllo</th></tr></thead><tbody>
        {R.map((r) => <tr key={r.n} className="click" onClick={() => setSel(r.n)} style={cur?.n === r.n ? { background: 'var(--soft)' } : undefined}><td><b>{r.n}</b></td><td>{r.mezzo}</td><td>{eur(r.oggi)}</td><td>{eur(r.mese)}</td><td>{r.num}</td>
          <td>{r.flag ? <Pill tone="red">{String(r.flag)}</Pill> : <span className="lbl">—</span>}</td></tr>)}
        {!R.length && <tr><td colSpan={6} className="lbl">Nessun passaggio questo mese.</td></tr>}
      </tbody></table></div>
      {cur && <div className="glass" style={{ flex: '1 1 600px', minWidth: 0 }}><div style={{ padding: '14px 14px 0', fontWeight: 700 }}>Passaggi di {cur.n}</div><div className="tbox"><table className="t nw"><thead><tr><th>Giorno</th><th>Ora</th><th>Tratta</th><th>Importo</th><th>Nota</th></tr></thead><tbody>
        {cur.l.map((m: any) => <tr key={m.id} className={daCtrl(m) ? 'korow' : ''}><td>{giornoCorto(m.quando)}</td><td>{hm(m.quando)}</td><td>{m.entrata} → {m.uscita}</td><td>{eur(Number(m.importo))}</td>
          <td>{m.controllo ? <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>{m.controllo}{daCtrl(m) && <Btn ghost sm onClick={() => visto(m)} disabled={az.inCorso}>Visto</Btn>}</span> : <span className="lbl">Nel giro</span>}</td></tr>)}
      </tbody></table></div></div>}
    </div>
    <p className="lbl" style={{ margin: 0 }}>Ogni apparato Telepass è legato al suo mezzo, e dal giro del giorno il programma sa chi guidava. I passaggi arrivano da Telepass (collegamento da chiedere al referente Telepass Business, almeno ogni mezz’ora) e finiscono nei costi. Da scrivere nell’informativa e da far vedere al consulente del lavoro prima di usarli per valutare gli autisti.</p>
  </>);
}
