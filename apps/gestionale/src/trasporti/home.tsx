import React, { useEffect } from 'react';
import { Badge, Btn, Msg, Pill } from '@messina/ui';
import { useApp, useDati, oggiISO, meseISO, eur0, num, Mese, quando } from '../core';

const SEZ = ['Magazzino', 'Missioni', 'Bolle', 'Presenze', 'Fatturazione', 'Telepass', 'Satellitare'] as const;
/** il satellitare lo vede solo la direzione: agli altri la scheda non compare (non sarebbe mai piena) */
const sezioniPer = (ruolo: string) => SEZ.filter((x) => x !== 'Satellitare' || ruolo === 'direzione');
/** dove si risolve ogni sezione e il colore della pill nella Home */
const PILL: Record<string, 'red' | undefined> = { Magazzino: 'red', Missioni: 'red', Bolle: 'red', Presenze: 'red', Fatturazione: 'red', Telepass: 'red', Satellitare: 'red' };

export function Home() {
  const { vai } = useApp();
  const oggi = oggiISO();
  const { dati } = useDati(async (db) => {
    const [bolleOggi, nuove, inc, pagate, fermate, an, giac, mezzi, res] = await Promise.all([
      db.from<any>('bolle').select('id,stato,tipo').eq('data_consegna', oggi).neq('tipo', 'Magazzino'),
      db.from<any>('bolle').select('id,dati_mancanti').eq('stato', 'Nuova'),
      db.from<any>('incassi_trasporti').select('*'),
      db.from<any>('fatture').select('id,pagata_il').eq('azienda', 'trasporti').eq('stato', 'Pagata').gte('pagata_il', meseISO() + '-01'),
      db.from<any>('fermate').select('id,esito,dopo,chiusa_il').gte('chiusa_il', oggi + 'T00:00:00'),
      db.from<any>('anomalie').select('*'),
      db.from<any>('giacenze_aperte').select('id,riconsegna_il'),
      db.from<any>('mezzi').select('targa,tipo,revisione,assicurazione,tagliando_km,stato'),
      db.from<any>('resoconti').select('testo,giorno').eq('azienda', 'trasporti').order('giorno', { ascending: false }).limit(1),
    ]);
    return { bolleOggi, nuove, inc: inc[0] ?? {}, pagate, fermate, an, giac, mezzi, res: res[0] ?? null };
  }, []);
  if (!dati) return null;
  const consegnate = dati.bolleOggi.filter((b) => ['Consegnata', 'Fatturata'].includes(b.stato)).length;
  const chiuse = dati.fermate.filter((f) => f.esito !== 'Da fare');
  const primo = chiuse.length ? Math.round(chiuse.filter((f) => f.esito === 'Consegnata').length / chiuse.length * 100) : null;
  const mancanti = dati.nuove.filter((b) => b.dati_mancanti?.length).length;
  const nPag = dati.pagate.length;
  const daRimettere = dati.fermate.filter((f) => f.esito === 'Non consegnata' && f.dopo !== 'Giacenza').length;
  const daPren = dati.giac.filter((g) => !g.riconsegna_il).length;
  const tra30 = new Date(); tra30.setDate(tra30.getDate() + 30);
  const scad = dati.mezzi.flatMap((m) => [['revisione', m.revisione], ['assicurazione', m.assicurazione]].filter(([, d]) => d && new Date(d) <= tra30)
    .map(([k, d]) => `${m.tipo} ${m.targa}: ${k} il ${new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`));
  // «Da guardare oggi»: le anomalie raggruppate più quello che va fatto oggi
  const voci: [string, string, string, 'red' | 'dark' | undefined][] = [];
  for (const s of SEZ) {
    const l = dati.an.filter((a) => a.sezione === s);
    if (l.length === 1) voci.push([l[0].cosa, l[0].dove, s, PILL[s]]);
    else if (l.length > 1) voci.push([`${l.length} anomalie in ${s}`, 'anomalie/' + s, s, PILL[s]]);
  }
  if (daRimettere) voci.push([`${daRimettere} mancate consegne da rimettere in giro`, 'traffico', 'Traffico', undefined]);
  if (daPren) voci.push([`${daPren === 1 ? '1 giacenza' : daPren + ' giacenze'} con riconsegna da prenotare`, 'giacenze', 'Giacenze', 'red']);
  scad.forEach((x) => voci.push([x, 'mezzi', 'Mezzi', undefined]));
  return (<>
    <div className="grid g4">
      <div className="glass card"><div className="lbl">Spedizioni di oggi</div><div className="big">{num(dati.bolleOggi.length)}</div><div className="lbl">{num(consegnate)} consegnate</div></div>
      <div className="glass card"><div className="lbl">Consegnate al primo tentativo</div><div className="big">{primo === null ? '—' : primo + '%'}</div><div className="lbl">obiettivo 97%</div></div>
      <div className="glass card"><div className="lbl">Bolle da confermare</div><div className="big">{num(dati.nuove.length)}</div><div className="lbl">{mancanti === 1 ? '1 con dati mancanti' : mancanti + ' con dati mancanti'}</div></div>
    </div>
    <div className="grid g4">
      <div className="glass card"><div className="lbl">Fatturato oggi</div><div className="big">{eur0(dati.inc.fatturato_oggi)}</div><div className="lbl">bolle di oggi × tariffe</div></div>
      <div className="glass card"><div className="lbl">Fatturato {Mese().toLowerCase()}</div><div className="big">{eur0(dati.inc.fatturato_mese)}</div><div className="lbl">dal 1° {Mese().toLowerCase()}</div></div>
      <div className="glass card"><div className="lbl">Incassato</div><div className="big">{eur0(dati.inc.incassato_mese)}</div><div className="lbl">{nPag === 1 ? '1 fattura pagata' : nPag + ' fatture pagate'}</div></div>
    </div>
    <div className="grid g2">
      <div className="glass card"><h3 style={{ fontSize: 18, marginBottom: 8 }}>Resoconto del mattino</h3>
        <p style={{ margin: '0 0 8px' }}>{dati.res?.giorno === oggiISO() ? dati.res.testo : 'Il resoconto di oggi non è ancora arrivato.'}</p>
        <p className="lbl" style={{ margin: 0 }}>Arriva ogni mattina alle 7:00 a Direzione e Amministrazione.</p></div>
      <div className="glass card"><h3 style={{ fontSize: 18, marginBottom: 6 }}>Da guardare oggi</h3><div className="list">
        {voci.length ? voci.map(([t, dove, p, c], i) => (
          <button key={i} type="button" className="li" onClick={() => vai(dove)}><span className="row between" style={{ width: '100%' }}><span>{t}</span><Pill tone={c}>{p}</Pill></span></button>
        )) : <div className="lbl" style={{ padding: 14 }}>Niente da guardare: tutto torna.</div>}
      </div></div>
    </div>
  </>);
}

export function Anomalie({ sezione, titolo }: { sezione?: string; titolo: (t: string | null) => void }) {
  const { vai, io } = useApp();
  const sez = sezione ? decodeURIComponent(sezione) : null;
  useEffect(() => { titolo(sez); }, [sez, titolo]);
  const { dati: AN } = useDati((db) => db.from<any>('anomalie').select('*').order('da', { ascending: false }), []);
  if (!AN) return null;
  const cnt = (x: string) => AN.filter((r) => r.sezione === x).length;
  if (!sez) return (<>
    <div className="row" style={{ alignItems: 'stretch', gap: 14 }}>
      <div className="glass card" style={{ flex: '0 0 auto', minWidth: 180, ...(AN.length ? { border: '2px solid var(--alert)' } : {}) }}>
        <div className="lbl">Totale</div><div className="big" style={AN.length ? { color: 'var(--alert)' } : undefined}>{AN.length}</div><div className="lbl">{AN.length ? 'da risolvere' : 'tutto torna'}</div>
      </div>
    </div>
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(300px,100%),1fr))' }}>
      {sezioniPer(io.ruolo).map((x) => { const n = cnt(x); return (
        <button key={x} type="button" className="glass card" onClick={() => vai('anomalie/' + x)} style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', ...(n ? {} : { opacity: .6 }) }}>
          <div className="row between"><b style={{ fontSize: 18 }}>{x}</b>{n ? <Badge n={n} /> : <Pill tone="ok">Ok</Pill>}</div>
          <div className="lbl" style={{ marginTop: 6 }}>{n ? (n === 1 ? '1 anomalia' : n + ' anomalie') : 'Nessuna'}</div>
        </button>); })}
    </div>
    <p className="lbl" style={{ margin: 0 }}>Nessuna chiusura passa se le cose non tornano. Quando un’anomalia si risolve sparisce da sola. Da decidere: un riassunto al giorno per la Direzione, a orario fisso.</p>
  </>);
  const L = AN.filter((r) => r.sezione === sez);
  return (<>
    <div className="row"><Btn ghost sm onClick={() => vai('anomalie')}>← Anomalie</Btn></div>
    {L.length ? <div className="list">{L.map((r, i) => (
      <div key={i} className="glass card row between" style={{ gap: 12 }}>
        <div><b style={{ fontSize: 17 }}>{r.cosa}</b><div className="lbl" style={{ marginTop: 4 }}>Chi risolve: {r.chi} · {quando(r.da)}</div></div>
        <Btn sm onClick={() => vai(r.dove + (r.dove === 'bolle' ? '/' + r.rif : ''))}>Apri</Btn>
      </div>))}</div> : <Msg>Nessuna anomalia in questa sezione.</Msg>}
  </>);
}
