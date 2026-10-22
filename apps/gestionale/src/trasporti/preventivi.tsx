// Preventivi di Gianluca: bozza → (Direzione, se cliente nuovo o sotto listino) → mail al cliente → accettato o rifiutato.
// Accettato con la risposta del cliente allegata: il potenziale diventa cliente e i prezzi diventano le sue tariffe.
import React, { useState } from 'react';
import { Btn, Chip, Msg, Pill, Warn } from '@messina/ui';
import { useApp, useAzione, useDati, eur, oggiISO, Errore } from '../core';
import { ScriviCliente } from './bolle';

const MODELLI = ['Distribuzione', 'Spedizioni a peso', 'Mezzo dedicato a km', 'Logistica'];
const UNITA = ['spedizione', 'collo', 'bancale', 'kg', 'km', 'giorno', 'mese', 'ora', 'percentuale', 'pezzo'];
const comeSiConta = (u: string) => u === 'percentuale' ? 'in percentuale' : u === 'ora' ? 'ogni ora' : u === 'giorno' ? 'al giorno' : u === 'mese' ? 'al mese' : 'a ' + u;
// righe proposte per ogni modello: si cambiano i prezzi, non si parte da zero
const PROPOSTE: Record<string, any[]> = {
  'Distribuzione': [{ voce: 'Base', unita: 'spedizione' }, { voce: 'Sponda', unita: 'spedizione' }, { voce: 'Giacenza', unita: 'giorno' }, { voce: 'Riconsegna', unita: 'spedizione' }],
  'Spedizioni a peso': [{ voce: 'Base', unita: 'spedizione', scaglione_su: 'peso', scaglione_da: 0, scaglione_a: 100 }, { voce: 'Base', unita: 'spedizione', scaglione_su: 'peso', scaglione_da: 100, scaglione_a: 500 },
    { voce: 'Base', unita: 'kg', scaglione_su: 'peso', scaglione_da: 500 }, { voce: 'Contrassegno', unita: 'percentuale' }, { voce: 'Giacenza', unita: 'giorno' }],
  'Mezzo dedicato a km': [{ voce: 'Base', unita: 'km' }, { voce: 'Attesa', unita: 'ora' }, { voce: 'Sponda', unita: 'spedizione' }],
  'Logistica': [{ voce: 'Deposito', unita: 'bancale', quando: 'Al giorno, per bancale in magazzino' }, { voce: 'Entrata merce', unita: 'pezzo' }, { voce: 'Uscita merce', unita: 'pezzo' }, { voce: 'Base', unita: 'spedizione' }],
};
const scaglione = (r: any) => !r.scaglione_su ? '' : ` · da ${r.scaglione_da ?? 0}${r.scaglione_a != null && r.scaglione_a !== '' ? ' a ' + r.scaglione_a : ' in su'} ${r.scaglione_su === 'peso' ? 'kg' : r.scaglione_su}`;
const fmt = (d: string | null) => d ? new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) : '—';
const scaduto = (p: any) => p.stato === 'Inviato' && p.valido_fino && p.valido_fino < oggiISO();
const pill = (p: any) => scaduto(p) ? <Pill tone="red">Scaduto</Pill> : p.stato === 'Accettato' ? <Pill tone="ok">Accettato</Pill> : p.stato === 'Da approvare' ? <Pill tone="red">Da approvare</Pill>
  : p.stato === 'Inviato' || p.stato === 'Approvato' ? <Pill tone="dark">{p.stato}</Pill> : <Pill>{p.stato}</Pill>;

export function Preventivi({ scelto }: { scelto?: string }) {
  const { vai } = useApp();
  const [f, setF] = useState<'Aperti' | 'Chiusi'>('Aperti');
  const [nuovo, setNuovo] = useState(false);
  const { dati } = useDati((d) => d.from<any>('preventivi').select('*,clienti(nome,email,stato),preventivi_righe(*)').order('creato_il', { ascending: false }).limit(300), []);
  if (!dati) return null;
  const cur = dati.find((p) => p.id === scelto);
  if (cur) return <Preventivo p={cur} />;
  const aperti = (p: any) => ['Bozza', 'Da approvare', 'Approvato', 'Inviato'].includes(p.stato);
  const L = dati.filter((p) => f === 'Aperti' ? aperti(p) : !aperti(p));
  return (<>
    <div className="row between"><div className="row">{(['Aperti', 'Chiusi'] as const).map((x) => <Chip key={x} on={f === x} onClick={() => setF(x)}>{x}</Chip>)}</div>
      <Btn onClick={() => setNuovo(!nuovo)}>{nuovo ? 'Chiudi' : 'Nuovo'}</Btn></div>
    {nuovo && <Nuovo onFatto={(id) => { setNuovo(false); vai('preventivi/' + id); }} />}
    <div className="glass tbox"><table className="t"><thead><tr><th>Numero</th><th>Cliente</th><th>Modello</th><th>Da</th><th>Valido fino al</th><th>Stato</th></tr></thead><tbody>
      {L.map((p) => <tr key={p.id} className="click" onClick={() => vai('preventivi/' + p.id)}><td><b>{p.numero}</b></td>
        <td>{p.clienti?.nome}{p.clienti?.stato === 'Potenziale' && <span className="lbl"> · potenziale</span>}</td><td>{p.modello}</td><td>{p.origine}</td><td>{fmt(p.valido_fino)}</td><td>{pill(p)}</td></tr>)}
      {!L.length && <tr><td colSpan={6} className="lbl">{f === 'Aperti' ? 'Nessun preventivo aperto. Le richieste dal sito arrivano qui da sole.' : 'Nessun preventivo chiuso.'}</td></tr>}
    </tbody></table></div>
  </>);
}

function Nuovo({ onFatto }: { onFatto: (id: string) => void }) {
  const { db } = useApp();
  const az = useAzione();
  const [v, setV] = useState({ cliente: '', nome: '', email: '', telefono: '', modello: MODELLI[0], richiesta: '' });
  const { dati: clienti } = useDati((d) => d.from<any>('clienti').select('id,nome,stato').eq('azienda', 'trasporti').eq('attivo', true).order('nome'), []);
  const crea = () => az.prendi(async () => {
    const cliente = v.cliente || await db.rpc<string>('nuovo_potenziale', { p_nome: v.nome, p_email: v.email, p_telefono: v.telefono || null });
    const [p] = await db.from<any>('preventivi').insert({ cliente_id: cliente, modello: v.modello, richiesta: v.richiesta || null, origine: 'Manuale' }).select('id');
    await db.from('preventivi_righe').insert(PROPOSTE[v.modello].map((r) => ({ preventivo_id: p.id, prezzo: 0, ...r })));
    return p.id as string;
  }).then((id) => id && onFatto(id));
  const campo = (k: keyof typeof v, l: string, type = 'text') => <label className="field"><span className="lbl">{l}</span><input className="input" type={type} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>;
  return <div className="glass card stack">
    <div className="grid g2">
      <label className="field"><span className="lbl">Cliente</span><select className="input" value={v.cliente} onChange={(e) => setV({ ...v, cliente: e.target.value })}>
        <option value="">Nuovo (potenziale)</option>{clienti?.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.stato === 'Potenziale' ? ' · potenziale' : ''}</option>)}</select></label>
      <label className="field"><span className="lbl">Modello</span><select className="input" value={v.modello} onChange={(e) => setV({ ...v, modello: e.target.value })}>{MODELLI.map((m) => <option key={m}>{m}</option>)}</select></label>
      {!v.cliente && <>{campo('nome', 'Azienda')}{campo('email', 'Email', 'email')}{campo('telefono', 'Telefono', 'tel')}</>}
    </div>
    <label className="field"><span className="lbl">Cosa chiede</span><textarea value={v.richiesta} onChange={(e) => setV({ ...v, richiesta: e.target.value })} /></label>
    <Errore testo={az.errore} />
    <div className="row"><Btn onClick={crea} disabled={az.inCorso || (!v.cliente && (!v.nome.trim() || !v.email.trim()))}>Crea</Btn>
      <span className="lbl">Le righe del modello sono già pronte: si scrivono solo i prezzi.</span></div>
  </div>;
}

function Preventivo({ p }: { p: any }) {
  const { db, vai, io } = useApp();
  const az = useAzione();
  const dir = io.ruolo === 'direzione';
  const bozza = p.stato === 'Bozza';
  const [righe, setRighe] = useState<any[] | null>(null);
  const [mail, setMail] = useState(false);
  const [chiudi, setChiudi] = useState<null | { cosa: 'accetta' | 'rifiuta' | 'rimanda'; testo: string; dal: string; file: File | null }>(null);
  const [msg, setMsg] = useState('');
  const R = righe ?? [...(p.preventivi_righe ?? [])].sort((a, b) => String(a.voce).localeCompare(b.voce) || (a.scaglione_da ?? 0) - (b.scaglione_da ?? 0));
  const cambia = (r: any, k: string, val: string) => setRighe(R.map((x) => x === r ? { ...x, [k]: val } : x));
  const salva = () => az.esegui(async () => {
    await db.from('preventivi_righe').delete().eq('preventivo_id', p.id);
    const ok = R.filter((r) => String(r.voce).trim());
    if (ok.length) await db.from('preventivi_righe').insert(ok.map((r) => ({ preventivo_id: p.id, voce: String(r.voce).trim(), unita: r.unita, prezzo: Number(r.prezzo || 0),
      minimo: r.minimo === '' || r.minimo == null ? null : Number(r.minimo), zona: r.zona || null, quando: r.quando || null,
      scaglione_su: r.scaglione_su || null, scaglione_da: r.scaglione_su ? Number(r.scaglione_da || 0) : null, scaglione_a: r.scaglione_su && r.scaglione_a !== '' && r.scaglione_a != null ? Number(r.scaglione_a) : null })));
  }).then((x) => { if (x) { setRighe(null); setMsg('Prezzi salvati.'); } });
  const invia = () => az.prendi(() => db.rpc<string>('invia_preventivo', { p_id: p.id })).then((s) => {
    if (s === 'Approvato') setMail(true);
    else if (s) setMsg('Il preventivo è passato alla Direzione: quando lo approva lo mandi al cliente.');
  });
  const approva = (ok: boolean, motivo?: string) => az.esegui(() => db.rpc('approva_preventivo', { p_id: p.id, p_ok: ok, p_motivo: motivo ?? null }))
    .then((x) => { if (x) { setChiudi(null); setMsg(ok ? 'Approvato: Gianluca lo può mandare al cliente.' : 'Rimandato a Gianluca con la nota.'); } });
  const conferma = () => az.esegui(async () => {
    if (chiudi!.cosa === 'rifiuta') return db.rpc('rifiuta_preventivo', { p_id: p.id, p_motivo: chiudi!.testo });
    if (chiudi!.cosa === 'rimanda') return db.rpc('approva_preventivo', { p_id: p.id, p_ok: false, p_motivo: chiudi!.testo });
    let risposta = chiudi!.testo.trim();
    if (chiudi!.file) { risposta = `preventivi/${p.id}/${Date.now()}-${chiudi!.file.name.replace(/[^\w.-]+/g, '_')}`; await db.storage.carica('documenti', risposta, chiudi!.file); }
    return db.rpc('accetta_preventivo', { p_id: p.id, p_risposta: risposta, p_dal: chiudi!.dal });
  }).then((x) => { if (x) { setMsg(chiudi!.cosa === 'accetta' ? `Accettato: ${p.clienti?.nome} è cliente e i prezzi sono le sue tariffe dal ${fmt(chiudi!.dal)}. Le tariffe di prima valgono fino al giorno prima.` : chiudi!.cosa === 'rimanda' ? 'Rimandato a Gianluca con la nota.' : 'Preventivo chiuso come rifiutato.'); setChiudi(null); } });
  const testoMail = `Buongiorno,\ncome richiesto le mandiamo la nostra offerta (preventivo ${p.numero}, ${p.modello.toLowerCase()}), valida 30 giorni:\n`
    + R.map((r) => `- ${r.voce}${scaglione(r)}: ${r.unita === 'percentuale' ? `${Number(r.prezzo).toLocaleString('it-IT')}%` : eur(Number(r.prezzo)) + ' ' + comeSiConta(r.unita)}${r.minimo ? ` (minimo ${eur(Number(r.minimo))})` : ''}${r.zona ? ` · ${r.zona}` : ''}`).join('\n')
    + `\nPrezzi IVA esclusa. Per accettare basta rispondere a questa mail.\nCordiali saluti\n${io.nome}\nMessina Autotrasporti`;
  const inp = (r: any, k: string, l: string, w: number, type = 'text') => bozza
    ? <input className="input" type={type} aria-label={l} placeholder={l} value={r[k] ?? ''} style={{ width: w, minHeight: 34, padding: '4px 8px' }} onChange={(e) => cambia(r, k, e.target.value)} />
    : <span>{r[k] ?? '—'}</span>;
  return (<>
    <div className="row between"><Btn ghost onClick={() => vai('preventivi')}>Tutti i preventivi</Btn>{pill(p)}</div>
    <div className="glass card stack">
      <div className="row between"><h3 style={{ fontSize: 22, letterSpacing: '-.02em' }}>{p.numero} · {p.clienti?.nome}</h3>
        <span className="lbl">{p.modello} · da {p.origine.toLowerCase()}{p.valido_fino ? ' · valido fino al ' + fmt(p.valido_fino) : ''}</span></div>
      {p.clienti?.stato === 'Potenziale' && <span className="lbl">Cliente potenziale: diventa cliente quando accetta. Il preventivo passa dalla Direzione.</span>}
      {p.richiesta && <div style={{ whiteSpace: 'pre-wrap', background: 'var(--soft)', borderRadius: 14, padding: 12 }}>{p.richiesta}</div>}
      {p.motivo && <Warn>{p.stato === 'Bozza' ? 'Dalla Direzione: ' : p.stato === 'Rifiutato' ? 'Rifiutato: ' : ''}{p.motivo}</Warn>}
      <div className="tbox"><table className="t"><thead><tr><th>Voce</th><th>Come si conta</th><th>Scaglione</th><th>Zona</th><th>Minimo</th><th>Prezzo</th>{bozza && <th />}</tr></thead><tbody>
        {R.map((r, i) => <tr key={r.id ?? 'n' + i}>
          <td>{inp(r, 'voce', 'Voce', 130)}</td>
          <td>{bozza ? <select className="input" aria-label="Come si conta" style={{ width: 140, minHeight: 34, padding: '4px 8px' }} value={r.unita} onChange={(e) => cambia(r, 'unita', e.target.value)}>{UNITA.map((u) => <option key={u} value={u}>{comeSiConta(u)}</option>)}</select> : comeSiConta(r.unita)}</td>
          <td>{bozza ? <span className="row" style={{ gap: 4 }}><select className="input" aria-label="Scaglione" style={{ width: 110, minHeight: 34, padding: '4px 8px' }} value={r.scaglione_su ?? ''} onChange={(e) => cambia(r, 'scaglione_su', e.target.value)}>
              <option value="">—</option><option value="peso">kg</option><option value="colli">colli</option><option value="km">km</option></select>
              {r.scaglione_su && <>{inp(r, 'scaglione_da', 'Da', 64, 'number')}{inp(r, 'scaglione_a', 'A', 64, 'number')}</>}</span> : scaglione(r).replace(' · ', '') || '—'}</td>
          <td>{inp(r, 'zona', 'Zona', 100)}</td><td>{bozza ? inp(r, 'minimo', 'Minimo', 80, 'number') : r.minimo != null ? eur(Number(r.minimo)) : '—'}</td>
          <td>{bozza ? inp(r, 'prezzo', r.unita === 'percentuale' ? '%' : 'Prezzo', 90, 'number') : r.unita === 'percentuale' ? `${Number(r.prezzo).toLocaleString('it-IT')}%` : eur(Number(r.prezzo))}</td>
          {bozza && <td><Btn ghost sm onClick={() => setRighe(R.filter((x) => x !== r))}>Togli</Btn></td>}</tr>)}
      </tbody></table></div>
      {bozza && <div className="row"><Btn ghost sm onClick={() => setRighe([...R, { voce: '', unita: 'spedizione', prezzo: '' }])}>Aggiungi</Btn>{righe && <><Btn sm onClick={salva} disabled={az.inCorso}>Salva</Btn><Btn ghost sm onClick={() => setRighe(null)}>Annulla</Btn></>}</div>}
      {msg && <Msg>{msg}</Msg>}
      <Errore testo={az.errore} />
      {mail && <ScriviCliente a={p.clienti?.email} oggetto={`Preventivo ${p.numero} · Messina Autotrasporti`} testo={testoMail} avviso="Mail con l'offerta pronta: controllala e premi «Invia». Da quel momento il preventivo vale 30 giorni."
        onInviato={async () => { await db.rpc('preventivo_inviato', { p_id: p.id }); setMail(false); setMsg(`Mail inviata a ${p.clienti?.email}: il preventivo vale 30 giorni. Quando il cliente risponde, premi «Accettato» o «Rifiutato».`); }} onChiudi={() => setMail(false)} />}
      {chiudi ? <div className="stack" style={{ gap: 8 }}>
        {chiudi.cosa === 'accetta' && <>
          <label className="field"><span className="lbl">Risposta del cliente (mail salvata in PDF o documento firmato)</span><input className="input" type="file" accept="application/pdf,image/*,.eml,.msg" onChange={(e) => setChiudi({ ...chiudi, file: e.target.files?.[0] ?? null })} /></label>
          <label className="field"><span className="lbl">Oppure dove si trova (es. mail del 22/10 da …)</span><input className="input" value={chiudi.testo} onChange={(e) => setChiudi({ ...chiudi, testo: e.target.value })} /></label>
          <label className="field"><span className="lbl">Le tariffe valgono dal</span><input className="input" type="date" min={oggiISO()} value={chiudi.dal} onChange={(e) => setChiudi({ ...chiudi, dal: e.target.value })} /></label></>}
        {chiudi.cosa !== 'accetta' && <label className="field"><span className="lbl">{chiudi.cosa === 'rimanda' ? 'Cosa cambiare' : 'Perché il cliente ha detto no'}</span><input className="input" value={chiudi.testo} onChange={(e) => setChiudi({ ...chiudi, testo: e.target.value })} /></label>}
        <div className="row"><Btn onClick={conferma} disabled={az.inCorso || (chiudi.cosa === 'accetta' ? !(chiudi.file || chiudi.testo.trim()) || !chiudi.dal : !chiudi.testo.trim())}>Conferma</Btn><Btn ghost onClick={() => setChiudi(null)}>Annulla</Btn></div>
      </div> : !mail && <div className="row">
        {bozza && !righe && <Btn onClick={invia} disabled={az.inCorso || R.some((r) => !(Number(r.prezzo) > 0))}>Invia</Btn>}
        {bozza && R.some((r) => !(Number(r.prezzo) > 0)) && <span className="lbl">Ogni riga ha un prezzo, oppure si toglie.</span>}
        {p.stato === 'Da approvare' && dir && <><Btn onClick={() => approva(true)} disabled={az.inCorso}>Approva</Btn><Btn ghost onClick={() => setChiudi({ cosa: 'rimanda', testo: '', dal: '', file: null })}>Rimanda</Btn></>}
        {p.stato === 'Da approvare' && !dir && <span className="lbl">Aspetta la Direzione.</span>}
        {p.stato === 'Approvato' && <Btn onClick={() => setMail(true)}>Invia</Btn>}
        {p.stato === 'Inviato' && !scaduto(p) && <Btn onClick={() => setChiudi({ cosa: 'accetta', testo: '', dal: oggiISO(), file: null })}>Accettato</Btn>}
        {['Inviato', 'Approvato', 'Bozza', 'Da approvare'].includes(p.stato) && <Btn ghost onClick={() => setChiudi({ cosa: 'rifiuta', testo: '', dal: '', file: null })}>Rifiutato</Btn>}
        {scaduto(p) && <span className="lbl">Scaduto: per i prezzi di oggi serve un preventivo nuovo.</span>}
      </div>}
    </div>
  </>);
}
