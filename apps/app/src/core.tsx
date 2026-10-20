// Nucleo dell'App Messina: dati, utente e piccoli aiuti comuni alle schermate.
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Db } from '@messina/dati';

export type Ruolo = 'direzione' | 'amministrazione' | 'commerciale' | 'bolle' | 'traffico' | 'magazzino' | 'autista' | 'vendite' | 'stage' | 'cliente';
export interface Profilo { id: string; azienda: 'trasporti' | 'corporation'; ruolo: Ruolo; nome: string; cliente_id: string | null }
export interface Dipendente { id: string; nome: string; mansione: string; reparto?: string | null; ore_settimana?: number | null; azienda: string }

interface Ctx { db: Db; io: Profilo; dip: Dipendente | null; aggiorna: () => void; giro: number }
export const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => useContext(AppCtx)!;

export function useDati<T>(carica: (db: Db) => PromiseLike<T>, deps: unknown[] = []) {
  const { db, giro } = useApp();
  const [dati, setDati] = useState<T | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivo = true;
    Promise.resolve(carica(db)).then((d) => { if (vivo) { setDati(d); setErrore(null); } }, (e) => { if (vivo) setErrore(String(e?.message ?? e)); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, giro, n, ...deps]);
  return { dati, errore, ricarica: () => setN((x) => x + 1) };
}

export function useAzione() {
  const { aggiorna } = useApp();
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const esegui = useCallback(async <T,>(fn: () => PromiseLike<T>): Promise<T | undefined> => {
    setInCorso(true); setErrore(null);
    try { const r = await fn(); aggiorna(); return (r === undefined ? null : r) as T; }  // undefined = fallita
    catch (e) { setErrore(String((e as Error).message ?? e)); vibra([80, 60, 80]); return undefined; }
    finally { setInCorso(false); }
  }, [aggiorna]);
  return { esegui, errore, inCorso, setErrore };
}

export const vibra = (p: number | number[] = 40) => { try { navigator.vibrate?.(p); } catch { /* iPhone: niente vibrazione dal web */ } };

/** «Martedì 20 ottobre» come nel mockup */
export const dataApp = () => { const s = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }); return s[0].toUpperCase() + s.slice(1); };
export const hm = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '—';
export const Mese = () => { const m = new Date().toLocaleDateString('it-IT', { month: 'long' }); return m[0].toUpperCase() + m.slice(1); };

/** posizione del telefono per lo storico della consegna (se l'autista l'ha permessa).
 *  Su iPhone una web app non può seguire il GPS quando è chiusa: si legge solo nel momento
 *  della consegna, con l'app aperta. Il tracciamento continuo arriva dai mezzi (Telepass/GPS di bordo). */
export function posizione(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((ok) => {
    if (!navigator.geolocation) return ok(null);
    const t = setTimeout(() => ok(null), 4000);
    navigator.geolocation.getCurrentPosition((p) => { clearTimeout(t); ok({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => { clearTimeout(t); ok(null); }, { enableHighAccuracy: true, timeout: 4000, maximumAge: 60000 });
  });
}

export const off = { disabled: true, style: { opacity: .35, cursor: 'not-allowed' } } as const;

/** cerchio numerato dei blocchi (num del mockup) */
export function Num({ n, fatto }: { n: number | string; fatto: boolean }) {
  return <span style={{ width: 30, height: 30, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flex: 'none',
    ...(fatto ? { background: 'var(--ok)', color: '#fff' } : { border: '2px solid currentColor' }) }}>{fatto ? '✓' : n}</span>;
}

/** riquadro verde o rosso delle app (esito) */
export function Esito({ ok, titolo, children }: { ok: boolean; titolo: React.ReactNode; children?: React.ReactNode }) {
  return <div className="pcard" style={{ padding: 14, border: `2px solid var(--${ok ? 'ok' : 'alert'})`, background: `var(--${ok ? 'ok' : 'alert'}-soft)` }}>
    <b style={{ color: `var(--${ok ? 'ok' : 'alert'})` }}>{titolo}</b>{children !== undefined && <div style={{ fontSize: 14, marginTop: 4 }}>{children}</div>}</div>;
}

export function ErroreApp({ testo }: { testo: string | null }) {
  return testo ? <Esito ok={false} titolo={testo} /> : null;
}
