// Nucleo dei due gestionali: collegamento ai dati, utente, menu e cornice (shell) identica al mockup.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Db } from '@messina/dati';
import { Badge, Btn, Msg, Pill, Search, KI } from '@messina/ui';

export type Ruolo = 'direzione' | 'amministrazione' | 'commerciale' | 'bolle' | 'traffico' | 'magazzino' | 'autista' | 'vendite' | 'stage' | 'cliente';
export interface Profilo { id: string; azienda: 'trasporti' | 'corporation'; ruolo: Ruolo; nome: string; cliente_id: string | null }

interface Ctx { db: Db; io: Profilo; vai: (p: string) => void; percorso: string; aggiorna: () => void; giro: number }
export const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => useContext(AppCtx)!;

/** carica dati; si ricarica dopo ogni azione (giro) e quando cambiano le dipendenze */
export function useDati<T>(carica: (db: Db) => PromiseLike<T>, deps: unknown[] = []) {
  const { db, giro } = useApp();
  const [dati, setDati] = useState<T | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    Promise.resolve(carica(db)).then((d) => { if (vivo) { setDati(d); setErrore(null); } }, (e) => { if (vivo) setErrore(String(e?.message ?? e)); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, giro, ...deps]);
  return { dati, errore };
}

/** esegue un'azione sul database: se le regole la bloccano mostra il motivo, poi ricarica tutto */
export function useAzione() {
  const { aggiorna } = useApp();
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const esegui = useCallback(async (fn: () => PromiseLike<unknown>) => {
    setInCorso(true); setErrore(null);
    try { await fn(); aggiorna(); return true; }
    catch (e) { setErrore(String((e as Error).message ?? e)); return false; }
    finally { setInCorso(false); }
  }, [aggiorna]);
  return { esegui, errore, inCorso, pulisci: () => setErrore(null) };
}

/** stato della pagina che sopravvive al ricaricamento dei dati (come S.t del mockup) */
export function useStato<T>(iniziale: T): [T, (p: Partial<T> | ((s: T) => Partial<T>)) => void] {
  const [s, set] = useState(iniziale);
  return [s, useCallback((p) => set((x) => ({ ...x, ...(typeof p === 'function' ? p(x) : p) })), [])];
}

// ------------------------------------------------------------------ menu
export interface Voce { id: string; nome: string; ruoli?: Ruolo[]; badge?: number }

/** T_NAV del mockup, con chi può vedere ogni sezione */
export const T_NAV: Voce[] = [
  { id: 'home', nome: 'Home' },
  { id: 'anomalie', nome: 'Anomalie' },
  { id: 'mail', nome: 'Mail', ruoli: ['bolle', 'commerciale', 'traffico'] },
  { id: 'bolle', nome: 'Bolle', ruoli: ['bolle', 'traffico'] },
  { id: 'traffico', nome: 'Traffico', ruoli: ['traffico'] },
  { id: 'magazzino', nome: 'Magazzino', ruoli: ['magazzino', 'traffico', 'bolle'] },
  { id: 'giacenze', nome: 'Giacenze', ruoli: ['bolle', 'traffico'] },
  { id: 'clienti', nome: 'Clienti', ruoli: ['commerciale', 'amministrazione', 'bolle'] },
  { id: 'fatture', nome: 'Fatturazione', ruoli: ['amministrazione'] },
  { id: 'mezzi', nome: 'Mezzi', ruoli: ['traffico', 'amministrazione'] },
  { id: 'autisti', nome: 'Autisti', ruoli: ['traffico', 'amministrazione'] },
  { id: 'telepass', nome: 'Telepass', ruoli: ['amministrazione', 'traffico'] },
  { id: 'satellitare', nome: 'Satellitare', ruoli: [] },   // solo direzione
  { id: 'presenze', nome: 'Presenze', ruoli: ['amministrazione'] },
  { id: 'telecamere', nome: 'Telecamere', ruoli: [] },     // solo direzione
];
/** C_NAV del mockup */
export const C_NAV: Voce[] = [
  { id: 'home', nome: 'Home' },
  { id: 'mail', nome: 'Mail', ruoli: ['vendite', 'stage'] },
  { id: 'lotti', nome: 'Lotti', ruoli: ['vendite', 'amministrazione'] },
  { id: 'inv', nome: 'Inventario' },
  { id: 'ordini', nome: 'Ordini', ruoli: ['vendite', 'magazzino'] },
  { id: 'stage', nome: 'Stage Computer', ruoli: ['vendite', 'stage'] },
  { id: 'stageTel', nome: 'Stage Cellulari', ruoli: ['vendite', 'stage'] },
  { id: 'telecamere', nome: 'Telecamere', ruoli: [] },     // solo direzione: lo stesso capannone
];
export function vociPer(io: Profilo): Voce[] {
  const menu = io.azienda === 'trasporti' ? T_NAV : C_NAV;
  return menu.filter((v) => !v.ruoli || io.ruolo === 'direzione' || v.ruoli.includes(io.ruolo));
}

const dataLunga = () => { const s = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return s[0].toUpperCase() + s.slice(1); };

/** shell(company, navList, cur, act, title, body) del mockup */
export function Shell(p: { voci: Voce[]; titolo: string; cerca: string; onCerca: (v: string) => void; children: React.ReactNode }) {
  const { io, vai, percorso, db } = useApp();
  const company = io.azienda === 'trasporti' ? 'Autotrasporti' : 'Corporation';
  const cur = percorso.split('/')[0] || 'home';
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {  // sul telefono il menu scorre fino alla voce attiva, come nel mockup
    const n = nav.current; if (!n || window.innerWidth > 760) return;
    const on = n.querySelector<HTMLElement>('.nav.on'); if (on) n.scrollLeft = on.offsetLeft - n.clientWidth / 2 + on.clientWidth / 2;
  }, [cur]);
  return (
    <div className="wrap">
      <div className="gest">
        <nav className="side glass" aria-label={'Sezioni ' + company} ref={nav}>
          <div className="co"><b>MESSINA</b><span className="lbl">{company}</span></div>
          {p.voci.map((n) => (
            <button key={n.id} type="button" className={'nav' + (cur === n.id ? ' on' : '')} aria-current={cur === n.id ? 'page' : undefined}
              onClick={() => vai(n.id)}>{n.nome}<Badge n={n.badge ?? 0} /></button>
          ))}
          <button type="button" className="nav esci" onClick={() => db.auth.logout().then(() => location.reload())}>Esci</button>
        </nav>
        <div className="content">
          <div className="chead">
            <div><div className="lbl">{dataLunga()} · {company}{db.modo === 'prova' ? ' · Prova' : ''}</div><h2>{p.titolo}</h2></div>
            <div className="row"><Search id={'s-' + io.azienda} value={p.cerca} onChange={p.onCerca} /></div>
          </div>
          {p.children}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ mail (mailView del mockup)
export interface Mail { id: string; azienda: string; casella: string; cartella: string; etichetta: string | null; da_nome: string; da_indirizzo: string;
  oggetto: string; anteprima: string | null; testo: string | null; ricevuta_il: string; allegati: { nome: string; percorso?: string }[]; stato: string; bozza: string | null; bolla_id: string | null }

const oraMail = (iso: string) => { const d = new Date(iso), o = new Date(); if (d.toDateString() === o.toDateString()) return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const i = new Date(o); i.setDate(o.getDate() - 1); return d.toDateString() === i.toDateString() ? 'Ieri' : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }); };

export function MailView(p: { azienda: 'trasporti' | 'corporation'; cartelle: string[]; azione: (m: Mail) => { btn: React.ReactNode; msg: React.ReactNode } ; onCambia?: () => void }) {
  const { db } = useApp();
  const [s, set] = useStato({ cart: 'In arrivo', mail: '' as string, msg: '', reply: false, bozza: '', scrivi: false, a: '', ogg: '' });
  const { dati: mails } = useDati((d) => d.from<Mail>('mail').select('*').eq('azienda', p.azienda).order('ricevuta_il', { ascending: false }).limit(200), []);
  const { dati: inviate } = useDati((d) => d.from<any>('mail_uscita').select('*').eq('azienda', p.azienda).order('creata_il', { ascending: false }).limit(50), []);
  const az = useAzione();
  if (!mails) return null;
  const filt = mails.filter((m) => s.cart === 'In arrivo' || m.cartella === s.cart);
  const cur = mails.find((m) => m.id === s.mail) ?? filt[0] ?? mails[0];
  const count = (c: string) => c === 'Inviate' ? '' : c === 'In arrivo' ? mails.length : mails.filter((m) => m.cartella === c).length;
  const apri = (m: Mail) => { set({ mail: m.id, msg: '', reply: false, scrivi: false }); if (m.stato === 'Da leggere') db.from('mail').update({ stato: 'Letta' }).eq('id', m.id).then(() => {}, () => {}); };
  const invia = () => az.esegui(() => db.fn('mail-outlook', s.scrivi ? { azione: 'scrivi', azienda: p.azienda, a: s.a, oggetto: s.ogg, testo: s.bozza } : { azione: 'rispondi', mail_id: cur!.id, testo: s.bozza }))
    .then((ok) => ok && set({ reply: false, scrivi: false, msg: 'inviata' }));
  const inoltra = () => set({ msg: 'inoltrata', reply: false });
  const assegna = () => set({ msg: 'assegnata', reply: false });
  const ab = cur ? p.azione(cur) : { btn: null, msg: null };
  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
      <div className="glass" style={{ flex: '0 1 190px', padding: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Btn sm onClick={() => set({ scrivi: true, reply: false, bozza: '', a: '', ogg: '', msg: '' })}>Scrivi</Btn>
        {p.cartelle.map((c) => (
          <button key={c} type="button" className={'nav' + (s.cart === c ? ' on' : '')} style={{ display: 'flex', justifyContent: 'space-between' }}
            onClick={() => { set({ cart: c, msg: '', reply: false }); const f = mails.find((m) => c === 'In arrivo' || m.cartella === c); if (f) set({ mail: f.id }); }}>
            <span>{c}</span><span>{count(c)}</span></button>
        ))}
      </div>
      <div className="glass" style={{ flex: '1 1 260px', padding: 8, minWidth: 0 }}><div className="list">
        {s.cart === 'Inviate'
          ? (inviate?.length ? inviate.map((m) => <div key={m.id} className="li"><span className="row between" style={{ width: '100%' }}><b>{m.a}</b><span className="lbl">{oraMail(m.creata_il)}</span></span><span style={{ fontWeight: 600, fontSize: 14 }}>{m.oggetto}</span><span className="lbl">{m.errore ? 'Non inviata: ' + m.errore : m.inviata_il ? 'Inviata' : 'In uscita'}</span></div>)
            : <div className="lbl" style={{ padding: 14 }}>Nessuna mail inviata.</div>)
          : filt.length ? filt.map((m) => (
            <button key={m.id} type="button" className={'li' + (cur?.id === m.id ? ' on' : '')} onClick={() => apri(m)}>
              <span className="row between" style={{ width: '100%' }}><b>{m.da_nome}</b><span className="lbl">{oraMail(m.ricevuta_il)}</span></span>
              <span style={{ fontWeight: m.stato === 'Da leggere' ? 800 : 600, fontSize: 14 }}>{m.oggetto}</span><span className="lbl">{m.anteprima}</span>
            </button>)) : <div className="lbl" style={{ padding: 14 }}>Nessuna mail in questa cartella.</div>}
      </div></div>
      <div className="glass card stack" style={{ flex: '2 1 400px', minWidth: 0 }}>
        {s.scrivi ? (
          <div className="stack" style={{ gap: 8 }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em' }}>Nuova mail</div>
            <label className="field"><span className="lbl">A</span><input className="input" type="email" value={s.a} onChange={(e) => set({ a: e.target.value })} /></label>
            <label className="field"><span className="lbl">Oggetto</span><input className="input" value={s.ogg} onChange={(e) => set({ ogg: e.target.value })} /></label>
            <textarea aria-label="Testo" value={s.bozza} onChange={(e) => set({ bozza: e.target.value })} />
            {az.errore && <div className="warn">{az.errore}</div>}
            <div className="row"><Btn onClick={invia} disabled={az.inCorso || !s.a || !s.ogg}>Invia</Btn><Btn ghost onClick={() => set({ scrivi: false })}>Annulla</Btn></div>
          </div>
        ) : cur ? (<>
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <div><div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em' }}>{cur.oggetto}</div><div className="lbl">{cur.da_nome} · {cur.da_indirizzo} · {oraMail(cur.ricevuta_il)}</div></div>
            {cur.etichetta && <Pill>{cur.etichetta}</Pill>}
          </div>
          <div style={{ whiteSpace: 'pre-line', lineHeight: 1.6 }}>{cur.testo}</div>
          {cur.allegati?.map((a) => <AllegatoMail key={a.nome} a={a} />)}
          {s.msg === 'inviata' && <Msg>Risposta inviata dalla casella aziendale.</Msg>}
          {s.msg === 'inoltrata' && <Msg>Mail inoltrata.</Msg>}
          {s.msg === 'assegnata' && <Msg>Mail assegnata a un collega: la vede nella sua coda.</Msg>}
          {ab.msg}
          {s.reply && <div className="stack" style={{ gap: 8 }}>
            <label className="lbl" htmlFor={p.azienda + '-risposta'}>Risposta preparata dal programma, da controllare</label>
            <textarea id={p.azienda + '-risposta'} value={s.bozza} onChange={(e) => set({ bozza: e.target.value })} />
            {az.errore && <div className="warn">{az.errore}</div>}
            <div className="row"><Btn onClick={invia} disabled={az.inCorso}>Invia</Btn><Btn ghost onClick={() => set({ reply: false })}>Annulla</Btn></div>
          </div>}
          <div className="row" style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            {ab.btn}
            <Btn ghost onClick={() => set({ reply: true, msg: '', bozza: cur.bozza ?? '' })}>Rispondi</Btn>
            <Btn ghost onClick={inoltra}>Inoltra</Btn>
            <Btn ghost onClick={assegna}>Assegna a un collega</Btn>
          </div>
        </>) : <div className="lbl">Nessuna mail.</div>}
      </div>
    </div>
  );
}

function AllegatoMail({ a }: { a: { nome: string; percorso?: string } }) {
  const { db } = useApp();
  const apri = async () => { if (!a.percorso) return; const u = await db.storage.link('documenti', a.percorso); if (u) window.open(u, '_blank', 'noopener'); };
  return <button type="button" className="row pill" style={{ alignSelf: 'flex-start', padding: '8px 12px', fontSize: 14, border: 0, cursor: a.percorso ? 'pointer' : 'default', font: 'inherit' }} onClick={apri}>{KI.clip()}{a.nome}</button>;
}

// ------------------------------------------------------------------ piccoli aiuti
export const giornoLungo = (d: string | null | undefined) => { if (!d) return '—'; const s = new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }); return s[0].toUpperCase() + s.slice(1); };
export const giornoCorto = (d: string | null | undefined) => { if (!d) return '—'; const x = new Date(d + (d.length === 10 ? 'T12:00:00' : '')), o = new Date();
  if (x.toDateString() === o.toDateString()) return 'Oggi'; const i = new Date(o); i.setDate(o.getDate() - 1); if (x.toDateString() === i.toDateString()) return 'Ieri';
  const s = x.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long' }); return s[0].toUpperCase() + s.slice(1); };
export const hm = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '—';
export const quando = (iso: string | null | undefined) => { if (!iso) return '—'; const g = giornoCorto(iso); return (g === 'Oggi' ? '' : g + ' ') + hm(iso); };
export const meseNome = (d = new Date()) => d.toLocaleDateString('it-IT', { month: 'long' });
export const Mese = () => { const m = meseNome(); return m[0].toUpperCase() + m.slice(1); };
export const num = (n: number | null | undefined) => (n ?? 0).toLocaleString('it-IT');
export const eur = (n: number | null | undefined) => '€ ' + (n ?? 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const eur0 = (n: number | null | undefined) => '€ ' + Math.round(n ?? 0).toLocaleString('it-IT');
export const oggiISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
export const domaniISO = () => { const d = new Date(); d.setDate(d.getDate() + 1); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
export const meseISO = () => oggiISO().slice(0, 7);

export function Errore({ testo }: { testo: string | null }) { return testo ? <div className="warn">{testo}</div> : null; }
export function Tabella(p: { colonne: string[]; minWidth?: number; nw?: boolean; children: React.ReactNode; vuoto?: string; righe?: number }) {
  return <div className="glass tbox"><table className={'t' + (p.nw ? ' nw' : '')} style={p.minWidth ? { minWidth: p.minWidth } : undefined}>
    <thead><tr>{p.colonne.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
    <tbody>{p.righe === 0 ? <tr><td colSpan={p.colonne.length} className="lbl">{p.vuoto ?? 'Niente da mostrare.'}</td></tr> : p.children}</tbody></table></div>;
}
