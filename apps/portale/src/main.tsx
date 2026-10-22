// Portale clienti di Messina Autotrasporti: lo stesso aspetto del gestionale approvato
// (shell con menu laterale, schede in vetro, tabelle). Ogni cliente vede solo il suo:
// lo decidono i permessi del database (RLS); il portale in più filtra per cliente.
import '@messina/dati/prova-tutto';   // stessi dati di prova in tutti i programmi
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@messina/ui/mockup.css';
import '@messina/ui/produzione.css';
import { collega, entraInProva, onCambioProva, type Config, type Db } from '@messina/dati';
import { motoreDiProva, ELENCO_PROVA } from '@messina/dati/prova';
import { Btn, Chip, Msg, Pill, Stat, Card } from '@messina/ui';

declare global { interface Window { MESSINA?: Config } }
const cfg = window.MESSINA;
const db = collega(cfg, motoreDiProva);

// ------------------------------------------------------------------ contesto e dati (stesso schema del gestionale)
interface Profilo { id: string; ruolo: string; nome: string; cliente_id: string | null }
interface Cliente { id: string; nome: string; portale_live: boolean; traccia_asset?: boolean }
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

// ------------------------------------------------------------------ menu (P_NAV del mockup)
const NAV: [string, string][] = [['home', 'Home'], ['spedizioni', 'Spedizioni'], ['magazzino', 'Magazzino'], ['giacenze', 'Giacenze'], ['fatture', 'Fatture']];
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
  const carica = useCallback(async () => {
    await entraInProva(db, window.MESSINA);   // solo in Prova, se la pagina indica l'utente di esempio
    const s = db.auth.sessione();
    if (!s) return setIo(null);
    try {
      const p = await db.from<Profilo>('profili').select('id,ruolo,nome,cliente_id').eq('id', s.user.id).single();
      if (p.ruolo === 'cliente') setClienti(await db.from<Cliente>('clienti_portale').select('id,nome,portale_live,traccia_asset'));
      setIo(p);
    } catch { await db.auth.logout(); setIo(null); }
  }, []);
  useEffect(() => { carica(); }, [carica]);
  useEffect(() => {
    const f = () => { setPercorso(leggiPercorso()); window.scrollTo(0, 0); };
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
    <AppCtx.Provider value={{ db, io, clienti, vai, percorso, aggiorna, giro, cerca: '' }}>
      <Shell />
    </AppCtx.Provider>
  );
}

/** testa del portale del mockup (portbar): «Area clienti» e le cinque schede in riga.
 *  «Cerca» ed «Esci» non sono nel mockup: le funzioni restano, dove metterle è in STATO «Da decidere». */
function Shell() {
  const { io, clienti, vai, percorso } = useApp();
  const cur0 = percorso.split('/')[0] || 'home';
  const cur = NAV.some(([id]) => id === cur0) ? cur0 : 'home';
  const nome = clienti.find((c) => c.id === io.cliente_id)?.nome ?? io.nome;
  const asset = clienti.some((c) => c.traccia_asset);
  const corpo = { home: asset ? <HomeAsset /> : <Home />, spedizioni: asset ? <SpedizioniAsset /> : <Spedizioni />, magazzino: asset ? <Asset /> : <Magazzino />, giacenze: <Giacenze />, fatture: <Fatture /> }[cur] ?? <Home />;
  return (
    <div className="wrap" style={{ paddingTop: 0 }}>
      <div className="glass portbar">
        <div className="row between"><b style={{ fontSize: 17 }}>Messina Autotrasporti <span style={{ fontWeight: 500 }}>· Area clienti</span></b><span className="lbl">{location.host || 'portale.[dominio]'} · entra {nome}</span></div>
        <div className="row" style={{ gap: 6 }}>{NAV.map(([id, n]) => <Chip key={id} on={cur === id} onClick={() => vai(id)}>{n}</Chip>)}</div>
      </div>
      <div className="stack">{corpo}</div>
    </div>
  );
}

// ------------------------------------------------------------------ dati comuni
interface Bolla { id: string; numero: string | null; cliente_id: string; tipo: string; data_consegna: string | null; fascia: string | null; destinatario: string | null; indirizzo?: string | null; citta: string | null;
  colli_previsti: number | null; accessori?: string[]; stato: string; colli?: { letto_entrata: string | null; letto_carico: string | null; letto_consegna: string | null }[]; fermate?: { id: string; esito: string; firmata: boolean; foto_bolla: string | null; nitidezza?: number | null; chiusa_il: string | null }[] }
const useBolle = () => {
  const { clienti } = useApp();
  return useDati((d) => d.from<Bolla>('bolle').select('id,numero,cliente_id,tipo,data_consegna,fascia,destinatario,indirizzo,citta,colli_previsti,accessori,stato,colli(letto_entrata,letto_carico,letto_consegna),fermate(id,esito,firmata,foto_bolla,nitidezza,chiusa_il)')
    .in('cliente_id', clienti.map((c) => c.id)).neq('tipo', 'Magazzino').order('data_consegna', { ascending: false }).limit(300), [clienti]);
};
interface Bancale { id: string; codice: string; cliente: string; posto: string | null; creato_il: string }
interface Contenuto { id: string; bancale_id: string; articolo: string; quantita: number; codici: string[]; inserito: string; il: string }
const oggiLoc = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

// ------------------------------------------------------------------ Home (cliente con il magazzino: Snam nel mockup)
function Home() {
  const { clienti } = useApp();
  const live = clienti.some((c) => c.portale_live);
  const { dati: bolle } = useBolle();
  const { dati: bancali } = useDati((d) => live ? d.rpc<Bancale[]>('portale_bancali') : Promise.resolve([] as Bancale[]), [live]);
  const ids = (bancali ?? []).map((b) => b.id);
  const { dati: cont } = useDati((d) => ids.length ? d.from<Contenuto>('contenuto').select('id,bancale_id,codici').in('bancale_id', ids) : Promise.resolve([] as Contenuto[]), [ids.join(',')]);
  const { dati: giac } = useDati((d) => d.from<any>('giacenze').select('id,bolla_id').is('chiusa_il', null), []);
  const mie = new Set((bolle ?? []).map((b) => b.id));
  const nGiac = (giac ?? []).filter((g) => mie.has(g.bolla_id)).length;
  const oggi = (bolle ?? []).filter((b) => b.data_consegna === oggiLoc());
  const consegnate = oggi.filter((b) => ['Consegnata', 'Fatturata'].includes(b.stato)).length;
  const entratiOggi = (bancali ?? []).filter((b) => b.creato_il.slice(0, 10) === oggiLoc()).length;
  // ultimi movimenti: le letture dei colli delle sue spedizioni, dalla più recente
  const mov = (bolle ?? []).flatMap((b) => {
    const c = b.colli ?? []; const out: [string, string][] = [];
    const ultimo = (k: 'letto_entrata' | 'letto_carico' | 'letto_consegna') => c.map((x) => x[k]).filter(Boolean).sort().pop() as string | undefined;
    const n = (k: 'letto_entrata' | 'letto_carico' | 'letto_consegna') => c.filter((x) => x[k]).length;
    const nome = `${b.numero ?? 'Spedizione'}${b.citta ? ' · ' + b.citta : ''}`;
    if (ultimo('letto_consegna')) out.push([ultimo('letto_consegna')!, `${nome}: consegnata, ${n('letto_consegna')} di ${b.colli_previsti} colli`]);
    else if (ultimo('letto_carico')) out.push([ultimo('letto_carico')!, `${nome}: ${n('letto_carico')} di ${b.colli_previsti} colli caricati sul mezzo`]);
    if (ultimo('letto_entrata')) out.push([ultimo('letto_entrata')!, `${nome}: ${n('letto_entrata')} di ${b.colli_previsti} colli entrati in magazzino`]);
    return out;
  }).filter((x) => x[0].slice(0, 10) === oggiLoc()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 5);
  return (<>
    <div className="grid g4">
      <Stat label="Spedizioni di oggi" value={bolle ? num(oggi.length) : '…'} sub={consegnate ? (consegnate === 1 ? '1 consegnata' : consegnate + ' consegnate') : 'nessuna ancora consegnata'} />
      <Stat label="Bancali da noi" value={bancali ? num(bancali.length) : '…'} sub={entratiOggi ? entratiOggi + ' entrati oggi' : 'aggiornato in tempo reale'} />
      <Stat label="Seriali" value={cont ? num(cont.reduce((a, c) => a + (c.codici?.length ?? 0), 0)) : '…'} sub="ognuno con il suo posto" />
      <Stat label="Giacenze" value={giac ? num(nGiac) : '…'} sub={nGiac ? 'riconsegna da chiedere' : 'nessuna'} />
    </div>
    <div className="glass card"><h3 style={{ fontSize: 18, marginBottom: 6 }}>Ultimi movimenti</h3><div className="list">
      {mov.length ? mov.map(([t, x], i) => <div key={i} className="li"><span className="row between" style={{ width: '100%' }}><span>{x}</span><span className="lbl">{hm(t)}</span></span></div>)
        : <div className="lbl" style={{ padding: 12 }}>Nessun movimento oggi.</div>}
    </div></div>
  </>);
}

// ------------------------------------------------------------------ Asset (telefoni per utente: Econocom per UniCredit nel mockup)
interface Asset { id: string; cliente_id: string; imei: string; modello: string | null; cespite: string | null; utente: string | null; sede: string | null; stato: string; accessori?: string[] | null; cliente_finale?: string | null;
  entrato_il: string; spedito_il: string | null; bancali?: { codice: string } | null; bolle?: { numero: string | null } | null }
const useAsset = () => {
  const { clienti } = useApp();
  const ids = clienti.filter((c) => c.traccia_asset).map((c) => c.id);
  return useDati((d) => d.from<Asset>('asset').select('id,cliente_id,imei,modello,cespite,utente,sede,stato,accessori,cliente_finale,entrato_il,spedito_il,bancali(codice),bolle(numero)')
    .in('cliente_id', ids).order('entrato_il', { ascending: false }).limit(5000), [ids.join(',')]);
};
const statoAsset = (x: string) => x === 'Spedito' ? <Pill tone="ok">Spedito</Pill> : x === 'In magazzino' ? <Pill>{x}</Pill> : <Pill tone="dark">{x === 'Abbinato' ? 'Preparato' : x}</Pill>;
const dove = (a: Asset) => a.stato === 'Spedito' ? (a.bolle?.numero ? 'Bolla ' + a.bolle.numero : '—') : !a.cespite ? 'Cespite da abbinare' : a.bancali?.codice ?? '—';
const finale = (a: Asset) => a.cliente_finale ?? '';
function HomeAsset() {
  const { dati: A } = useAsset();
  const n = (x: string) => (A ?? []).filter((a) => a.stato === x).length;
  const chi = [...new Set((A ?? []).map(finale).filter(Boolean))].join(', ');
  return (<>
    <div className="grid g4">
      <Stat label={`Device ${chi || ''} ricevuti`.replace('  ', ' ')} value={A ? num(A.length) : '…'} />
      <Stat label="Preparati" value={A ? num(n('Abbinato')) : '…'} sub="doppio cespite applicato" />
      <Stat label="Spediti" value={A ? num(n('Spedito')) : '…'} sub="con busta di reso" />
      <Stat label="Resi rientrati" value={A ? num(n('Rientrato')) : '…'} sub="telefoni usati in deposito" />
    </div>
    <p className="lbl" style={{ margin: 0 }}>Ogni sparo, carico e scarico si vede qui subito. Ogni sera parte anche il file Excel IMEI · Cespite · Utente.</p>
  </>);
}
const ASSET_COL = ['IMEI', 'Cespite', 'Utente', 'Sede', 'Accessori', 'Stato'];
const rigaAsset = (a: Asset, ultima: string) => <tr key={a.id}><td>{a.imei}</td><td><b>{a.cespite ?? '—'}</b></td><td>{a.utente ?? '—'}</td><td>{[finale(a), a.sede].filter(Boolean).join(' · ') || '—'}</td>
  <td className="lbl">{a.accessori?.length ? a.accessori.join(', ') : '—'}</td><td>{statoAsset(a.stato)}</td><td>{ultima}</td></tr>;
function SpedizioniAsset() {
  const { dati: A } = useAsset();
  const L = (A ?? []).filter((a) => a.stato !== 'In magazzino');
  return (<>
    <div className="lbl">Richieste di {[...new Set(L.map(finale).filter(Boolean))].join(', ') || 'utenti'}: ogni mail indica gli utenti del giorno. Il programma le trasforma in ordini.</div>
    <Tabella colonne={[...ASSET_COL, 'Tracciamento']} minWidth={980} righe={L.length} vuoto={A ? 'Nessuna spedizione.' : 'Carico…'}>
      {L.slice(0, 500).map((a) => rigaAsset(a, a.stato === 'Spedito' ? (a.bolle?.numero ? 'Bolla ' + a.bolle.numero : '—') : dove(a)))}
    </Tabella>
  </>);
}
function Asset() {
  const { dati: A } = useAsset();
  return (<>
    <Tabella colonne={[...ASSET_COL, 'Busta']} minWidth={980} righe={(A ?? []).length} vuoto={A ? 'Nessun telefono.' : 'Carico…'}>
      {(A ?? []).slice(0, 500).map((a) => rigaAsset(a, dove(a)))}
    </Tabella>
    <div className="grid g2"><div className="glass card"><b>Doppio cespite</b><p className="lbl" style={{ margin: '6px 0 0' }}>Etichetta piccola sul retro del telefono e grande sulla scatola, stesso numero. L’app non chiude la preparazione finché non le ha lette tutte e due.</p></div>
      <div className="glass card"><b>Reso dell’usato</b><p className="lbl" style={{ margin: '6px 0 0' }}>In ogni scatola una busta SDA con l’etichetta di reso già stampata per il telefono vecchio.</p></div></div>
  </>);
}
/** il file serale (asset_csv / asset_file) non è nel mockup: resta pronto, dove metterlo è in STATO «Da decidere» */
export async function fileAsset(cliente: Cliente) { return scarica(`asset-${cliente.nome}-${new Date().toISOString().slice(0, 10)}.csv`, await db.rpc<string>('asset_csv', { p_cliente: cliente.id })); }

// ------------------------------------------------------------------ Magazzino (in tempo reale)
function Magazzino() {
  const { clienti } = useApp();
  const live = clienti.some((c) => c.portale_live);
  const [tick, setTick] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { if (!live) return; const t = setInterval(() => setTick((x) => x + 1), 30000); return () => clearInterval(t); }, [live]);
  const { dati: bancali, errore } = useDati((d) => live ? d.rpc<Bancale[]>('portale_bancali') : Promise.resolve([] as Bancale[]), [live, tick]);
  const ids = (bancali ?? []).map((b) => b.id);
  const { dati: cont } = useDati((d) => ids.length ? d.from<Contenuto>('contenuto').select('id,bancale_id,articolo,quantita,codici,inserito,il').in('bancale_id', ids) : Promise.resolve([] as Contenuto[]), [ids.join(',')]);
  if (!live) return <Card><b>Magazzino in tempo reale</b><p className="lbl" style={{ margin: '6px 0 0' }}>Non è attivo per il vostro contratto. Per attivarlo scrivete al vostro referente in Messina.</p></Card>;
  const conta = (b: string) => (cont ?? []).filter((c) => c.bancale_id === b);
  const nuovi = (bancali ?? []).filter((b) => b.creato_il.slice(0, 10) === oggiLoc()).length;
  const cur = bancali?.find((b) => b.id === sel) ?? null;
  return (<>
    <div className="row between"><span className="lbl">Aggiornato in tempo reale, 24 ore su 24</span>{nuovi > 0 && <Pill tone="dark">{nuovi} nuovi oggi</Pill>}</div>
    {errore && <div className="warn">{errore}</div>}
    <Tabella colonne={['Bancale', 'Posto', 'Contenuto', 'Seriali', '']} righe={(bancali ?? []).length} vuoto={bancali ? 'Nessun bancale in magazzino.' : 'Carico…'}>
      {(bancali ?? []).map((b) => { const c = conta(b.id); const oggi = b.creato_il.slice(0, 10) === oggiLoc(); return (
        <tr key={b.id} style={oggi ? { background: 'var(--ok-soft)' } : undefined}>
          <td><b>{b.codice}</b></td><td>{b.posto ?? <span className="lbl">In movimento</span>}</td><td>{c.map((x) => x.articolo).join(', ') || '—'}</td>
          <td>{num(c.reduce((a, x) => a + (x.codici?.length ?? 0), 0))} · <button type="button" className="lbl" style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }} onClick={() => setSel(sel === b.id ? null : b.id)}>SN… elenco</button></td>
          <td>{oggi ? <Pill tone="ok">Entrato oggi</Pill> : null}</td></tr>); })}
    </Tabella>
    {cur && <div className="glass card stack">
      <div className="row between"><b>{cur.codice} · seriali</b><Btn ghost sm onClick={() => setSel(null)}>Chiudi</Btn></div>
      <div style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', fontSize: 13, lineHeight: 1.7 }}>{conta(cur.id).flatMap((c) => c.codici).join(', ') || '—'}</div>
    </div>}
  </>);
}

// ------------------------------------------------------------------ Spedizioni
const scarica = (nome: string, testo: string) => {
  const u = URL.createObjectURL(new Blob(['﻿' + testo], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = u; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 10000);
};
function Spedizioni() {
  const { dati: bolle, errore } = useBolle();
  const [pod, setPod] = useState<string | null>(null);
  const file = useApriFile();
  const vis = bolle ?? [];
  const cur = vis.find((b) => b.id === pod);
  const fer = (b: Bolla) => (b.fermate ?? []).find((x) => x.esito === 'Consegnata');
  return (<>
    {errore && <div className="warn">{errore}</div>}
    {file.msg && <Msg>{file.msg}</Msg>}
    <Tabella colonne={['Spedizione', 'Destinatario', 'Colli', 'Stato', '']} righe={vis.length} vuoto={bolle ? 'Nessuna spedizione.' : 'Carico…'}>
      {vis.map((b) => { const [s, c] = STATO[b.stato] ?? [b.stato, undefined]; const f = fer(b);
        return <tr key={b.id}><td><b>{b.numero ?? <span className="lbl">In preparazione</span>}</b></td>
          <td>{[b.destinatario, [b.indirizzo, b.citta].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || '—'}</td><td>{num(b.colli_previsti)} {b.colli_previsti === 1 ? 'collo' : 'colli'}</td>
          <td><Pill tone={c}>{s}</Pill></td><td>{f ? <Btn ghost sm onClick={() => setPod(pod === b.id ? null : b.id)}>{pod === b.id ? 'Chiudi' : 'Prova di consegna'}</Btn> : null}</td></tr>; })}
    </Tabella>
    {cur && (() => { const f = fer(cur)!; const colli = cur.colli ?? []; return <div className="glass card stack">
      <div className="row between"><h3 style={{ fontSize: 20 }}>Prova di consegna · {cur.numero}</h3>{f.firmata ? <Pill tone="ok">Firmata</Pill> : <Pill>Senza firma</Pill>}</div>
      <div className="grid g4"><div><div className="lbl">Consegnata</div><b>{quando(f.chiusa_il)}</b></div><div><div className="lbl">Posizione</div><b>{[cur.indirizzo, cur.citta].filter(Boolean).join(', ') || '—'}</b></div>
        <div><div className="lbl">Colli</div><b>{colli.filter((x) => x.letto_consegna).length} su {cur.colli_previsti} scansionati</b></div><div><div className="lbl">Accessori</div><b>{cur.accessori?.length ? cur.accessori.join(', ') : '—'}</b></div></div>
      <div className="row" style={{ gap: 12, alignItems: 'stretch' }}>
        <button type="button" className="ph" onClick={() => file.apri('bolle', f.foto_bolla)} style={{ flex: '1 1 220px', aspectRatio: '3/4', maxWidth: 260, flexDirection: 'column', gap: 8, padding: 16, alignItems: 'stretch', justifyContent: 'flex-start', background: '#fff', boxShadow: 'inset 0 0 0 1px var(--line)', border: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
          <b style={{ fontSize: 12 }}>DDT {cur.numero}</b><span style={{ height: 6, background: 'var(--soft)', borderRadius: 4 }} /><span style={{ height: 6, background: 'var(--soft)', borderRadius: 4, width: '80%' }} /><span style={{ height: 6, background: 'var(--soft)', borderRadius: 4, width: '60%' }} />
          <span className="lbl" style={{ marginTop: 'auto' }}>Foto della bolla{f.nitidezza != null ? ' · nitidezza ' + f.nitidezza : ''}</span></button>
        <div className="lbl" style={{ flex: '1 1 200px' }}>Firma, foto della bolla, ora e posizione arrivano dall’app dell’autista nel momento della consegna. Il cliente non deve più chiedere la bolla firmata per mail.</div></div>
    </div>; })()}
  </>);
}

// ------------------------------------------------------------------ Giacenze
interface Giacenza { id: string; bolla_id: string; motivo: string; dal: string; riconsegna_il: string | null; bolle: { numero: string | null; destinatario: string | null; indirizzo: string | null; citta: string | null; cliente_id: string } | null;
  richieste_riconsegna?: { id: string; data: string; nota: string | null; gestita_il: string | null }[] }
/** il primo giorno lavorativo da domani: la riconsegna proposta dal tasto del mockup («Riconsegna giovedì») */
const proposto = () => { const d = new Date(); do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const nomeG = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long' });
function Giacenze() {
  const { clienti, aggiorna } = useApp();
  const ids = clienti.map((c) => c.id);
  const { dati, errore } = useDati((d) => d.from<Giacenza>('giacenze').select('id,bolla_id,motivo,dal,riconsegna_il,bolle(numero,destinatario,indirizzo,citta,cliente_id),richieste_riconsegna(id,data,nota,gestita_il)').is('chiusa_il', null).order('dal'), []);
  const { dati: tar } = useDati((d) => d.from<any>('tariffe').select('cliente_id,voce,unita,prezzo').in('cliente_id', ids).eq('voce', 'Giacenza'), [ids.join(',')]);
  const [err, setErr] = useState<string | null>(null);
  const [attesa, setAttesa] = useState(false);
  const G = (dati ?? []).filter((g) => g.bolle && ids.includes(g.bolle.cliente_id));
  const chiedi = async (g: Giacenza) => {
    setAttesa(true); setErr(null);
    try { await db.rpc('richiedi_riconsegna', { p_giacenza: g.id, p_data: proposto(), p_nota: null }); aggiorna(); }
    catch (e) { setErr((e as Error).message); } finally { setAttesa(false); }
  };
  if (errore) return <div className="warn">{errore}</div>;
  if (!dati) return <p className="lbl">Carico…</p>;
  if (!G.length) return <div className="glass card lbl">Nessuna giacenza.</div>;
  const costo = (g: Giacenza) => { const t = (tar ?? []).find((x) => x.cliente_id === g.bolle?.cliente_id); return t ? ` · ${eur(Number(t.prezzo)).replace(',00', '')} ${t.unita === 'giorno' ? 'al giorno' : 'a ' + t.unita}` : ''; };
  return (<>
    {err && <div className="warn">{err}</div>}
    {G.map((g) => { const r = (g.richieste_riconsegna ?? []).find((x) => !x.gestita_il); return (
      <div key={g.id} className="glass card stack">
        <div className="row between"><b>{g.bolle?.numero ?? '—'} · {[g.bolle?.destinatario, g.bolle?.citta].filter(Boolean).join(', ')}</b><Pill tone="red">Giacenza</Pill></div>
        <div className="lbl">{g.motivo} · da {giornoCorto(g.dal).toLowerCase()}{costo(g)}</div>
        {r ? <Msg>Richiesta inviata: riconsegna {nomeG(r.data)}. Ti arriva la conferma appena l’ufficio la mette in giro.</Msg>
          : <div className="row"><Btn onClick={() => chiedi(g)} disabled={attesa}>Riconsegna {nomeG(proposto())}</Btn><Btn ghost>Reso al mittente</Btn></div>}
      </div>); })}
  </>);
}

// ------------------------------------------------------------------ Fatture
interface Fattura { id: string; numero: string | null; periodo: string | null; data: string | null; imponibile: number; iva: number; stato: string; pagata_il: string | null; pdf: string | null; cliente_id: string }
const mese = (p: string | null) => { if (!p) return '—'; const s = new Date(p + '-15').toLocaleDateString('it-IT', { month: 'long' }); return s[0].toUpperCase() + s.slice(1); };
function Fatture() {
  const { clienti } = useApp();
  const { dati, errore } = useDati((d) => d.from<Fattura>('fatture').select('id,numero,periodo,data,imponibile,iva,stato,pagata_il,pdf,cliente_id')
    .in('cliente_id', clienti.map((c) => c.id)).in('stato', ['Inviata', 'Pagata']).order('data', { ascending: false }), [clienti]);
  const file = useApriFile();
  const vis = dati ?? [];
  return (<>
    {errore && <div className="warn">{errore}</div>}
    {file.msg && <Msg>{file.msg}</Msg>}
    <Tabella colonne={['Fattura', 'Periodo', 'Importo', 'Stato', '']} righe={vis.length} vuoto={dati ? 'Nessuna fattura.' : 'Carico…'}>
      {vis.map((f) => <tr key={f.id}><td><b>{f.numero ?? '—'}</b></td><td>{mese(f.periodo)}</td><td>{eur(Number(f.imponibile) + Number(f.iva))}</td>
        <td>{f.stato === 'Pagata' ? <Pill tone="ok">Pagata</Pill> : <Pill>Da pagare</Pill>}</td><td><Btn ghost sm onClick={() => file.apri('documenti', f.pdf)}>PDF</Btn></td></tr>)}
    </Tabella>
    <p className="lbl" style={{ margin: 0 }}>Ogni riga della fattura rimanda alla sua spedizione, con la prova di consegna.</p>
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
