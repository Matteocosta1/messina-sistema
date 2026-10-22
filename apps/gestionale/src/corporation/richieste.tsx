// Richieste delle aziende (negozio, sezione Aziende, oppure mail, WhatsApp, telefono scritte a mano).
// Ognuna ha un responsabile delle Vendite; dopo 4 ore senza preventivo è da sollecitare; si chiude solo dopo il preventivo.
import React, { useState } from 'react';
import { Btn, Chip, Msg, Pill, Warn } from '@messina/ui';
import { useApp, useAzione, useDati, eur, hm, Errore } from '../core';
import { ScriviCliente } from '../trasporti/bolle';

const ORE4 = 4 * 3600_000;
const daSollecitare = (r: any) => r.stato === 'Aperta' && Date.now() - new Date(r.creata_il).getTime() > ORE4;
const quando = (t: string) => { const d = new Date(t); return d.toDateString() === new Date().toDateString() ? 'oggi ' + hm(t) : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) + ' ' + hm(t); };
const pill = (r: any) => daSollecitare(r) ? <Pill tone="red">Da sollecitare</Pill> : r.stato === 'Vinta' ? <Pill tone="ok">Vinta</Pill> : r.stato === 'Preventivo inviato' ? <Pill tone="dark">Preventivo inviato</Pill> : <Pill>{r.stato}</Pill>;

export function Richieste() {
  const { io } = useApp();
  const [f, setF] = useState<'Mie' | 'Aperte' | 'Chiuse'>('Mie');
  const [sel, setSel] = useState<string | null>(null);
  const [nuova, setNuova] = useState(false);
  const { dati } = useDati((d) => d.from<any>('richieste_aziende').select('*,assegnata:profili!richieste_aziende_assegnata_a_fkey(nome)').order('creata_il', { ascending: false }).limit(300), []);
  if (!dati) return null;
  const aperta = (r: any) => r.stato === 'Aperta' || r.stato === 'Preventivo inviato';
  const L = dati.filter((r) => f === 'Chiuse' ? !aperta(r) : aperta(r) && (f === 'Aperte' || r.assegnata_a === io.id));
  const cur = dati.find((r) => r.id === sel);
  if (cur) return <Richiesta r={cur} onChiudi={() => setSel(null)} />;
  const n = (k: typeof f) => dati.filter((r) => k === 'Chiuse' ? !aperta(r) : aperta(r) && (k === 'Aperte' || r.assegnata_a === io.id)).length;
  return (<>
    <div className="row between"><div className="row">{(['Mie', 'Aperte', 'Chiuse'] as const).map((x) => <Chip key={x} on={f === x} onClick={() => setF(x)}>{x} {n(x)}</Chip>)}</div>
      <Btn onClick={() => setNuova(!nuova)}>{nuova ? 'Chiudi' : 'Nuova'}</Btn></div>
    {nuova && <Nuova onFatto={() => setNuova(false)} />}
    <div className="glass tbox"><table className="t"><thead><tr><th>Azienda</th><th>Cosa</th><th>Da</th><th>Arrivata</th><th>Chi</th><th>Stato</th></tr></thead><tbody>
      {L.map((r) => <tr key={r.id} className="click" onClick={() => setSel(r.id)}><td><b>{r.azienda_cliente}</b><div className="lbl">{r.numero}</div></td>
        <td>{r.quantita} × {r.modello}{r.grado && r.grado !== 'Indifferente' ? ` · grado ${r.grado}` : ''}</td><td>{r.origine}</td><td>{quando(r.creata_il)}</td><td>{r.assegnata?.nome ?? '—'}</td><td>{pill(r)}</td></tr>)}
      {!L.length && <tr><td colSpan={6} className="lbl">{f === 'Chiuse' ? 'Nessuna richiesta chiusa.' : 'Nessuna richiesta aperta. Quelle dal negozio arrivano qui da sole.'}</td></tr>}
    </tbody></table></div>
  </>);
}

function Nuova({ onFatto }: { onFatto: () => void }) {
  const { db } = useApp();
  const az = useAzione();
  const [v, setV] = useState({ azienda_cliente: '', referente: '', email: '', telefono: '', modello: '', grado: 'Indifferente', quantita: '1', note: '', origine: 'Mail' });
  const campo = (k: keyof typeof v, l: string, type = 'text') => <label className="field"><span className="lbl">{l}</span><input className="input" type={type} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>;
  const salva = () => az.esegui(() => db.from('richieste_aziende').insert({ ...v, quantita: Number(v.quantita), email: v.email || null, telefono: v.telefono || null, referente: v.referente || null, note: v.note || null }))
    .then((ok) => ok && onFatto());
  return <div className="glass card stack">
    <div className="grid g2">{campo('azienda_cliente', 'Azienda')}{campo('referente', 'Referente')}{campo('email', 'Email', 'email')}{campo('telefono', 'Telefono', 'tel')}{campo('modello', 'Modello')}{campo('quantita', 'Quantità', 'number')}
      <label className="field"><span className="lbl">Grado</span><select className="input" value={v.grado} onChange={(e) => setV({ ...v, grado: e.target.value })}>{['Indifferente', 'A', 'B', 'C', 'D'].map((g) => <option key={g}>{g}</option>)}</select></label>
      <label className="field"><span className="lbl">Arrivata da</span><select className="input" value={v.origine} onChange={(e) => setV({ ...v, origine: e.target.value })}>{['Mail', 'WhatsApp', 'Telefono'].map((g) => <option key={g}>{g}</option>)}</select></label></div>
    <label className="field"><span className="lbl">Note</span><textarea value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></label>
    <Errore testo={az.errore} />
    <div className="row"><Btn onClick={salva} disabled={!v.azienda_cliente.trim() || !v.modello.trim() || !(Number(v.quantita) > 0) || az.inCorso}>Salva</Btn>
      <span className="lbl">Va a chi delle Vendite ha meno richieste aperte.</span></div>
  </div>;
}

function Richiesta({ r, onChiudi }: { r: any; onChiudi: () => void }) {
  const { db, io } = useApp();
  const az = useAzione();
  const [importo, setImporto] = useState(r.preventivo_eur ? String(r.preventivo_eur) : '');
  const [mail, setMail] = useState(false);
  const [esito, setEsito] = useState<null | { vinta: boolean; testo: string }>(null);
  const [msg, setMsg] = useState('');
  const aperta = r.stato === 'Aperta' || r.stato === 'Preventivo inviato';
  const testo = `Buongiorno${r.referente ? ' ' + r.referente : ''},\ngrazie per la richiesta. Per ${r.quantita} × ${r.modello}${r.grado && r.grado !== 'Indifferente' ? ` grado ${r.grado}` : ''} il prezzo è di ${eur(Number(importo || 0))} in tutto, IVA compresa, con garanzia di 12 mesi.\n`
    + `L'offerta vale 15 giorni. Per confermare basta rispondere a questa mail.\nCordiali saluti\n${io.nome}\nMessina Corporation`;
  const chiudi = () => az.esegui(() => db.rpc('chiudi_richiesta', { p_id: r.id, p_vinta: esito!.vinta, p_esito: esito!.testo || null }))
    .then((ok) => { if (ok) { setMsg(esito!.vinta ? 'Richiesta vinta.' : 'Richiesta chiusa come persa.'); setEsito(null); } });
  const telefono = () => az.esegui(() => db.rpc('richiesta_preventivo_inviato', { p_id: r.id, p_importo: Number(importo) })).then((ok) => ok && setMsg('Segnato: preventivo dato a voce o su WhatsApp.'));
  return (<>
    <div className="row between"><Btn ghost onClick={onChiudi}>Tutte le richieste</Btn>{pill(r)}</div>
    <div className="glass card stack">
      <div className="row between"><h3 style={{ fontSize: 22, letterSpacing: '-.02em' }}>{r.azienda_cliente}</h3><span className="lbl">{r.numero} · da {r.origine.toLowerCase()} · {quando(r.creata_il)}</span></div>
      {daSollecitare(r) && <Warn>Da più di 4 ore senza preventivo: rispondere subito.</Warn>}
      <div className="kv">
        <div><div className="lbl">Cosa</div><b>{r.quantita} × {r.modello}</b></div>
        <div><div className="lbl">Grado</div><b>{r.grado ?? '—'}</b></div>
        <div><div className="lbl">Referente</div><b>{r.referente ?? '—'}</b></div>
        <div><div className="lbl">Contatti</div><b>{[r.email, r.telefono].filter(Boolean).join(' · ') || '—'}</b></div>
        <div><div className="lbl">Segue</div><b>{r.assegnata?.nome ?? '—'}</b></div>
        {r.preventivo_eur && <div><div className="lbl">Preventivo</div><b>{eur(Number(r.preventivo_eur))}{r.preventivo_il ? ' · ' + quando(r.preventivo_il) : ''}</b></div>}
      </div>
      {r.note && <div style={{ whiteSpace: 'pre-wrap' }}>{r.note}</div>}
      {r.esito && <div className="lbl">Esito: {r.esito}</div>}
      {msg && <Msg>{msg}</Msg>}
      <Errore testo={az.errore} />
      {aperta && !mail && !esito && <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ width: 180 }}><span className="lbl">Prezzo totale (IVA compresa)</span><input className="input" type="number" min={0} value={importo} onChange={(e) => setImporto(e.target.value)} /></label>
        <Btn onClick={() => setMail(true)} disabled={!(Number(importo) > 0) || !r.email}>Preventivo</Btn>
        {!r.email && <Btn ghost onClick={telefono} disabled={!(Number(importo) > 0) || az.inCorso}>Dato a voce</Btn>}
        {r.preventivo_il && <><Btn ghost onClick={() => setEsito({ vinta: true, testo: '' })}>Vinta</Btn><Btn ghost onClick={() => setEsito({ vinta: false, testo: '' })}>Persa</Btn></>}
      </div>}
      {mail && <ScriviCliente azienda="corporation" a={r.email} oggetto={`Offerta per ${r.quantita} × ${r.modello}`} testo={testo} avviso="Mail con l'offerta pronta: controllala e premi «Invia»."
        onInviato={async () => { await db.rpc('richiesta_preventivo_inviato', { p_id: r.id, p_importo: Number(importo) }); setMail(false); setMsg(`Offerta inviata a ${r.email}. Quando risponde, segna «Vinta» o «Persa».`); }} onChiudi={() => setMail(false)} />}
      {esito && <div className="stack" style={{ gap: 8 }}>
        {!esito.vinta && <label className="field"><span className="lbl">Perché è persa</span><input className="input" value={esito.testo} onChange={(e) => setEsito({ ...esito, testo: e.target.value })} /></label>}
        <div className="row"><Btn onClick={chiudi} disabled={az.inCorso || (!esito.vinta && !esito.testo.trim())}>Conferma</Btn><Btn ghost onClick={() => setEsito(null)}>Annulla</Btn></div></div>}
      {aperta && !r.preventivo_il && <span className="lbl">Si chiude solo dopo aver mandato il preventivo.</span>}
    </div>
  </>);
}
