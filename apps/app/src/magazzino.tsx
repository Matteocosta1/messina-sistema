// App magazzino: Entrata, Uscita, Trasferisci e Missioni (magApp del mockup approvato).
// Ogni collo e ogni bancale si scansiona insieme al suo posto.
import React, { useState } from 'react';
import { Pill } from '@messina/ui';
import { useApp, useDati, useAzione, dataApp, Esito, ErroreApp, vibra } from './core';
import { useScan, usePistola, useCodiciProva } from './scanner';

type Scr = 'home' | 'entrata' | 'uscita' | 'sposta' | 'conta';
interface Info { tipo: 'collo' | 'bancale'; codice: string; cliente: string; posto: string | null; proposto: string | null; bolla_id?: string; numero?: string | null; totale?: number; messi?: number }
interface Uscita { bolla_id: string; numero: string | null; cliente: string; mezzo: string; autista: string; totale: number; caricati: number; colli: { codice: string; posto: string | null; caricato: boolean }[] }
interface PostoMissione { id: string; missione_id: string; posto: string; stato: 'Da fare' | 'Fatto' | 'Bloccato' | 'Sbloccato'; elenco: { articolo: string; pezzi: number; letti: number }[]; pezzi: number; letti: number; extra: number }

type Tipo = 'Bancale' | 'Collo';
/** scelta Bancale / Collo in Entrata e Trasferisci */
const Seg = ({ v, onChange }: { v: Tipo; onChange: (t: Tipo) => void }) => (
  <div className="seg" role="tablist">{(['Bancale', 'Collo'] as const).map((x) => <button key={x} type="button" role="tab" aria-selected={v === x} className={v === x ? 'on' : ''} onClick={() => onChange(x)}>{x}</button>)}</div>);

const Big = ({ label, sub, dark, onClick }: { label: string; sub?: string; dark?: boolean; onClick: () => void }) => (
  <button type="button" className={'bigbtn' + (dark ? '' : ' ghost')} style={{ textAlign: 'left', fontSize: 19 }} onClick={onClick}>{label}
    {sub && <span style={{ display: 'block', fontWeight: 500, fontSize: 13, opacity: .7, marginTop: 2 }}>{sub}</span>}</button>);

export function Magazzino() {
  const { io } = useApp();
  const [scr, setScr] = useState<Scr>('home');
  const { dati: posti } = useDati((d) => d.from<PostoMissione>('missioni_posti_app').select('*').order('posto'), [scr]);
  const { dati: missione } = useDati((d) => d.from<any>('missioni').select('id,ambito,filtro').eq('stato', 'Aperta').order('creata_il', { ascending: false }).limit(1).then((r) => r[0] ?? null), [scr]);
  const vai = (s: Scr) => { setScr(s); window.scrollTo(0, 0); };
  const back = <button type="button" className="back" onClick={() => vai('home')}>Magazzino</button>;
  const nomeMissione = missione ? (missione.ambito === 'Tutto' ? 'Tutto il magazzino' : missione.ambito === 'Cliente' ? missione.filtro : (missione.ambito === 'Scaffale' ? 'Scaffale ' : 'Zona ') + missione.filtro) : '';
  if (scr === 'entrata') return <Entrata back={back} />;
  if (scr === 'uscita') return <UscitaScr back={back} />;
  if (scr === 'sposta') return <Sposta back={back} />;
  if (scr === 'conta') return <Missione back={back} posti={posti ?? []} nome={nomeMissione} breve={missione?.filtro ?? ''} />;
  const done = (posti ?? []).filter((p) => p.stato !== 'Da fare').length, tot = posti?.length ?? 0;
  return (
    <div className="pscr">
      <div><div className="lbl">{dataApp()} · {io.nome}</div><div className="ptitle">Magazzino</div></div>
      {missione && tot > 0 && done < tot && <button type="button" className="pcard" style={{ padding: 14, textAlign: 'left', border: '2px solid var(--alert)', background: 'var(--alert-soft)', cursor: 'pointer', font: 'inherit' }} onClick={() => vai('conta')}>
        <b style={{ color: 'var(--alert)' }}>Missione · {nomeMissione}</b><div style={{ fontSize: 14, marginTop: 2 }}>{done} di {tot} posti fatti. Tocca per {done ? 'riprendere' : 'iniziare'}.</div></button>}
      <Big label="Entrata" sub="Scarico dal camion e metto a posto" dark onClick={() => vai('entrata')} />
      <Big label="Uscita" sub="Preparo e carico una spedizione" onClick={() => vai('uscita')} />
      <Big label="Trasferisci" sub="Cambio posto a un bancale o a un collo" onClick={() => vai('sposta')} />
      <Big label="Missioni" sub="Controlli mandati dall’ufficio" onClick={() => vai('conta')} />
    </div>
  );
}

function Entrata({ back }: { back: React.ReactNode }) {
  const { db } = useApp();
  const scan = useScan();
  const az = useAzione();
  const [tipo, setTipo] = useState<Tipo>('Bancale');
  const [info, setInfo] = useState<Info | null>(null);   // ultimo bancale o collo letto, in attesa del posto o del bancale
  const [bolla, setBolla] = useState<{ cliente: string; numero: string | null; totale: number; messi: number } | null>(null);
  const [step, setStep] = useState<0 | 1>(0);
  const codici = useCodiciProva(step === 0 ? 'entrata' : tipo === 'Collo' ? 'su-bancale' : 'posto', step === 0 ? tipo : tipo === 'Collo' ? info?.codice ?? null : info?.proposto ?? null, bolla?.messi);
  const leggi = async (c: string) => {
    if (step === 0) {
      const i = await az.esegui(() => db.rpc<Info>('info_codice', { p_codice: c }));
      if (!i) return;
      if (i.tipo !== (tipo === 'Bancale' ? 'bancale' : 'collo')) { az.setErrore(tipo === 'Bancale' ? 'Questo è un collo: scegli «Collo» sopra' : 'Questo è un bancale: scegli «Bancale» sopra'); vibra([80, 60, 80]); return; }
      setInfo(i); setStep(1); vibra();
      if (i.tipo === 'collo') setBolla({ cliente: i.cliente, numero: i.numero ?? null, totale: i.totale ?? 0, messi: i.messi ?? 0 });
    } else if (info) {
      const r = await az.esegui(() => tipo === 'Collo' ? db.rpc<any>('collo_su_bancale', { p_codice: info.codice, p_bancale: c }) : db.rpc<any>('metti_a_posto', { p_codice: info.codice, p_posto: c }));
      if (!r) return;
      vibra(); setStep(0);
      if (r.totale !== undefined) setBolla((b) => b ? { ...b, messi: r.messi, totale: r.totale } : b);
    }
  };
  usePistola((c) => { leggi(c); });
  const cambia = (t: Tipo) => { setTipo(t); setStep(0); setInfo(null); az.setErrore(null); };
  const fin = !!bolla && bolla.totale > 0 && bolla.messi >= bolla.totale && step === 0;
  const passo = tipo === 'Bancale' ? (step === 0 ? '1. Scansiona il bancale' : '2. Scansiona il posto') : (step === 0 ? '1. Scansiona il collo' : '2. Scansiona il bancale');
  const aiuto = step === 0 ? (tipo === 'Bancale' ? 'Etichetta del bancale' : 'Etichetta della scatola')
    : tipo === 'Collo' ? 'Il bancale dove appoggi la scatola, dello stesso cliente'
    : info?.proposto ? <>Posto proposto: <b>{info.proposto}</b></> : 'Nessun posto libero proposto: scegli tu';
  return (
    <div className="pscr">{back}
      <div><div className="lbl">{bolla ? `Bolla ${bolla.cliente}${bolla.numero ? ' ' + bolla.numero : ''} · ${bolla.totale} colli` : 'Scansiona il primo bancale o collo'}</div><div className="ptitle">Entrata</div></div>
      {bolla && <><div className="bar"><i style={{ width: (bolla.messi / Math.max(1, bolla.totale) * 100) + '%' }} /></div><div className="lbl">{bolla.messi} di {bolla.totale} colli messi a posto</div></>}
      <ErroreApp testo={az.errore} />
      {fin ? <><Esito ok titolo={`Bolla completa: ${bolla!.totale} su ${bolla!.totale}`}>Il cliente lo vede subito sul suo portale.</Esito>
          <button type="button" className="btn ghost" onClick={() => { setBolla(null); setInfo(null); }}>Nuova entrata</button></>
        : <><Seg v={tipo} onChange={cambia} />
          <div className="scanbox"><b style={{ fontSize: 18 }}>{passo}</b><span className="lbl">{aiuto}</span></div>
          <button type="button" className="bigbtn" onClick={async () => { const c = await scan(passo.slice(3), codici); if (c) leggi(c); }}>{step === 0 ? `Scansiona ${tipo.toLowerCase()}` : tipo === 'Bancale' ? 'Scansiona posto' : 'Scansiona bancale'}</button></>}
    </div>
  );
}

function UscitaScr({ back }: { back: React.ReactNode }) {
  const { db } = useApp();
  const scan = useScan();
  const az = useAzione();
  const { dati: uscite } = useDati((d) => d.rpc<Uscita[]>('uscite_oggi'), []);
  const [sel, setSel] = useState<string | null>(null);
  const [sbagliato, setSbagliato] = useState<string | null>(null);
  const [via, setVia] = useState(false);
  const u = uscite?.find((x) => x.bolla_id === sel) ?? (uscite?.length === 1 ? uscite[0] : null);
  const codici = useCodiciProva('uscita', u?.bolla_id ?? null, u?.caricati);
  const leggi = async (c: string) => {
    if (!u) return;
    const k = u.colli.find((x) => x.codice === c);
    if (!k) {
      vibra([120, 80, 120]);
      const i = await db.rpc<Info>('info_codice', { p_codice: c }).catch(() => null);
      const giusto = u.colli.find((x) => !x.caricato);
      setSbagliato(i ? `Questo è della spedizione ${i.cliente}. Rimettilo${i.posto ? ' in ' + i.posto : ' al suo posto'} e prendi quello giusto${giusto?.posto ? ' da ' + giusto.posto : ''}.`
        : 'Questo codice non è di nessuna spedizione: chiedi all’ufficio.');
      return;
    }
    setSbagliato(null);
    const r = await az.esegui(() => db.rpc('scansiona_collo', { p_codice: c, p_fase: 'Carico' }));
    if (r) vibra();
  };
  usePistola(u ? (c) => { leggi(c); } : null);
  if (!uscite) return <div className="pscr">{back}<div className="lbl">Carico le spedizioni…</div></div>;
  if (!u) return (
    <div className="pscr">{back}
      <div><div className="lbl">{dataApp()}</div><div className="ptitle">Uscita</div></div>
      {uscite.length ? uscite.map((x, i) => <button key={x.bolla_id} type="button" className={'stop' + (x.caricati >= x.totale ? ' done' : '')} onClick={() => setSel(x.bolla_id)}>
        <span className="n">{i + 1}</span><span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><b style={{ fontSize: 16 }}>{x.cliente}</b><span className="lbl">{x.mezzo} · {x.autista}</span></span>
        <b style={{ fontSize: 12 }}>{x.caricati} di {x.totale}</b></button>) : <div className="lbl">Nessuna spedizione da caricare oggi.</div>}
    </div>);
  const n = u.colli.filter((x) => x.caricato).length, tot = u.colli.length, adesso = u.colli.findIndex((x) => !x.caricato);
  return (
    <div className="pscr">{uscite.length > 1 ? <button type="button" className="back" onClick={() => { setSel(null); setVia(false); setSbagliato(null); }}>Uscita</button> : back}
      <div><div className="lbl">Spedizione {u.cliente} · {u.mezzo} · {u.autista}</div><div className="ptitle">Uscita</div></div>
      {u.colli.map((k, i) => <div key={k.codice} className="pcard row between" style={{ padding: '12px 14px' }}>
        <span><b>Collo {i + 1} di {tot}</b><span className="lbl" style={{ display: 'block' }}>{k.posto ? 'prendi da ' + k.posto : k.codice}</span></span>
        {k.caricato ? <Pill tone="ok">Caricato</Pill> : i === adesso ? <Pill>Adesso</Pill> : null}</div>)}
      {sbagliato && <Esito ok={false} titolo="Collo sbagliato">{sbagliato}</Esito>}
      <ErroreApp testo={az.errore} />
      <div style={{ flex: 1 }} />
      {via ? <Esito ok titolo="Mezzo pronto a partire">{tot} colli su {tot} scansionati sul mezzo giusto.</Esito>
        : n < tot ? <button type="button" className="bigbtn" onClick={async () => { const c = await scan(`Collo ${n + 1} di ${tot}`, codici); if (c) leggi(c); }}>Scansiona il collo</button> : null}
      {!via && <button type="button" className={'bigbtn' + (n === tot ? '' : ' ghost')} onClick={() => { if (n === tot) { setVia(true); vibra(); } }}
        {...(n === tot ? {} : { disabled: true, style: { opacity: .4, cursor: 'not-allowed' } })}>{n === tot ? 'Spedizione completa: può partire' : 'Non parte finché mancano colli'}</button>}
    </div>
  );
}

function Sposta({ back }: { back: React.ReactNode }) {
  const { db } = useApp();
  const scan = useScan();
  const az = useAzione();
  const [tipo, setTipo] = useState<Tipo>('Bancale');
  const [info, setInfo] = useState<Info | null>(null);
  const [fatto, setFatto] = useState<{ cosa: string; da: string | null; a: string } | null>(null);
  const codici = useCodiciProva(info ? 'posto' : 'trasferisci', info ? info.proposto ?? null : tipo);
  const leggi = async (c: string) => {
    if (!info) {
      const i = await az.esegui(() => db.rpc<Info>('info_codice', { p_codice: c })); if (!i) return;
      if (i.tipo !== (tipo === 'Bancale' ? 'bancale' : 'collo')) { az.setErrore(tipo === 'Bancale' ? 'Questo è un collo: scegli «Collo» sopra' : 'Questo è un bancale: scegli «Bancale» sopra'); vibra([80, 60, 80]); return; }
      setInfo(i); vibra(); return;
    }
    // un collo va su un bancale (se il codice letto è un bancale) o in un posto
    const suBancale = tipo === 'Collo' && /^B-/i.test(c);
    const r = await az.esegui(() => suBancale ? db.rpc('collo_su_bancale', { p_codice: info.codice, p_bancale: c }) : db.rpc('metti_a_posto', { p_codice: info.codice, p_posto: c }));
    if (r) { vibra(); setFatto({ cosa: `${tipo} ${info.cliente}`, da: info.posto, a: suBancale ? 'bancale ' + c : c }); setInfo(null); }
  };
  usePistola(fatto ? null : (c) => { leggi(c); });
  const cambia = (t: Tipo) => { setTipo(t); setInfo(null); az.setErrore(null); };
  const passo = !info ? `1. Scansiona il ${tipo.toLowerCase()}` : tipo === 'Bancale' ? '2. Scansiona il posto nuovo' : '2. Scansiona il bancale o il posto nuovo';
  return (
    <div className="pscr">{back}
      <div className="ptitle">Trasferisci</div>
      <ErroreApp testo={az.errore} />
      {fatto ? <><Esito ok titolo="Trasferito">{fatto.cosa} {fatto.da ? 'da ' + fatto.da + ' ' : ''}a {fatto.a}.</Esito>
          <button type="button" className="btn ghost" onClick={() => setFatto(null)}>Trasferisci un altro</button></>
        : <><Seg v={tipo} onChange={cambia} />
          <div className="scanbox"><b style={{ fontSize: 18 }}>{passo}</b>
            <span className="lbl">{!info ? (tipo === 'Bancale' ? 'Etichetta del bancale' : 'Etichetta della scatola') : `${tipo} ${info.cliente}, adesso in ${info.posto ?? 'ricevimento'}`}</span></div>
          <button type="button" className="bigbtn" onClick={async () => { const c = await scan(passo.slice(3), codici); if (c) leggi(c); }}>
            {!info ? `Scansiona ${tipo.toLowerCase()}` : tipo === 'Bancale' ? 'Scansiona posto' : 'Scansiona bancale o posto'}</button></>}
    </div>
  );
}

function Missione({ back, posti, nome, breve }: { back: React.ReactNode; posti: PostoMissione[]; nome: string; breve: string }) {
  const { db } = useApp();
  const scan = useScan();
  const az = useAzione();
  const [cur, setCur] = useState<string | null>(null);
  const [extra, setExtra] = useState<Record<string, string[]>>({});
  const [msg, setMsg] = useState('');
  const p = posti.find((x) => x.id === cur) ?? null;
  const codici = useCodiciProva('missione', p?.id ?? null, p?.letti);
  const leggi = async (c: string) => {
    if (!p) return;
    const r = await az.esegui(() => db.rpc<{ articolo: string | null; extra: boolean; chiuso: boolean }>('scansiona_missione', { p_posto: p.id, p_codice: c }));
    if (!r) return;
    if (r.extra) { vibra([120, 80, 120]); setExtra((e) => ({ ...e, [p.id]: [...new Set([...(e[p.id] ?? []), c])] })); }
    else vibra();
    if (r.chiuso) { setMsg(`${p.posto}: tutto torna, posto chiuso.`); setCur(null); }
  };
  usePistola(p && p.stato === 'Da fare' ? (c) => { leggi(c); } : null);
  const done = posti.filter((x) => x.stato !== 'Da fare').length;
  if (!p) return (
    <div className="pscr">{back}
      <div><div className="lbl">Mandata dall’ufficio</div><div className="ptitle">{posti.length ? 'Missione · ' + (breve || nome) : 'Missioni'}</div></div>
      {posti.length ? <><div className="bar"><i style={{ width: Math.round(done / posti.length * 100) + '%' }} /></div><div className="lbl">{done} di {posti.length} posti · salvato a ogni scansione</div></> : <div className="lbl">Nessuna missione aperta.</div>}
      {msg && <div className="pcard" style={{ padding: '12px 14px', border: '2px solid var(--ok)', background: 'var(--ok-soft)' }}><b style={{ color: 'var(--ok)' }}>{msg}</b></div>}
      <ErroreApp testo={az.errore} />
      {posti.map((x, i) => <button key={x.id} type="button" className={'stop' + (x.stato === 'Fatto' || x.stato === 'Sbloccato' ? ' done' : '')}
        style={x.stato === 'Bloccato' ? { border: '2px solid var(--alert)', background: 'var(--alert-soft)' } : undefined}
        onClick={() => { if (x.stato === 'Da fare') { setCur(x.id); setMsg(''); az.setErrore(null); } }}>
        <span className="n">{i + 1}</span><span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><b style={{ fontSize: 16 }}>{x.posto}</b><span className="lbl">{x.pezzi === 1 ? '1 pezzo' : x.pezzi + ' pezzi'}</span></span>
        <b style={{ fontSize: 12, ...(x.stato === 'Bloccato' ? { color: 'var(--alert)' } : {}) }}>{x.stato === 'Da fare' ? '' : x.stato}</b></button>)}
      {posti.length > 0 && (done === posti.length
        ? <div className="pcard" style={{ padding: 14, textAlign: 'center' }}><b>Missione finita</b><div className="lbl" style={{ marginTop: 4 }}>{posti.some((x) => x.stato === 'Bloccato') ? 'I posti bloccati li sblocca l’ufficio.' : 'Tutto torna.'}</div></div>
        : <div className="lbl">Se arriva un camion puoi uscire: quando torni riparti da qui.</div>)}
    </div>);
  const righe = p.elenco.flatMap((e) => Array.from({ length: e.pezzi }, (_, j) => ({ articolo: e.articolo, ok: j < e.letti })));
  const ex = extra[p.id] ?? [], nEx = Math.max(p.extra, ex.length), letti = p.letti - nEx;
  const manca = righe.filter((r) => !r.ok).map((r) => r.articolo);
  const nonTorna = nEx > 0;
  return (
    <div className="pscr"><button type="button" className="back" onClick={() => setCur(null)}>Missione</button>
      <div><div className="lbl">Scansiona i pezzi nell’ordine che vuoi</div><div className="ptitle">{p.posto}</div></div>
      <div className="lbl">{letti} di {p.pezzi}</div>
      {righe.map((r, j) => <div key={j} className="pcard row between" style={{ padding: '12px 14px', ...(r.ok ? { opacity: .5 } : {}) }}><span>{r.articolo}</span><b style={{ fontSize: 13 }}>{r.ok ? '✓' : ''}</b></div>)}
      {Array.from({ length: nEx }, (_, j) => <div key={'x' + j} className="pcard row between" style={{ padding: '12px 14px', border: '2px solid var(--alert)', background: 'var(--alert-soft)' }}>
        <span>{ex[j] ?? 'Pezzo in più'}</span><b style={{ fontSize: 13, color: 'var(--alert)' }}>Extra</b></div>)}
      {p.pezzi === 0 && nEx === 0 && <div className="lbl">Qui non dovrebbe esserci niente.</div>}
      <ErroreApp testo={az.errore} />
      <div style={{ flex: 1 }} />
      {nonTorna && <Esito ok={false} titolo="Non torna">{manca.length ? 'Manca: ' + manca.join(', ') + '. ' : ''}{'In più: ' + (ex.length ? ex.join(', ') : nEx + ' pezzi') + '. '}Il posto non si chiude: va all’ufficio.</Esito>}
      {p.pezzi === 0 && nEx === 0
        ? <button type="button" className="bigbtn" onClick={async () => { const r = await az.esegui(() => db.rpc('posto_vuoto', { p_posto: p.id })); if (r !== undefined) { setMsg(`${p.posto}: vuoto, posto chiuso.`); setCur(null); } }}>Vuoto</button>
        : null}
      <button type="button" className={'bigbtn' + (p.pezzi === 0 && nEx === 0 ? ' ghost' : '')} onClick={async () => { const c = await scan('Scansiona un pezzo', codici); if (c) leggi(c); }}>Scansiona</button>
      <button type="button" className="bigbtn ghost" onClick={async () => { const r = await az.esegui(() => db.rpc('segnala_posto', { p_posto: p.id })); if (r !== undefined) setCur(null); }}>Segnala</button>
    </div>
  );
}
