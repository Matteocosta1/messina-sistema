// Portale clienti di Messina Autotrasporti: lo stesso aspetto del gestionale approvato
// (shell con menu laterale, schede in vetro, tabelle). Ogni cliente vede solo il suo:
// lo decidono i permessi del database (RLS); il portale in più filtra per cliente.
import '@messina/dati/prova-tutto';   // stessi dati di prova in tutti i programmi
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@messina/ui/mockup.css';
import '@messina/ui/produzione.css';
import { collega, onCambioProva, type Config, type Db } from '@messina/dati';
import { motoreDiProva, ELENCO_PROVA } from '@messina/dati/prova';
import { Badge, Btn, Chip, Msg, Pill, Search, Stat, Card } from '@messina/ui';

declare global { interface Window { MESSINA?: Config } }
const cfg = window.MESSINA;
const db = collega(cfg, motoreDiProva);

// ------------------------------------------------------------------ contesto e dati (stesso schema del gestionale)
interface Profilo { id: string; ruolo: string; nome: string; cliente_id: string | null }
interface Cliente { id: string; nome: string; portale_live: boolean }
interface Ctx { db: Db; io: Profilo; clienti: Cliente[]; vai: (p: string) => void; percorso: string; aggiorna: () => void; giro: number; cerca: string }
const AppCtx = createContext<Ctx | null>(null);
const useApp = () => useContext(AppCtx)!;

function useDati<T>(carica: (d: Db) => PromiseLike<T>, deps: unknown[] = []) {
  const { giro } = useApp();
  const [dati, setDati] = useState<T | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    Promise.resolve(carica(db)).then((d) => { if (vivo) { setDati(d); setErrore(null); } }, (e) => { if (vivo) setErrore(String(e?.message ?? e)); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [giro, ...deps]);
  return { dati, errore };
}

// ------------------------------------------------------------------ aiuti
const giornoCorto = (d: string | null | undefined) => { if (!d) return '—'; const x = new Date(d + (d.length === 10 ? 'T12:00:00' : '')), o = new Date();
  if (x.toDateString() === o.toDateString()) return 'Oggi'; const i = new Date(o); i.setDate(o.getDate() - 1); if (x.toDateString() === i.toDateString()) return 'Ieri';
  const n = new Date(o); n.setDate(o.getDate() + 1); if (x.toDateString() === n.toDateString()) return 'Domani';
  const s = x.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long' }); return s[0].toUpperCase() + s.slice(1); };
const hm = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '—';
const quando = (iso: string | null | undefined) => { if (!iso) return '—'; const g = giornoCorto(iso); return (g === 'Oggi' ? '' : g + ' ') + hm(iso); };
const eur = (n: number | null | undefined) => '€ ' + Number(n ?? 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n: number | null | undefined) => Number(n ?? 0).toLocaleString('it-IT');
const dataLunga = () => { const s = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return s[0].toUpperCase() + s.slice(1); };
const domani = () => { const d = new Date(); d.setDate(d.getDate() + 1); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const trova = (cerca: string, ...campi: unknown[]) => !cerca.trim() || campi.some((c) => String(c ?? '').toLowerCase().includes(cerca.trim().toLowerCase()));

/** stato della bolla come lo legge il cliente */
const STATO: Record<string, [string, 'dark' | 'red' | 'ok' | undefined]> = {
  Nuova: ['Ricevuta', undefined], Confermata: ['Programmata', 'dark'], 'In giro': ['In consegna', 'dark'],
  Consegnata: ['Consegnata', 'ok'], Fatturata: ['Consegnata', 'ok'], 'Non consegnata': ['Non consegnata', 'red'], Giacenza: ['Giacenza', 'red'], Annullata: ['Annullata', undefined],
};
function Tabella(p: { colonne: string[]; minWidth?: number; vuoto?: string; righe: number; children: React.ReactNode }) {
  return <div className="glass tbox"><table className="t" style={p.minWidth ? { minWidth: p.minWidth } : undefined}>
    <thead><tr>{p.colonne.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
    <tbody>{p.righe === 0 ? <tr><td colSpan={p.colonne.length} className="lbl">{p.vuoto ?? 'Niente da mostrare.'}</td></tr> : p.children}</tbody></table></div>;
}

/** apre un file privato dello storage con un link che scade dopo 10 minuti */
function useApriFile() {
  const [msg, setMsg] = useState<string | null>(null);
  const apri = async (bucket: string, percorso: string | null) => {
    setMsg(null);
    if (!percorso) return setMsg('Il documento non è ancora disponibile.');
    try { const u = await db.storage.link(bucket, percorso); if (!u) return setMsg(db.modo === 'prova' ? 'In prova i documenti non ci sono: con il portale vero si apre il file.' : 'Documento non trovato.'); window.open(u, '_blank', 'noopener'); }
    catch (e) { setMsg((e as Error).message); }
  };
  return { apri, msg };
}

// ------------------------------------------------------------------ menu
const NAV = [['home', 'Home'], ['magazzino', 'Magazzino'], ['spedizioni', 'Spedizioni'], ['giacenze', 'Giacenze'], ['fatture', 'Fatture']] as const;
const leggiPercorso = () => decodeURIComponent(location.hash.replace(/^#\/?/, '')) || 'home';

// link della mail «Password dimenticata»: Supabase torna qui con #access_token=…&type=recovery
const recupero = (() => { const h = new URLSearchParams(location.hash.replace(/^#\/?/, '')); return h.get('type') === 'recovery' ? h.get('access_token') : null; })();

function App() {
  if (recupero) return <NuovaPassword token={recupero} />;
  return <Portale />;
}

function Portale() {
  const [io, setIo] = useState<Profilo | null | undefined>(undefined);
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [percorso, setPercorso] = useState(leggiPercorso());
  const [giro, setGiro] = useState(0);
  const [cerca, setCerca] = useState('');
  const carica = useCallback(async () => {
    const s = db.auth.sessione();
    if (!s) return setIo(null);
    try {
      const p = await db.from<Profilo>('profili').select('id,ruolo,nome,cliente_id').eq('id', s.user.id).single();
      if (p.ruolo === 'cliente') setClienti(await db.from<Cliente>('clienti_portale').select('id,nome,portale_live'));
      setIo(p);
    } catch { await db.auth.logout(); setIo(null); }
  }, []);
  useEffect(() => { carica(); }, [carica]);
  useEffect(() => {
    const f = () => { setPercorso(leggiPercorso()); setCerca(''); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f);
  }, []);
  const vai = useCallback((p: string) => { location.hash = '#/' + p; }, []);
  const aggiorna = useCallback(() => setGiro((g) => g + 1), []);
  useEffect(() => onCambioProva(aggiorna), [aggiorna]);   // prova: i dati cambiati in un altro programma della pagina

  if (io === undefined) return null;
  if (!io) return <Login onEntra={carica} />;
  if (io.ruolo !== 'cliente') return (
    <div className="login"><div className="glass box stack"><h1>Messina</h1>
      <p className="lbl" style={{ margin: 0 }}>Il portale è per i clienti: il tuo accesso è sul gestionale.</p>
      <Btn onClick={() => db.auth.logout().then(() => location.reload())}>Esci</Btn></div></div>);
  return (
    <AppCtx.Provider value={{ db, io, clienti, vai, percorso, aggiorna, giro, cerca }}>
      <Shell cerca={cerca} onCerca={setCerca} />
    </AppCtx.Provider>
  );
}

function Shell(p: { cerca: string; onCerca: (v: string) => void }) {
  const { io, clienti, vai, percorso } = useApp();
  const cur = percorso.split('/')[0] || 'home';
  const nome = clienti.find((c) => c.id === io.cliente_id)?.nome ?? io.nome;
  const titolo = NAV.find((n) => n[0] === cur)?.[1] ?? 'Home';
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const n = nav.current; if (!n || window.innerWidth > 760) return;
    const on = n.querySelector<HTMLElement>('.nav.on'); if (on) n.scrollLeft = on.offsetLeft - n.clientWidth / 2 + on.clientWidth / 2;
  }, [cur]);
  const corpo = { home: <Home />, magazzino: <Magazzino />, spedizioni: <Spedizioni />, giacenze: <Giacenze />, fatture: <Fatture /> }[cur] ?? <Home />;
  return (
    <div className="wrap">
      <div className="gest">
        <nav className="side glass" aria-label="Sezioni del portale" ref={nav}>
          <div className="co"><b>MESSINA</b><span className="lbl">{nome}</span></div>
          {NAV.map(([id, n]) => <button key={id} type="button" className={'nav' + (cur === id ? ' on' : '')} aria-current={cur === id ? 'page' : undefined} onClick={() => vai(id)}>{n}</button>)}
          <button type="button" className="nav esci" onClick={() => db.auth.logout().then(() => location.reload())}>Esci</button>
        </nav>
        <div className="content">
          <div className="chead">
            <div><div className="lbl">{dataLunga()} · {nome}{db.modo === 'prova' ? ' · Prova' : ''}</div><h2>{titolo}</h2></div>
            {cur !== 'home' && <div className="row"><Search id="s-portale" value={p.cerca} onChange={p.onCerca} /></div>}
          </div>
          {corpo}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ dati comuni
interface Bolla { id: string; numero: string | null; cliente_id: string; tipo: string; data_consegna: string | null; fascia: string | null; destinatario: string | null; citta: string | null;
  colli_previsti: number | null; stato: string; colli?: { letto_entrata: string | null; letto_carico: string | null; letto_consegna: string | null }[]; fermate?: { id: string; esito: string; firmata: boolean; foto_bolla: string | null; chiusa_il: string | null }[] }
const useBolle = () => {
  const { clienti } = useApp();
  return useDati((d) => d.from<Bolla>('bolle').select('id,numero,cliente_id,tipo,data_consegna,fascia,destinatario,citta,colli_previsti,stato,colli(letto_entrata,letto_carico,letto_consegna),fermate(id,esito,firmata,foto_bolla,chiusa_il)')
    .in('cliente_id', clienti.map((c) => c.id)).neq('tipo', 'Magazzino').order('data_consegna', { ascending: false }).limit(300), [clienti]);
};
interface Bancale { id: string; codice: string; cliente: string; posto: string | null; creato_il: string }
interface Contenuto { id: string; bancale_id: string; articolo: string; quantita: number; codici: string[]; inserito: string; il: string }

// ------------------------------------------------------------------ Home
function Home() {
  const { clienti, vai } = useApp();
  const live = clienti.some((c) => c.portale_live);
  const { dati: bolle } = useBolle();
  const { dati: bancali } = useDati((d) => live ? d.rpc<Bancale[]>('portale_bancali') : Promise.resolve([] as Bancale[]), [live]);
  const { dati: giac } = useDati((d) => d.from<any>('giacenze').select('id,bolla_id').is('chiusa_il', null), []);
  const { dati: fatt } = useDati((d) => d.from<any>('fatture').select('id,stato,imponibile,iva').in('cliente_id', clienti.map((c) => c.id)).in('stato', ['Inviata', 'Pagata']), [clienti]);
  const mieBolle = new Set((bolle ?? []).map((b) => b.id));
  const nGiac = (giac ?? []).filter((g) => mieBolle.has(g.bolla_id)).length;
  const inCorso = (bolle ?? []).filter((b) => ['Nuova', 'Confermata', 'In giro'].includes(b.stato));
  const daPagare = (fatt ?? []).filter((f) => f.stato === 'Inviata');
  const ultime = (bolle ?? []).slice(0, 6);
  return (<>
    <div className="grid g4">
      <Stat label="Spedizioni in corso" value={bolle ? num(inCorso.length) : '…'} sub={`${(bolle ?? []).filter((b) => b.data_consegna === new Date().toISOString().slice(0, 10)).length} in consegna oggi`} />
      {live && <Stat label="Bancali in magazzino" value={bancali ? num(bancali.length) : '…'} sub="aggiornati in tempo reale" />}
      <Stat label="In giacenza" value={giac ? num(nGiac) : '…'} sub={nGiac ? 'da riconsegnare' : 'nessuna'} alert={nGiac > 0} />
      <Stat label="Fatture da pagare" value={fatt ? num(daPagare.length) : '…'} sub={eur(daPagare.reduce((a, f) => a + Number(f.imponibile) + Number(f.iva ?? 0), 0)) + ' IVA compresa'} />
    </div>
    <div className="grid g2">
      <div className="glass card"><h3 style={{ fontSize: 18, marginBottom: 6 }}>Ultime spedizioni</h3><div className="list">
        {ultime.length ? ultime.map((b) => { const [s, c] = STATO[b.stato] ?? [b.stato, undefined]; return (
          <button key={b.id} type="button" className="li" onClick={() => vai('spedizioni')}>
            <span className="row between" style={{ width: '100%' }}><span>{b.destinatario ?? '—'}{b.citta ? ', ' + b.citta : ''}</span><Pill tone={c}>{s}</Pill></span>
            <span className="lbl">{b.numero ? 'Bolla ' + b.numero + ' · ' : ''}{giornoCorto(b.data_consegna)} · {num(b.colli_previsti)} colli</span>
          </button>); }) : <div className="lbl" style={{ padding: 14 }}>{bolle ? 'Nessuna spedizione.' : 'Carico…'}</div>}
      </div></div>
      <div className="glass card"><h3 style={{ fontSize: 18, marginBottom: 6 }}>Da guardare</h3><div className="list">
        {nGiac > 0 && <button type="button" className="li" onClick={() => vai('giacenze')}><span className="row between" style={{ width: '100%' }}><span>{nGiac === 1 ? '1 spedizione in giacenza' : nGiac + ' spedizioni in giacenza'}: scegliete il giorno di riconsegna</span><Pill tone="red">Giacenze</Pill></span></button>}
        {daPagare.length > 0 && <button type="button" className="li" onClick={() => vai('fatture')}><span className="row between" style={{ width: '100%' }}><span>{daPagare.length === 1 ? '1 fattura da pagare' : daPagare.length + ' fatture da pagare'}</span><Pill>Fatture</Pill></span></button>}
        {live && <button type="button" className="li" onClick={() => vai('magazzino')}><span className="row between" style={{ width: '100%' }}><span>Il vostro magazzino, con tutti i seriali</span><Pill>Magazzino</Pill></span></button>}
        {!nGiac && !daPagare.length && !live && <div className="lbl" style={{ padding: 14 }}>Tutto in ordine.</div>}
      </div></div>
    </div>
  </>);
}

// ------------------------------------------------------------------ Magazzino (in tempo reale)
function Magazzino() {
  const { clienti, cerca } = useApp();
  const live = clienti.some((c) => c.portale_live);
  const [tick, setTick] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [agg, setAgg] = useState(new Date().toISOString());
  useEffect(() => { if (!live) return; const t = setInterval(() => { setTick((x) => x + 1); setAgg(new Date().toISOString()); }, 30000); return () => clearInterval(t); }, [live]);
  const { dati: bancali, errore } = useDati((d) => live ? d.rpc<Bancale[]>('portale_bancali') : Promise.resolve([] as Bancale[]), [live, tick]);
  const ids = (bancali ?? []).map((b) => b.id);
  const { dati: cont } = useDati((d) => ids.length ? d.from<Contenuto>('contenuto').select('id,bancale_id,articolo,quantita,codici,inserito,il').in('bancale_id', ids) : Promise.resolve([] as Contenuto[]), [ids.join(',')]);
  if (!live) return <Card><b>Magazzino in tempo reale</b><p className="lbl" style={{ margin: '6px 0 0' }}>Non è attivo per il vostro contratto. Per attivarlo scrivete al vostro referente in Messina.</p></Card>;
  const conta = (b: string) => (cont ?? []).filter((c) => c.bancale_id === b);
  const piu = (bancali?.map((b) => b.cliente) ?? []).some((c, _i, a) => c !== a[0]);
  const vis = (bancali ?? []).filter((b) => trova(cerca, b.codice, b.posto, b.cliente, ...conta(b.id).flatMap((c) => [c.articolo, ...c.codici])));
  const pezzi = (cont ?? []).reduce((a, c) => a + c.quantita, 0);
  const cur = bancali?.find((b) => b.id === sel) ?? null;
  const righe = cur ? conta(cur.id) : [];
  return (<>
    <div className="grid g4">
      <Stat label="Bancali" value={bancali ? num(bancali.length) : '…'} />
      <Stat label="Pezzi" value={cont ? num(pezzi) : '…'} />
      <Stat label="Seriali" value={cont ? num((cont ?? []).reduce((a, c) => a + c.codici.length, 0)) : '…'} sub={`aggiornato alle ${hm(agg)}`} />
    </div>
    {errore && <div className="warn">{errore}</div>}
    {cur && <div className="glass card stack">
      <div className="row between"><h3 style={{ fontSize: 20 }}>Contenuto · {cur.codice}</h3><span className="row"><span className="lbl">{cur.posto ?? 'In movimento'}{piu ? ' · ' + cur.cliente : ''}</span><Btn ghost sm onClick={() => setSel(null)}>Chiudi</Btn></span></div>
      <div className="tbox"><table className="t"><thead><tr><th>Articolo</th><th>Quantità</th><th>Seriali</th><th>Inserito</th><th>Ora</th></tr></thead><tbody>
        {righe.length ? righe.map((c) => <tr key={c.id} className={c.inserito === 'Manuale' ? 'korow' : ''}><td><b>{c.articolo}</b></td><td>{num(c.quantita)}</td>
          <td style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: 13 }}>{c.codici.length ? c.codici.join(', ') : <span className="lbl">—</span>}</td><td>{c.inserito}</td><td>{quando(c.il)}</td></tr>)
          : <tr><td colSpan={5} className="lbl">Bancale vuoto.</td></tr>}
      </tbody></table></div>
      <p className="lbl" style={{ margin: 0 }}>Le righe in rosso sono state cambiate a mano in magazzino; tutto il resto è letto con la pistola.</p>
    </div>}
    <Tabella colonne={['Bancale', 'Posto', ...(piu ? ['Cliente'] : []), 'Cosa c’è', 'Pezzi', 'Da']} righe={vis.length} vuoto={bancali ? (cerca ? 'Nessun bancale con questo codice o seriale.' : 'Nessun bancale in magazzino.') : 'Carico…'}>
      {vis.map((b) => { const c = conta(b.id); return (
        <tr key={b.id} className="click" style={sel === b.id ? { background: 'var(--soft)' } : undefined} onClick={() => setSel(b.id)}>
          <td><b>{b.codice}</b></td><td>{b.posto ?? <span className="lbl">In movimento</span>}</td>{piu && <td>{b.cliente}</td>}
          <td>{c.map((x) => x.articolo).join(', ') || <span className="lbl">—</span>}</td><td>{num(c.reduce((a, x) => a + x.quantita, 0))}</td><td>{giornoCorto(b.creato_il)}</td>
        </tr>); })}
    </Tabella>
    <p className="lbl" style={{ margin: 0 }}>Si aggiorna da solo ogni 30 secondi. Cercate un seriale o un IMEI per sapere in che bancale si trova.</p>
  </>);
}

// ------------------------------------------------------------------ Spedizioni
const FILTRI = ['Tutte', 'In corso', 'Consegnate', 'Giacenza'] as const;
function Spedizioni() {
  const { cerca, clienti } = useApp();
  const [f, setF] = useState<(typeof FILTRI)[number]>('Tutte');
  const { dati: bolle, errore } = useBolle();
  const file = useApriFile();
  const gruppo = (b: Bolla) => ['Nuova', 'Confermata', 'In giro'].includes(b.stato) ? 'In corso' : ['Consegnata', 'Fatturata'].includes(b.stato) ? 'Consegnate' : ['Giacenza', 'Non consegnata'].includes(b.stato) ? 'Giacenza' : 'Altro';
  const vis = (bolle ?? []).filter((b) => (f === 'Tutte' || gruppo(b) === f) && trova(cerca, b.numero, b.destinatario, b.citta));
  const conta = (x: string) => (bolle ?? []).filter((b) => gruppo(b) === x).length;
  const piu = clienti.length > 1;
  return (<>
    <div className="row">{FILTRI.map((x) => <Chip key={x} on={f === x} onClick={() => setF(x)}>{x}{x === 'Giacenza' ? <Badge n={conta('Giacenza')} /> : null}</Chip>)}</div>
    {errore && <div className="warn">{errore}</div>}
    {file.msg && <Msg>{file.msg}</Msg>}
    <Tabella colonne={['Bolla', 'Giorno', ...(piu ? ['Cliente'] : []), 'Destinatario', 'Colli', 'Stato', 'Firma']} minWidth={760} righe={vis.length} vuoto={bolle ? 'Nessuna spedizione.' : 'Carico…'}>
      {vis.map((b) => {
        const [s, c] = STATO[b.stato] ?? [b.stato, undefined];
        const colli = b.colli ?? []; const mag = b.tipo === 'Ritiro';
        const letti = colli.filter((k) => b.stato === 'Consegnata' || b.stato === 'Fatturata' ? k.letto_consegna : mag ? k.letto_entrata : k.letto_carico).length;
        const ferm = (b.fermate ?? []).find((x) => x.foto_bolla && x.esito === 'Consegnata');
        return (
          <tr key={b.id}>
            <td><b>{b.numero ?? <span className="lbl">In preparazione</span>}</b><div className="lbl">{b.tipo}</div></td>
            <td>{giornoCorto(b.data_consegna)}{b.fascia ? <div className="lbl">{b.fascia}</div> : null}</td>
            {piu && <td>{clienti.find((x) => x.id === b.cliente_id)?.nome}</td>}
            <td>{b.destinatario ?? '—'}{b.citta ? <div className="lbl">{b.citta}</div> : null}</td>
            <td>{colli.length ? `${num(letti)} di ${num(b.colli_previsti)}` : num(b.colli_previsti)}</td>
            <td><Pill tone={c}>{s}</Pill></td>
            <td>{ferm ? <Btn ghost sm onClick={() => file.apri('bolle', ferm.foto_bolla)}>Foto</Btn> : <span className="lbl">—</span>}</td>
          </tr>);
      })}
    </Tabella>
    <p className="lbl" style={{ margin: 0 }}>Ogni collo è letto con la pistola al carico e alla consegna. Quando la consegna è fatta, «Foto» apre la bolla firmata dal destinatario.</p>
  </>);
}

// ------------------------------------------------------------------ Giacenze
interface Giacenza { id: string; bolla_id: string; motivo: string; dal: string; riconsegna_il: string | null; bolle: { numero: string | null; destinatario: string | null; indirizzo: string | null; citta: string | null; cliente_id: string } | null;
  richieste_riconsegna?: { id: string; data: string; nota: string | null; gestita_il: string | null }[] }
function Giacenze() {
  const { cerca, clienti, aggiorna } = useApp();
  const ids = clienti.map((c) => c.id);
  const { dati, errore } = useDati((d) => d.from<Giacenza>('giacenze').select('id,bolla_id,motivo,dal,riconsegna_il,bolle(numero,destinatario,indirizzo,citta,cliente_id),richieste_riconsegna(id,data,nota,gestita_il)').is('chiusa_il', null).order('dal'), []);
  const [sel, setSel] = useState<string | null>(null);
  const [data, setData] = useState(domani());
  const [nota, setNota] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [attesa, setAttesa] = useState(false);
  const G = (dati ?? []).filter((g) => g.bolle && ids.includes(g.bolle.cliente_id) && trova(cerca, g.bolle.numero, g.bolle.destinatario, g.bolle.citta, g.motivo));
  const cur = G.find((g) => g.id === sel) ?? G[0];
  const rich = (g: Giacenza) => (g.richieste_riconsegna ?? []).find((r) => !r.gestita_il);
  const giorni = (d: string) => Math.max(0, Math.round((Date.now() - new Date(d + 'T00:00:00').getTime()) / 86400000));
  const chiedi = async () => {
    if (!cur) return; setAttesa(true); setErr(null); setMsg(null);
    try { await db.rpc('richiedi_riconsegna', { p_giacenza: cur.id, p_data: data, p_nota: nota.trim() || null }); setMsg(`Richiesta inviata per ${giornoCorto(data).toLowerCase()}: l’ufficio conferma la data e la spedizione torna nei giri.`); setNota(''); aggiorna(); }
    catch (e) { setErr((e as Error).message); } finally { setAttesa(false); }
  };
  if (errore) return <div className="warn">{errore}</div>;
  if (!dati) return <p className="lbl">Carico…</p>;
  if (!G.length) return <Msg>Nessuna spedizione in giacenza.</Msg>;
  const r = cur ? rich(cur) : undefined;
  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
      <div className="glass" style={{ flex: '1 1 280px', padding: 8, minWidth: 0 }}>
        <div className="row between" style={{ padding: '8px 10px' }}><b>In magazzino</b><span className="lbl">{G.length === 1 ? '1 spedizione' : G.length + ' spedizioni'}</span></div>
        <div className="list">{G.map((g) => (
          <button key={g.id} type="button" className={'li' + (cur?.id === g.id ? ' on' : '')} onClick={() => { setSel(g.id); setMsg(null); setErr(null); }}>
            <span className="row between" style={{ width: '100%' }}><b>{g.bolle?.destinatario ?? '—'}</b>{rich(g) ? <Pill tone="ok">Richiesta inviata</Pill> : <Pill tone="red">Da prenotare</Pill>}</span>
            <span className="lbl">{g.motivo} · dal {giornoCorto(g.dal).toLowerCase()}</span>
          </button>))}</div>
      </div>
      {cur && <div className="glass card stack" style={{ flex: '2 1 420px', minWidth: 0 }}>
        <div className="row between"><h3 style={{ fontSize: 22, letterSpacing: '-.02em' }}>{cur.bolle?.destinatario ?? '—'} · giacenza</h3><span className="lbl">Bolla {cur.bolle?.numero ?? '—'}</span></div>
        <div className="kv">
          <div><div className="lbl">Destinatario</div><b>{[cur.bolle?.destinatario, cur.bolle?.citta].filter(Boolean).join(', ') || '—'}</b></div>
          <div><div className="lbl">Motivo della mancata consegna</div><b>{cur.motivo}</b></div>
          <div><div className="lbl">In giacenza dal</div><b>{giornoCorto(cur.dal)}</b></div>
          <div><div className="lbl">Giorni</div><b>{giorni(cur.dal)}</b></div>
          <div><div className="lbl">Riconsegna</div><b>{r ? 'Chiesta per ' + giornoCorto(r.data).toLowerCase() : 'Da prenotare'}</b></div>
        </div>
        {msg && <Msg>{msg}</Msg>}
        {err && <div className="warn">{err}</div>}
        <div className="stack" style={{ gap: 8, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <div className="row">
            <label className="field" style={{ flex: '0 1 200px' }}><span className="lbl">Giorno di riconsegna</span><input className="input" type="date" min={domani()} value={data} onChange={(e) => setData(e.target.value)} /></label>
            <label className="field" style={{ flex: '1 1 220px' }}><span className="lbl">Nota per l’autista</span><input className="input" value={nota} placeholder="Orari, piano, referente" onChange={(e) => setNota(e.target.value)} /></label>
          </div>
          <div className="row"><Btn onClick={chiedi} disabled={attesa || !data}>{r ? 'Cambia' : 'Chiedi'}</Btn><span className="lbl">La giacenza costa ogni giorno secondo il vostro contratto: prima si riconsegna, meno si paga.</span></div>
        </div>
      </div>}
    </div>
  );
}

// ------------------------------------------------------------------ Fatture
interface Fattura { id: string; numero: string | null; periodo: string | null; data: string | null; imponibile: number; iva: number; stato: string; pagata_il: string | null; pdf: string | null; cliente_id: string;
  righe_fattura?: { voce: string; quantita: number; prezzo: number; totale: number }[] }
const mese = (p: string | null) => { if (!p) return '—'; const s = new Date(p + '-15').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }); return s[0].toUpperCase() + s.slice(1); };
function Fatture() {
  const { cerca, clienti } = useApp();
  const { dati, errore } = useDati((d) => d.from<Fattura>('fatture').select('id,numero,periodo,data,imponibile,iva,stato,pagata_il,pdf,cliente_id,righe_fattura(voce,quantita,prezzo,totale)')
    .in('cliente_id', clienti.map((c) => c.id)).in('stato', ['Inviata', 'Pagata']).order('data', { ascending: false }), [clienti]);
  const [sel, setSel] = useState<string | null>(null);
  const file = useApriFile();
  const vis = (dati ?? []).filter((f) => trova(cerca, f.numero, mese(f.periodo)));
  const cur = vis.find((f) => f.id === sel);
  const daPagare = (dati ?? []).filter((f) => f.stato === 'Inviata');
  return (<>
    <div className="grid g4">
      <Stat label="Da pagare" value={dati ? eur(daPagare.reduce((a, f) => a + Number(f.imponibile) + Number(f.iva), 0)) : '…'} sub={daPagare.length === 1 ? '1 fattura, IVA compresa' : daPagare.length + ' fatture, IVA compresa'} />
      <Stat label="Pagate quest’anno" value={dati ? num((dati ?? []).filter((f) => f.stato === 'Pagata' && (f.pagata_il ?? '').slice(0, 4) === String(new Date().getFullYear())).length) : '…'} />
    </div>
    {errore && <div className="warn">{errore}</div>}
    {file.msg && <Msg>{file.msg}</Msg>}
    {cur && <div className="glass card stack">
      <div className="row between"><h3 style={{ fontSize: 20 }}>Fattura {cur.numero ?? ''} · {mese(cur.periodo)}</h3><span className="row"><Btn sm onClick={() => file.apri('documenti', cur.pdf)}>PDF</Btn><Btn ghost sm onClick={() => setSel(null)}>Chiudi</Btn></span></div>
      <div className="tbox"><table className="t"><thead><tr><th>Voce</th><th>Quantità</th><th>Prezzo</th><th>Totale</th></tr></thead><tbody>
        {(cur.righe_fattura ?? []).map((r, i) => <tr key={i}><td><b>{r.voce}</b></td><td>{num(r.quantita)}</td><td>{eur(r.prezzo)}</td><td>{eur(r.totale)}</td></tr>)}
      </tbody></table></div>
      <div className="row between"><span className="lbl">Imponibile {eur(cur.imponibile)} · IVA {eur(cur.iva)}</span><b>Totale {eur(Number(cur.imponibile) + Number(cur.iva))}</b></div>
    </div>}
    <Tabella colonne={['Numero', 'Mese', 'Data', 'Totale', 'Stato', '']} minWidth={680} righe={vis.length} vuoto={dati ? 'Nessuna fattura.' : 'Carico…'}>
      {vis.map((f) => (
        <tr key={f.id} className="click" style={sel === f.id ? { background: 'var(--soft)' } : undefined} onClick={() => setSel(f.id)}>
          <td><b>{f.numero ?? '—'}</b></td><td>{mese(f.periodo)}</td><td>{giornoCorto(f.data)}</td><td>{eur(Number(f.imponibile) + Number(f.iva))}</td>
          <td>{f.stato === 'Pagata' ? <Pill tone="ok">Pagata</Pill> : <Pill tone="dark">Da pagare</Pill>}</td>
          <td><Btn ghost sm onClick={() => { file.apri('documenti', f.pdf); }}>PDF</Btn></td>
        </tr>))}
    </Tabella>
    <p className="lbl" style={{ margin: 0 }}>Ogni voce della fattura viene dalle vostre bolle e dalle tariffe del contratto. Per una domanda su una fattura scrivete all’amministrazione.</p>
  </>);
}

// ------------------------------------------------------------------ accesso
function Login({ onEntra }: { onEntra: () => void }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [attesa, setAttesa] = useState(false);
  const entra = async (e?: string, p?: string) => {
    setAttesa(true); setErrore(null); setMsg(null);
    try { await db.auth.login(e ?? email, p ?? pw); onEntra(); } catch (x) { setErrore((x as Error).message); } finally { setAttesa(false); }
  };
  // password dimenticata: Supabase manda la mail con il link per sceglierne una nuova
  const recupera = async () => {
    setErrore(null); setMsg(null);
    if (!email.trim()) return setErrore('Scrivi prima la tua email.');
    if (db.modo === 'prova' || !cfg?.supabaseUrl || !cfg.supabaseKey) return setMsg('In prova la mail non parte: con il portale vero arriva il link per una nuova password.');
    setAttesa(true);
    try {
      const r = await fetch(`${cfg.supabaseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(location.origin + location.pathname)}`,
        { method: 'POST', headers: { apikey: cfg.supabaseKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) });
      if (!r.ok && r.status !== 429) throw new Error('Richiesta non riuscita: riprova tra qualche minuto.');
      setMsg('Se l’email è registrata, arriva un link per scegliere una nuova password.');
    } catch (x) { setErrore((x as Error).message); } finally { setAttesa(false); }
  };
  const clientiProva = ELENCO_PROVA.filter((u) => u.dove === 'Cliente');
  return (
    <div className="login">
      <form className="glass box stack" onSubmit={(e) => { e.preventDefault(); entra(); }}>
        <div><h1>Messina</h1><div className="lbl">Portale clienti</div></div>
        {db.modo === 'prova' ? (<>
          <p className="lbl" style={{ margin: 0 }}>Prova con dati di esempio. Scegli il cliente.</p>
          <div className="stack" style={{ gap: 8 }}>{clientiProva.map((u) => <Btn key={u.email} ghost disabled={attesa} onClick={() => entra(u.email, 'prova')}>{u.nome}</Btn>)}</div>
        </>) : (<>
          <label className="field"><span className="lbl">Email</span><input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="field"><span className="lbl">Password</span><input className="input" type="password" autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></label>
          <Btn type="submit" disabled={attesa}>Entra</Btn>
          <button type="button" className="tab" style={{ alignSelf: 'flex-start' }} onClick={recupera} disabled={attesa}>Password dimenticata</button>
        </>)}
        {msg && <Msg>{msg}</Msg>}
        {errore && <div className="warn">{errore}</div>}
      </form>
    </div>
  );
}

function NuovaPassword({ token }: { token: string }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [fatto, setFatto] = useState(false);
  const salva = async () => {
    setErrore(null);
    if (pw.length < 12) return setErrore('Almeno 12 caratteri.');
    if (pw !== pw2) return setErrore('Le due password non sono uguali.');
    try {
      const r = await fetch(`${cfg!.supabaseUrl}/auth/v1/user`, { method: 'PUT', headers: { apikey: cfg!.supabaseKey!, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
      if (!r.ok) throw new Error('Il link è scaduto: chiedine un altro.');
      setFatto(true); history.replaceState(null, '', location.pathname);
    } catch (x) { setErrore((x as Error).message); }
  };
  return (
    <div className="login">
      <form className="glass box stack" onSubmit={(e) => { e.preventDefault(); salva(); }}>
        <div><h1>Messina</h1><div className="lbl">Nuova password</div></div>
        {fatto ? (<><Msg>Password cambiata.</Msg><Btn onClick={() => location.reload()}>Entra</Btn></>) : (<>
          <label className="field"><span className="lbl">Nuova password</span><input className="input" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></label>
          <label className="field"><span className="lbl">Ripeti</span><input className="input" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
          <Btn type="submit">Salva</Btn>
        </>)}
        {errore && <div className="warn">{errore}</div>}
      </form>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
