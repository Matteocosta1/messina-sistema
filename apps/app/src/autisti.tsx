// App autisti: il giro di oggi, fermata per fermata (autistiApp del mockup approvato).
import React, { useEffect, useRef, useState } from 'react';
import { KI, Pill } from '@messina/ui';
import { useApp, useDati, useAzione, dataApp, posizione, off, Num, ErroreApp, vibra } from './core';
import { useScan, usePistola, useCodiciProva } from './scanner';
import { analizzaFoto, Firma, type InfoFoto } from './foto';

interface Fermata { id: string; ordine: number; esito: 'Da fare' | 'Consegnata' | 'Non consegnata'; motivo: string | null; dopo: string | null; firmata: boolean; foto: boolean;
  numero: string | null; tipo: string; destinatario: string | null; indirizzo: string | null; citta: string | null; fascia: string | null; note: string | null;
  colli: number; letti: number; accessori: string[]; extra: string[] }
interface Giro { giro: { id: string; data: string; zona: string | null; stato: string }; mezzo: { tipo: string; sponda: boolean; targa: string } | null; fermate: Fermata[] }

type Scr = 'lista' | 'dett' | 'firma' | 'mancata' | 'nota' | 'merce' | 'esito';
const MOTIVI = ['Destinatario assente', 'Indirizzo sbagliato', 'Merce rifiutata', 'Chiuso o fuori orario', 'Altro, lascio una nota vocale'];

const ind = (f: Fermata) => [f.indirizzo, f.citta].filter(Boolean).join(', ');
const cli = (f: Fermata) => f.destinatario ?? '—';
const etichetta = (f: Fermata) => f.esito === 'Consegnata' ? 'Fatta' : f.esito === 'Non consegnata' ? (f.dopo === 'Giacenza' ? 'Giacenza' : 'Riconsegna fissata') : f.motivo ? 'Riprovo dopo' : '';
const big30 = (el: React.ReactNode) => <span style={{ display: 'inline-flex' }}>{el}</span>;

export function Autisti() {
  const { db } = useApp();
  const { dati: g, errore } = useDati((d) => d.rpc<Giro | null>('mio_giro_oggi'), []);
  const { dati: soglia } = useDati((d) => d.from<any>('impostazioni').select('valore').eq('chiave', 'soglia_nitidezza').then((r) => Number(r[0]?.valore ?? 35)), []);
  const [scr, setScr] = useState<Scr>('lista');
  const [cur, setCur] = useState<string | null>(null);
  const [why, setWhy] = useState('');
  const [esito, setEsito] = useState<'rico' | 'dopo' | 'giac'>('giac');
  const [conf, setConf] = useState<Record<string, { colli?: boolean; acc?: boolean }>>({});
  const vai = (s: Scr) => { setScr(s); window.scrollTo(0, 0); };
  if (errore) return <div className="pscr"><ErroreApp testo={errore} /></div>;
  if (g === null) return <div className="pscr"><div className="lbl">Carico il giro…</div></div>;
  if (!g) return <div className="pscr"><div className="pcard" style={{ padding: 16 }}><div className="lbl">{dataApp()}</div><div className="ptitle" style={{ marginTop: 2 }}>Consegne</div>
    <div className="lbl" style={{ marginTop: 8 }}>Oggi non hai un giro assegnato. Se pensi che sia un errore chiama il traffico.</div></div></div>;
  const f = g.fermate.find((x) => x.id === cur) ?? null;
  if (scr === 'lista' || !f || f.esito !== 'Da fare') {
    const n = g.fermate.filter((x) => x.esito !== 'Da fare').length, tot = g.fermate.length;
    return (
      <div className="pscr">
        <div className="pcard" style={{ padding: 16 }}><div className="lbl">{dataApp()}{g.mezzo ? ' · ' + g.mezzo.tipo + (g.mezzo.sponda ? ' con sponda' : '') : ''}</div><div className="ptitle" style={{ marginTop: 2 }}>Consegne</div>
          <div className="bar" style={{ marginTop: 12 }}><i style={{ width: (tot ? n / tot * 100 : 0) + '%' }} /></div><div className="lbl" style={{ marginTop: 6 }}>{n} di {tot} fermate fatte</div></div>
        {g.fermate.map((s, i) => { const chiusa = s.esito !== 'Da fare';
          return <button key={s.id} type="button" className={'stop' + (chiusa ? ' done' : '')} onClick={() => { if (chiusa) return; setCur(s.id); vai('dett'); }}>
            <span className="n">{i + 1}</span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}><b style={{ fontSize: 16 }}>{cli(s)}</b><span className="lbl">{ind(s)}{s.fascia ? ' · ' + s.fascia : ''}</span></span>
            <b style={{ fontSize: 12 }}>{etichetta(s)}</b></button>; })}
        {tot > 0 && n === tot && <div className="pcard" style={{ padding: 14, textAlign: 'center' }}><b>Giro chiuso</b><div className="lbl" style={{ marginTop: 4 }}>Ogni consegna ha la sua bolla fotografata e leggibile: in ufficio non serve la chiusura a fine giornata.</div></div>}
      </div>
    );
  }
  const idx = g.fermate.findIndex((x) => x.id === f.id);
  const c = conf[f.id] ?? {};
  const pronto = !!c.colli && !!c.acc && f.firmata;
  if (scr === 'dett') return <Dettaglio f={f} idx={idx} conf={c} conferma={(k) => setConf((x) => ({ ...x, [f.id]: { ...x[f.id], [k]: true } }))}
    onBack={() => vai('lista')} onAvanti={() => vai('firma')} />;
  if (scr === 'firma') return <FotoBolla f={f} soglia={soglia ?? 35} pronto={pronto} onBack={() => vai('dett')} onFatto={() => vai('lista')} onMancata={() => vai('mancata')} />;
  if (scr === 'mancata') return (
    <div className="pscr">
      <button type="button" className="back" onClick={() => vai('firma')}>Indietro</button>
      <div className="lbl">Passo 1 di 2</div>
      <div className="ptitle">Perché non è stata consegnata?</div>
      {MOTIVI.map((x) => <button key={x} type="button" className="bigbtn ghost" style={{ textAlign: 'left', fontSize: 17 }} onClick={() => { if (x.startsWith('Altro')) vai('nota'); else { setWhy(x); vai('merce'); } }}>{x}</button>)}
    </div>);
  if (scr === 'nota') return <NotaVocale f={f} onBack={() => vai('mancata')} onFatto={(m) => { setWhy(m); vai('merce'); }} />;
  if (scr === 'merce') return (
    <div className="pscr">
      <button type="button" className="back" onClick={() => vai('mancata')}>Indietro</button>
      <div className="lbl">Passo 2 di 2 · {why}</div>
      <div className="ptitle">E adesso la merce?</div>
      <button type="button" className="bigbtn ghost" style={{ textAlign: 'left', fontSize: 17 }} onClick={() => { setEsito('rico'); vai('esito'); }}>C’è già una nuova consegna fissata<span className="lbl" style={{ display: 'block', fontWeight: 500, marginTop: 2 }}>Il cliente ha dato un’altra data</span></button>
      <button type="button" className="bigbtn ghost" style={{ textAlign: 'left', fontSize: 17 }} onClick={() => { setEsito('dopo'); vai('esito'); }}>Riprovo più tardi in questo giro<span className="lbl" style={{ display: 'block', fontWeight: 500, marginTop: 2 }}>Resta sul mezzo</span></button>
      <button type="button" className="bigbtn" style={{ textAlign: 'left', fontSize: 17 }} onClick={() => { setEsito('giac'); vai('esito'); }}>Torna in magazzino: giacenza<span style={{ display: 'block', fontWeight: 500, fontSize: 13, opacity: .75, marginTop: 2 }}>Deposito a pagamento per il cliente</span></button>
    </div>);
  return <Esito f={f} why={why} esito={esito} onBack={() => vai('mancata')} onFatto={() => vai('lista')} db={db} />;
}

function Dettaglio({ f, idx, conf, conferma, onBack, onAvanti }: { f: Fermata; idx: number; conf: { colli?: boolean; acc?: boolean }; conferma: (k: 'colli' | 'acc') => void; onBack: () => void; onAvanti: () => void }) {
  const { db } = useApp();
  const scan = useScan();
  const az = useAzione();
  const [accOpen, setAccOpen] = useState(false);
  const [firma, setFirma] = useState(false);
  const { dati: possibili } = useDati((d) => d.rpc<string[]>('accessori_possibili', { p_fermata: f.id }), [f.id]);
  const codici = useCodiciProva('fermata', f.id, f.letti);
  const accs = [...f.accessori, ...f.extra.filter((x) => !f.accessori.includes(x))];
  const letti = f.colli > 0 && f.letti >= f.colli;
  const d1 = letti && !!conf.colli, d2 = d1 && !!conf.acc, d3 = d2 && f.firmata;
  const leggi = async (c: string) => { const r = await az.esegui(() => db.rpc<{ letti: number; totale: number }>('scansiona_consegna', { p_fermata: f.id, p_codice: c })); if (r) vibra(); return r; };
  usePistola(letti ? null : (c) => { leggi(c); });
  const scansiona = async () => {
    let n = f.letti;
    while (n < f.colli) {
      const c = await scan(`Collo ${n + 1} di ${f.colli}`, codici ?? undefined);
      if (!c) return;
      const r = await leggi(c); if (r) n = r.letti; else return;
    }
  };
  const aggiungi = async (v: string) => { const p = await posizione(); await az.esegui(() => db.rpc('aggiungi_accessorio', { p_fermata: f.id, p_voce: v, p_lat: p?.lat ?? null, p_lng: p?.lng ?? null })); setAccOpen(false); };
  const firmata = async (png: Blob) => {
    const ok = await az.esegui(async () => { await db.storage.carica('bolle', `${f.id}/firma-${Date.now()}.png`, png); return db.rpc('firma_fermata', { p_fermata: f.id }); });
    if (ok !== undefined) setFirma(false);
  };
  const mappa = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + encodeURIComponent(ind(f));
  const blk = (n: number, t: string, done: boolean, on: boolean, body: React.ReactNode) => (
    <div className="pcard stack" style={{ padding: 14, gap: 10, ...(done ? { border: '2px solid var(--ok)', background: 'var(--ok-soft)' } : on ? { border: '2px solid var(--solid)' } : { opacity: .4, pointerEvents: 'none' }) }}>
      <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}><Num n={n} fatto={done} /><b style={{ fontSize: 20, color: done ? 'var(--ok)' : undefined }}>{t}</b></div>{body}</div>);
  const altri = (possibili ?? []).filter((x) => !accs.includes(x));
  const Conferma = ({ ok, onClick }: { ok: boolean; onClick: () => void }) => <button type="button" className="bigbtn" onClick={onClick} {...(ok ? {} : off)}>Conferma</button>;
  const righeAcc = accs.length ? accs.map((x) => <div key={x} className="pcard row between" style={{ padding: '12px 14px', fontSize: 17 }}>
    <span>{x}</span><span className="lbl">{f.accessori.includes(x) ? 'in bolla' : 'aggiunto'}</span></div>) : <div className="lbl">Nessuno sulla bolla.</div>;
  return (
    <div className="pscr">
      <button type="button" className="back" onClick={onBack}>Consegne</button>
      <div><div className="lbl">Fermata {idx + 1}{f.fascia ? ' · ' + f.fascia : ''}</div><div className="ptitle">{cli(f)}</div>
        <div className="row between" style={{ flexWrap: 'nowrap', gap: 10, marginTop: 4 }}><span style={{ fontSize: 16 }}>{ind(f)}</span>
          <a className="round" href={mappa} target="_blank" rel="noopener" aria-label="Navigatore per camion" style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'inherit' }}>{KI.pin()}</a></div>
        {f.note && <div style={{ marginTop: 6 }}><Pill tone="dark">{f.note}</Pill></div>}</div>
      <ErroreApp testo={az.errore} />
      {blk(1, 'Colli', d1, true, d1 || letti ? <><div style={{ fontSize: 17 }}>{f.colli} colli · tutti scansionati</div>{!d1 && <Conferma ok onClick={() => conferma('colli')} />}</> : <>
        <div style={{ fontSize: 17 }}>{f.colli} colli da scaricare. Scansiona ogni collo.</div>
        {f.letti > 0 && <div className="lbl">{f.letti} di {f.colli} scansionati</div>}
        <button type="button" className="bigbtn ghost" onClick={scansiona} aria-label="Scansiona i colli" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{big30(KI.cam(30))}</button>
        <Conferma ok={false} onClick={() => {}} /></>)}
      {blk(2, 'Accessori', d2, d1, d2 ? righeAcc : <>
        {righeAcc}
        <button type="button" className="chipbtn" style={{ alignSelf: 'flex-start', borderStyle: 'dashed' }} onClick={() => setAccOpen(!accOpen)}>+ Aggiungi</button>
        {accOpen && <><div className="row" style={{ gap: 6 }}>{altri.length ? altri.map((x) => <button key={x} type="button" className="chipbtn" onClick={() => aggiungi(x)}>{x}</button>)
          : <span className="lbl">Nessun altro accessorio previsto per questo cliente: avvisa l’ufficio.</span>}</div><div className="lbl">Va da solo in fattura.</div></>}
        <Conferma ok onClick={() => { setAccOpen(false); conferma('acc'); }} />
      </>)}
      {blk(3, 'Firma', d3, d2, d3 ? <div style={{ fontSize: 17 }}>Firmata dal cliente</div> : firma
        ? <><div style={{ fontSize: 15 }}>Fai firmare il cliente qui sotto, con il dito.</div><Firma onFatto={firmata} onAnnulla={() => setFirma(false)} /></>
        : <><div style={{ fontSize: 17 }}>Tocca e fai firmare il cliente.</div>
          <button type="button" className="bigbtn" onClick={() => setFirma(true)} aria-label="Firma del cliente" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{big30(KI.pen(30))}</button></>)}
      <div style={{ flex: 1 }} />
      <button type="button" className="bigbtn" onClick={onAvanti} {...(d1 ? {} : off)}>Avanti</button>
    </div>
  );
}

function FotoBolla({ f, soglia, pronto, onBack, onFatto, onMancata }: { f: Fermata; soglia: number; pronto: boolean; onBack: () => void; onFatto: () => void; onMancata: () => void }) {
  const { db } = useApp();
  const az = useAzione();
  const [stato, setStato] = useState<0 | 1 | 2>(f.foto ? 2 : 0);
  const [inf, setInf] = useState<Partial<InfoFoto> & { titolo?: string; consiglio?: string }>({});
  const [analisi, setAnalisi] = useState(false);
  const scelta = async (file: File) => {
    setAnalisi(true);
    try {
      const i = await analizzaFoto(file, soglia);
      if (i.titolo) { setInf(i); setStato(1); vibra([80, 60, 80]); return; }
      const percorso = `${f.id}/${Date.now()}.jpg`;
      const r = await az.esegui(async () => { await db.storage.carica('bolle', percorso, i.blob); return db.rpc<{ ok: boolean; nitidezza: number; soglia: number }>('foto_bolla', { p_fermata: f.id, p_percorso: 'bolle/' + percorso, p_nitidezza: i.score }); });
      if (!r) { setInf(i); setStato(0); return; }
      if (r.ok) { setInf(i); setStato(2); vibra(); }
      else { setInf({ ...i, titolo: 'Foto sfocata: la bolla non si legge', consiglio: 'Appoggia la bolla su un piano, tieni fermo il telefono e inquadrala tutta.' }); setStato(1); }
    } catch { setInf({ titolo: 'Foto non leggibile', consiglio: 'Riprova con la fotocamera del telefono.' }); setStato(1); }
    finally { setAnalisi(false); }
  };
  const conferma = async () => { const p = await posizione(); const r = await az.esegui(() => db.rpc('chiudi_fermata', { p_fermata: f.id, p_consegnata: true, p_lat: p?.lat ?? null, p_lng: p?.lng ?? null })); if (r !== undefined) { vibra(); onFatto(); } };
  const scatta = <label className="bigbtn" aria-label="Fotografa la bolla" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', position: 'relative', boxSizing: 'border-box' }}>
    {big30(KI.cam(30))}<input id="fotoBolla" type="file" accept="image/*" capture="environment" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
      onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ''; if (x) scelta(x); }} /></label>;
  const prev = inf.url ? <img src={inf.url} alt="Foto della bolla" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, flex: 'none' }} /> : null;
  const misura = inf.score !== undefined ? <div className="lbl" style={{ marginTop: 4 }}>Nitidezza {inf.score} · minimo {soglia} · luce {inf.luce}</div> : null;
  return (
    <div className="pscr">
      <button type="button" className="back" onClick={onBack}>Indietro</button>
      <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}><Num n={4} fatto={stato === 2} /><div className="ptitle">Bolla</div></div>
      <div style={{ fontSize: 18 }}>Fai la foto alla bolla.</div>
      {analisi ? <div className="pcard" style={{ padding: 14 }}><b>Controllo la foto…</b></div>
        : stato === 0 ? scatta
        : stato === 1 ? <><div className="pcard row" style={{ padding: 12, gap: 12, flexWrap: 'nowrap', border: '2px solid var(--alert)', background: 'var(--alert-soft)' }}>{prev}
            <div><b style={{ color: 'var(--alert)', fontSize: 18 }}>Rifai</b><div style={{ fontWeight: 600 }}>{inf.titolo}</div><div style={{ fontSize: 14, marginTop: 2 }}>{inf.consiglio}</div>{misura}</div></div>{scatta}</>
        : <div className="pcard row" style={{ padding: 12, gap: 12, flexWrap: 'nowrap', border: '2px solid var(--ok)', background: 'var(--ok-soft)' }}>{prev}
            <div><b style={{ color: 'var(--ok)', fontSize: 18 }}>✓ Foto buona</b><div style={{ fontSize: 14, marginTop: 2 }}>Salvata con ora e posizione.</div>{misura}</div></div>}
      <ErroreApp testo={az.errore} />
      <div className="lbl">Se la foto è sfocata o buia diventa rossa: rifalla.</div>
      {stato === 2 && !pronto && <div className="lbl" style={{ color: 'var(--alert)', fontWeight: 600 }}>Per «Consegnato» servono anche Accessori e Firma confermati.</div>}
      <div style={{ flex: 1 }} />
      <button type="button" className="bigbtn" onClick={conferma} {...(stato === 2 && pronto && !az.inCorso ? {} : off)}>Consegnato</button>
      <button type="button" className="bigbtn ghost" onClick={onMancata} {...(stato === 2 && !az.inCorso ? {} : off)}>Non consegnato</button>
    </div>
  );
}

function NotaVocale({ f, onBack, onFatto }: { f: Fermata; onBack: () => void; onFatto: (motivo: string) => void }) {
  const { db } = useApp();
  const az = useAzione();
  const rec = useRef<MediaRecorder | null>(null);
  const pezzi = useRef<Blob[]>([]);
  const [stato, setStato] = useState<'pronto' | 'registro' | 'fatto'>('pronto');
  const [audio, setAudio] = useState<Blob | null>(null);
  const [testo, setTesto] = useState('');
  const puo = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices;
  useEffect(() => () => { rec.current?.stream.getTracks().forEach((t) => t.stop()); }, []);
  const avvia = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(s); rec.current = r; pezzi.current = [];
      r.ondataavailable = (e) => pezzi.current.push(e.data);
      r.onstop = () => { s.getTracks().forEach((t) => t.stop()); setAudio(new Blob(pezzi.current, { type: r.mimeType || 'audio/mp4' })); setStato('fatto'); };
      r.start(); setStato('registro');
    } catch { az.setErrore('Microfono non disponibile: scrivi cosa è successo.'); }
  };
  const avanti = async () => {
    if (audio) {
      const est = audio.type.includes('webm') ? 'webm' : 'm4a', p = `${f.id}/nota-${Date.now()}.${est}`;
      const ok = await az.esegui(() => db.storage.carica('bolle', p, audio).then(() => true));
      if (ok) onFatto('Altro · nota vocale bolle/' + p + (testo.trim() ? ' · ' + testo.trim() : ''));
    } else if (testo.trim()) onFatto('Altro · ' + testo.trim());
  };
  return (
    <div className="pscr">
      <button type="button" className="back" onClick={onBack}>Indietro</button>
      <div className="lbl">Passo 1 di 2</div>
      <div className="ptitle">Nota vocale</div>
      {puo && <button type="button" className={'bigbtn' + (stato === 'registro' ? '' : ' ghost')} onClick={() => stato === 'registro' ? rec.current?.stop() : avvia()}>
        {stato === 'registro' ? 'Ferma' : stato === 'fatto' ? 'Registra di nuovo' : 'Registra'}</button>}
      {stato === 'fatto' && audio && <audio controls src={URL.createObjectURL(audio)} style={{ width: '100%' }} />}
      <textarea aria-label="Nota" placeholder="Oppure scrivi cosa è successo" value={testo} onChange={(e) => setTesto(e.target.value)} rows={3}
        style={{ font: 'inherit', padding: 12, borderRadius: 14, border: '1px solid var(--line)', width: '100%', background: 'var(--glass-strong)' }} />
      <ErroreApp testo={az.errore} />
      <div style={{ flex: 1 }} />
      <button type="button" className="bigbtn" onClick={avanti} {...(audio || testo.trim() ? {} : off)}>Avanti</button>
    </div>
  );
}

function Esito({ f, why, esito, onBack, onFatto, db }: { f: Fermata; why: string; esito: 'rico' | 'dopo' | 'giac'; onBack: () => void; onFatto: () => void; db: ReturnType<typeof useApp>['db'] }) {
  const az = useAzione();
  const txt = { rico: ['Nuova consegna fissata', 'La spedizione torna al traffico con la nuova data. In fattura va anche la riconsegna.'],
    dopo: ['Riprovi più tardi', 'La fermata resta nel tuo giro, spostata in fondo.'],
    giac: ['Merce in giacenza', 'Riporta la merce a Lacchiarella e scansiona i colli all’entrata. In ufficio la trovano in Giacenze: il cliente paga la giacenza e la riconsegna quando la prenota.'] }[esito];
  const conferma = async () => {
    const p = await posizione();
    const r = await az.esegui(() => esito === 'dopo' ? db.rpc('riprova_dopo', { p_fermata: f.id, p_motivo: why })
      : db.rpc('chiudi_fermata', { p_fermata: f.id, p_consegnata: false, p_motivo: why, p_dopo: esito === 'rico' ? 'Nuova data' : 'Giacenza', p_lat: p?.lat ?? null, p_lng: p?.lng ?? null }));
    if (r !== undefined) onFatto();
  };
  const breve = why.startsWith('Altro') ? 'Altro' : why;
  return (
    <div className="pscr">
      <button type="button" className="back" onClick={onBack}>Indietro</button>
      <div className="ptitle">{txt[0]}</div>
      <div className="pcard" style={{ padding: 14 }}><b>{cli(f)}</b><div className="lbl">{ind(f)}</div><div style={{ marginTop: 8 }}><Pill tone="red">{breve}</Pill></div></div>
      <p style={{ margin: 0, lineHeight: 1.5 }}>{txt[1]}</p>
      <div className="lbl">Ora e posizione si salvano da sole.</div>
      <ErroreApp testo={az.errore} />
      <div style={{ flex: 1 }} />
      <button type="button" className="bigbtn" onClick={conferma} {...(az.inCorso ? off : {})}>Conferma</button>
    </div>
  );
}
