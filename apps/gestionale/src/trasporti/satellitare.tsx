// Satellitare: il percorso del giorno confrontato con il giro (solo direzione). Lo stesso della prova del 20 ottobre.
import React, { useState } from 'react';
import { Btn, Msg, Pill } from '@messina/ui';
import { useApp, useAzione, useDati, oggiISO, hm, Errore } from '../core';
import { Permesso } from '../permesso';

type P = [number, number];
/** la mappa del giro: previsto tratteggiato, fatto pieno (verde se in regola, rosso se ci sono anomalie) */
function Mappa({ fatto, previsto, male, soste }: { fatto: P[]; previsto: P[]; male: boolean; soste: P[] }) {
  const tutti = [...fatto, ...previsto, ...soste];
  if (!tutti.length) return <div className="lbl" style={{ padding: 10 }}>Nessuna posizione ancora oggi.</div>;
  const lat = tutti.map((p) => p[0]), lng = tutti.map((p) => p[1]);
  const [a, b, c, d] = [Math.min(...lat), Math.max(...lat), Math.min(...lng), Math.max(...lng)];
  const W = 340, H = 220, m = 18, sx = (W - 2 * m) / Math.max(1e-6, d - c), sy = (H - 2 * m) / Math.max(1e-6, b - a), k = Math.min(sx, sy);
  const xy = (p: P) => `${(m + (p[1] - c) * k).toFixed(1)} ${(H - m - (p[0] - a) * k).toFixed(1)}`;
  const linea = (ps: P[]) => ps.length ? 'M' + ps.map(xy).join(' L') : '';
  return <>
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} role="img" aria-label="Percorso previsto e percorso fatto">
      <rect width={W} height={H} rx="16" fill="rgba(17,18,20,.03)" />
      <path d={linea(previsto)} stroke="#111214" strokeWidth="3" fill="none" strokeDasharray="7 6" />
      <path d={linea(fatto)} stroke={male ? '#b42318' : '#146c43'} strokeWidth="3" fill="none" strokeLinejoin="round" />
      {previsto.map((p, i) => { const [x, y] = xy(p).split(' '); return <circle key={i} cx={x} cy={y} r="6" fill="#fff" stroke="#111214" strokeWidth="2" />; })}
      {soste.map((p, i) => { const [x, y] = xy(p).split(' '); return <circle key={'s' + i} cx={x} cy={y} r="9" fill="#b42318" />; })}
    </svg>
    <div className="row lbl" style={{ gap: 14, marginTop: 6 }}><span>- - - giro previsto</span><span style={{ color: male ? 'var(--alert)' : 'var(--ok)' }}>——— percorso fatto</span></div>
  </>;
}

export function Satellitare() {
  const { db } = useApp();
  const az = useAzione();
  const [sel, setSel] = useState<string | null>(null);
  const oggi = oggiISO();
  const { dati } = useDati(async (d) => {
    const [giornate, anomalie] = await Promise.all([
      d.from<any>('sat_giornate').select('*,mezzi(targa,tipo),dipendenti(nome),giri(zona)').eq('data', oggi),
      d.from<any>('sat_anomalie').select('*').eq('data', oggi).order('dalle'),
    ]);
    return { giornate, anomalie };
  }, []);
  if (!dati) return null;
  const G = dati.giornate, A = dati.anomalie;
  const cur = G.find((g) => g.mezzo_id === sel) ?? G[0];
  const sue = (g: any) => A.filter((a) => a.mezzo_id === g.mezzo_id);
  const gravi = (g: any) => sue(g).filter((a) => a.grave && !a.vista_il).length;
  const kmF = G.reduce((s, g) => s + Number(g.km_fatti ?? 0), 0), kmP = G.reduce((s, g) => s + Number(g.km_previsti ?? 0), 0);
  const litri = G.filter((g) => g.litri != null);
  const vista = (id: string) => az.esegui(() => db.rpc('anomalia_vista', { p_id: id }));
  return (<>
    {/* Da decidere (STATO): il riquadro dell'accordo art. 4 e della conservazione (Permesso) non è nel mockup.
        Le regole restano: senza accordo il database non accetta posizioni. */}
    {void Permesso}
    <div className="grid g4">
      <div className="glass card"><div className="lbl">Mezzi in giro</div><div className="big">{G.length}</div><div className="lbl">posizione dal satellitare</div></div>
      <div className="glass card"><div className="lbl">Km oggi</div><div className="big">{Math.round(kmF)}</div><div className="lbl">{kmP ? `previsti ${Math.round(kmP)}` : 'previsti: servono le fermate del giro'}</div></div>
      <div className="glass card"><div className="lbl">Da guardare</div><div className="big">{A.filter((a) => a.grave && !a.vista_il).length}</div><div className="lbl">deviazioni, soste, rifornimenti</div></div>
      <div className="glass card"><div className="lbl">Gasolio a {new Date().toLocaleDateString('it-IT', { month: 'long' })}</div><div className="big">{litri.length ? (litri.reduce((s, g) => s + Number(g.litri), 0)).toLocaleString('it-IT') + ' l' : '—'}</div><div className="lbl">carte carburante e km a confronto</div></div>
    </div>
    <Errore testo={az.errore} />
    {!G.length ? <Msg>Nessun dato dal satellitare oggi. Si attiva quando colleghiamo il fornitore del satellitare dei mezzi (docs/SETUP.md) e ogni mezzo ha il suo codice in Mezzi.</Msg>
      : <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
        <div className="glass tbox" style={{ flex: '1 1 520px', minWidth: 0 }}><table className="t nw"><thead><tr><th>Autista</th><th>Mezzo</th><th>Giro</th><th>Km previsti</th><th>Km fatti</th><th>Litri</th><th>Controllo</th></tr></thead><tbody>
          {G.map((g) => <tr key={g.mezzo_id} className="click" onClick={() => setSel(g.mezzo_id)} style={cur?.mezzo_id === g.mezzo_id ? { background: 'var(--soft)' } : undefined}>
            <td><b>{g.dipendenti?.nome ?? '—'}</b></td><td>{g.mezzi?.tipo} {g.mezzi?.targa}</td><td>{g.giri?.zona ?? '—'}</td><td>{g.km_previsti ?? '—'}</td>
            <td>{g.km_previsti && g.km_fatti > g.km_previsti * 1.1 ? <span className="miss">{g.km_fatti}</span> : g.km_fatti ?? '—'}</td><td>{g.litri != null ? Number(g.litri).toLocaleString('it-IT') : '—'}</td>
            <td>{gravi(g) ? <Pill tone="red">{gravi(g) === 1 ? '1 da guardare' : gravi(g) + ' da guardare'}</Pill> : <Pill tone="ok">In regola</Pill>}</td></tr>)}
        </tbody></table></div>
        {cur && <div className="glass card stack" style={{ flex: '1 1 380px', minWidth: 0 }}>
          <div className="row between"><b>{cur.dipendenti?.nome ?? '—'} · oggi</b><span className="lbl">{cur.mezzi?.tipo} {cur.mezzi?.targa}</span></div>
          <Mappa fatto={cur.percorso ?? []} previsto={cur.previsto ?? []} male={gravi(cur) > 0} soste={sue(cur).filter((a) => a.tipo === 'Sosta' && a.lat != null).map((a) => [a.lat, a.lng] as P)} />
          <div className="list">{sue(cur).length ? sue(cur).map((a) => <div key={a.id} className="li">
            <span className="row between" style={{ width: '100%' }}><b>{a.tipo}</b><span className="row" style={{ gap: 6 }}>
              <Pill tone={a.grave && !a.vista_il ? 'red' : undefined}>{hm(a.dalle)}{a.alle && a.alle !== a.dalle ? '–' + hm(a.alle) : ''}</Pill>
              {/* Da decidere (STATO): «Vista» non è nel mockup */}{void vista}</span></span>
            <span className="lbl">{a.dettaglio}{a.luogo ? ' · ' + a.luogo : ''}</span></div>)
            : <div className="lbl" style={{ padding: 10 }}>Nessuna anomalia: ha seguito il giro.</div>}</div>
        </div>}
      </div>}
    <p className="lbl" style={{ margin: 0 }}>Il programma confronta ogni giorno il percorso del satellitare con il giro: le strade parallele vicine non contano, le deviazioni lontane e le soste fuori dalle fermate sì. In più: carte carburante contro km, rifornimenti lontani dal giro, motore acceso da fermo, Telepass contro posizione. Il satellitare già montato sui mezzi si collega tramite il suo fornitore [nome da comunicare].</p>
  </>);
}
